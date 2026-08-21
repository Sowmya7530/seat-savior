
-- ============ helpers ============
create or replace function public.ensure_profile(p_full_name text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_role public.app_role;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.profiles(id, email, full_name)
  values (v_uid, coalesce(v_email,''), coalesce(p_full_name,''))
  on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
  if not exists (select 1 from public.user_roles where user_id = v_uid) then
    v_role := case when p_role = 'organiser' then 'organiser'::public.app_role else 'customer'::public.app_role end;
    insert into public.user_roles(user_id, role) values (v_uid, v_role) on conflict do nothing;
  end if;
end $$;

create or replace function public.create_show_seats(p_event_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.show_seats(event_id, venue_seat_id, row_label, seat_number, category)
  select e.id, vs.id, vs.row_label, vs.seat_number, vs.category
  from public.events e join public.venue_seats vs on vs.venue_id = e.venue_id
  where e.id = p_event_id
  on conflict (event_id, venue_seat_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- offer a freed seat to the next person waiting in that category
create or replace function public.offer_seat_to_next(p_seat_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; w record; v_token uuid; v_title text;
begin
  select * into s from public.show_seats where id = p_seat_id for update;
  if not found or s.status = 'booked' then return null; end if;

  select * into w from public.waitlist
  where event_id = s.event_id and category = s.category and status = 'waiting'
  order by joined_at asc limit 1 for update skip locked;

  if not found then
    update public.show_seats set status='available', held_by=null, hold_expires_at=null,
      hold_kind=null, booking_id=null, version=version+1 where id = p_seat_id;
    return null;
  end if;

  v_token := gen_random_uuid();
  update public.show_seats set status='held', held_by=w.user_id,
    hold_expires_at = now() + make_interval(secs => w.offer_ttl_seconds),
    hold_kind='waitlist', booking_id=null, version=version+1
  where id = p_seat_id;

  update public.waitlist set status='offered', offer_token=v_token,
    offer_expires_at = now() + make_interval(secs => w.offer_ttl_seconds),
    offered_seat_id = p_seat_id, updated_at = now()
  where id = w.id;

  select title into v_title from public.events where id = s.event_id;

  insert into public.email_outbox(to_email, subject, html, kind)
  values (w.email, 'A seat opened up for ' || coalesce(v_title,'your event'),
    '<h2>Your waitlist seat is ready</h2><p>Seat <b>' || s.row_label || s.seat_number ||
    '</b> (' || s.category || ') for <b>' || coalesce(v_title,'') || '</b> is reserved for you for ' ||
    (w.offer_ttl_seconds/60)::text || ' minutes.</p><p><a href="/claim/' || v_token::text ||
    '">Claim your seat</a></p><p>Claim code: ' || v_token::text || '</p>', 'waitlist_offer');

  return w.id;
end $$;

-- TTL sweeper: expire waitlist offers first (re-offer), then plain holds
create or replace function public.sweep_expirations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; n_offers int := 0; n_holds int := 0;
begin
  for w in select * from public.waitlist where status='offered' and offer_expires_at < now() loop
    update public.waitlist set status='expired', offer_token=null, updated_at=now() where id = w.id;
    n_offers := n_offers + 1;
    if w.offered_seat_id is not null then perform public.offer_seat_to_next(w.offered_seat_id); end if;
  end loop;

  update public.show_seats set status='available', held_by=null, hold_expires_at=null,
    hold_kind=null, version=version+1
  where status='held' and hold_expires_at < now();
  get diagnostics n_holds = row_count;

  return jsonb_build_object('expired_offers', n_offers, 'released_holds', n_holds);
end $$;

-- ============ seat holds (atomic, all-or-nothing) ============
create or replace function public.hold_seats(p_event_id uuid, p_seat_ids uuid[])
returns table(seat_id uuid, hold_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ttl int; v_expires timestamptz; v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if array_length(p_seat_ids,1) is null then raise exception 'no seats selected'; end if;
  if array_length(p_seat_ids,1) > 10 then raise exception 'at most 10 seats per booking'; end if;

  select hold_ttl_seconds into v_ttl from public.events where id = p_event_id;
  if v_ttl is null then raise exception 'unknown event'; end if;
  v_expires := now() + make_interval(secs => v_ttl);

  -- release this user's other holds on the same show (single active selection)
  update public.show_seats set status='available', held_by=null, hold_expires_at=null,
    hold_kind=null, version=version+1
  where event_id = p_event_id and status='held' and held_by = v_uid
    and hold_kind is distinct from 'waitlist' and not (id = any(p_seat_ids));

  -- single set-based CAS: only rows still free (or free-by-expiry, or already mine) flip
  with claimed as (
    update public.show_seats s set status='held', held_by=v_uid, hold_expires_at=v_expires,
      hold_kind = coalesce(s.hold_kind,'checkout'), version = s.version + 1
    where s.id = any(p_seat_ids) and s.event_id = p_event_id
      and (s.status = 'available'
        or (s.status = 'held' and s.hold_expires_at < now())
        or (s.status = 'held' and s.held_by = v_uid))
    returning s.id, s.hold_expires_at
  )
  select count(*) into v_count from claimed;

  if v_count <> array_length(p_seat_ids,1) then
    raise exception 'SEAT_TAKEN: one or more seats were just taken by someone else';
  end if;

  return query select s.id, s.hold_expires_at from public.show_seats s where s.id = any(p_seat_ids);
end $$;

create or replace function public.release_my_holds(p_event_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update public.show_seats set status='available', held_by=null, hold_expires_at=null,
    hold_kind=null, version=version+1
  where event_id = p_event_id and status='held' and held_by = v_uid and hold_kind is distinct from 'waitlist';
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ booking ============
create or replace function public.confirm_booking(p_event_id uuid, p_seat_ids uuid[], p_name text, p_email text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ref text; v_total numeric(10,2) := 0; b public.bookings; v_ok int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select count(*) into v_ok from public.show_seats
  where id = any(p_seat_ids) and event_id = p_event_id and status='held'
    and held_by = v_uid and hold_expires_at > now();
  if v_ok <> coalesce(array_length(p_seat_ids,1),0) then
    raise exception 'HOLD_EXPIRED: your seat hold expired, please pick seats again';
  end if;

  select coalesce(sum(coalesce(p.price,0)),0) into v_total
  from public.show_seats s
  left join public.event_prices p on p.event_id = s.event_id and p.category = s.category
  where s.id = any(p_seat_ids);

  v_ref := 'BK-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,10));

  insert into public.bookings(reference, event_id, user_id, customer_name, customer_email, total)
  values (v_ref, p_event_id, v_uid, coalesce(p_name,''), coalesce(p_email,''), v_total)
  returning * into b;

  update public.show_seats set status='booked', booking_id=b.id, held_by=v_uid,
    hold_expires_at=null, hold_kind=null, version=version+1
  where id = any(p_seat_ids);

  insert into public.booking_seats(booking_id, show_seat_id, price)
  select b.id, s.id, coalesce(p.price,0) from public.show_seats s
  left join public.event_prices p on p.event_id = s.event_id and p.category = s.category
  where s.id = any(p_seat_ids);

  update public.waitlist set status='converted', offer_token=null, updated_at=now()
  where user_id = v_uid and event_id = p_event_id and status='offered' and offered_seat_id = any(p_seat_ids);

  return b;
end $$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); b public.bookings; s record; n int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'unknown booking'; end if;
  if b.user_id <> v_uid and not public.has_role(v_uid,'admin') then raise exception 'not your booking'; end if;
  if b.status = 'cancelled' then return 0; end if;

  update public.bookings set status='cancelled', cancelled_at=now() where id = b.id;

  for s in select id from public.show_seats where booking_id = b.id loop
    update public.show_seats set status='available', held_by=null, booking_id=null,
      hold_expires_at=null, hold_kind=null, version=version+1 where id = s.id;
    perform public.offer_seat_to_next(s.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============ waitlist ============
create or replace function public.join_waitlist(p_event_id uuid, p_category text)
returns public.waitlist language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; w public.waitlist;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select email into v_email from public.profiles where id = v_uid;
  select * into w from public.waitlist where event_id=p_event_id and category=p_category
    and user_id=v_uid and status in ('waiting','offered');
  if found then return w; end if;
  insert into public.waitlist(event_id, category, user_id, email)
  values (p_event_id, p_category, v_uid, coalesce(v_email,'')) returning * into w;
  return w;
end $$;

create or replace function public.leave_waitlist(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.waitlist set status='cancelled', updated_at=now()
  where id = p_id and user_id = auth.uid() and status = 'waiting';
end $$;

create or replace function public.claim_offer(p_token uuid)
returns table(event_id uuid, seat_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); w public.waitlist;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into w from public.waitlist where offer_token = p_token for update;
  if not found then raise exception 'OFFER_INVALID: this claim link is not valid'; end if;
  if w.user_id <> v_uid then raise exception 'OFFER_INVALID: this offer belongs to another account'; end if;
  if w.status <> 'offered' or w.offer_expires_at < now() then raise exception 'OFFER_EXPIRED: this offer has expired'; end if;
  return query select w.event_id, w.offered_seat_id, w.offer_expires_at;
end $$;

revoke all on function public.offer_seat_to_next(uuid) from public, anon, authenticated;
revoke all on function public.create_show_seats(uuid) from public, anon;
revoke all on function public.sweep_expirations() from public, anon;

-- ============ scheduler ============
create extension if not exists pg_cron;
select cron.schedule('sweep-seat-holds', '* * * * *', $$select public.sweep_expirations();$$);

-- ============ demo data ============
insert into public.venues(id, name, city) values
  ('11111111-1111-1111-1111-111111111111','Aurora Cinema — Screen 1','Bengaluru'),
  ('22222222-2222-2222-2222-222222222222','Basalt Arena','Mumbai');

insert into public.venue_seats(venue_id, row_label, seat_number, category)
select '11111111-1111-1111-1111-111111111111', r, n,
  case when r in ('A','B') then 'Premium' when r in ('C','D') then 'Standard' else 'Economy' end
from unnest(array['A','B','C','D','E','F']) r, generate_series(1,12) n;

insert into public.venue_seats(venue_id, row_label, seat_number, category)
select '22222222-2222-2222-2222-222222222222', r, n,
  case when r = 'A' then 'Front Pit' when r in ('B','C') then 'Premium' else 'Standard' end
from unnest(array['A','B','C','D']) r, generate_series(1,10) n;

insert into public.events(id, venue_id, title, kind, description, poster_hue, starts_at, hold_ttl_seconds) values
  ('aaaaaaa1-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','Neon Harvest','movie','A rain-soaked heist thriller shot entirely at night.',22, now() + interval '2 days', 600),
  ('aaaaaaa1-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111','The Quiet Orbit','movie','Slow-burn science fiction about a lighthouse in deep space.',200, now() + interval '3 days', 600),
  ('aaaaaaa1-0000-4000-8000-000000000003','22222222-2222-2222-2222-222222222222','Midnight Brass Live','concert','Twelve-piece brass collective, one night only.',340, now() + interval '5 days', 600),
  ('aaaaaaa1-0000-4000-8000-000000000004','22222222-2222-2222-2222-222222222222','Static Bloom Tour','concert','Shoegaze revival with a full string section.',280, now() + interval '9 days', 600);

insert into public.event_prices(event_id, category, price) values
  ('aaaaaaa1-0000-4000-8000-000000000001','Premium',450),('aaaaaaa1-0000-4000-8000-000000000001','Standard',320),('aaaaaaa1-0000-4000-8000-000000000001','Economy',210),
  ('aaaaaaa1-0000-4000-8000-000000000002','Premium',400),('aaaaaaa1-0000-4000-8000-000000000002','Standard',280),('aaaaaaa1-0000-4000-8000-000000000002','Economy',180),
  ('aaaaaaa1-0000-4000-8000-000000000003','Front Pit',2500),('aaaaaaa1-0000-4000-8000-000000000003','Premium',1800),('aaaaaaa1-0000-4000-8000-000000000003','Standard',1100),
  ('aaaaaaa1-0000-4000-8000-000000000004','Front Pit',2100),('aaaaaaa1-0000-4000-8000-000000000004','Premium',1500),('aaaaaaa1-0000-4000-8000-000000000004','Standard',900);

select public.create_show_seats('aaaaaaa1-0000-4000-8000-000000000001');
select public.create_show_seats('aaaaaaa1-0000-4000-8000-000000000002');
select public.create_show_seats('aaaaaaa1-0000-4000-8000-000000000003');
select public.create_show_seats('aaaaaaa1-0000-4000-8000-000000000004');

-- make one show nearly sold out so the waitlist flow is demonstrable
update public.show_seats set status='booked'
where event_id = 'aaaaaaa1-0000-4000-8000-000000000003' and not (row_label = 'D' and seat_number > 8);
