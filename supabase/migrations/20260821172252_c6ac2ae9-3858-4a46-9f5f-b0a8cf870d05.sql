
create type public.app_role as enum ('customer','organiser','admin');
create type public.seat_status as enum ('available','held','booked');
create type public.booking_status as enum ('confirmed','cancelled');
create type public.waitlist_status as enum ('waiting','offered','converted','expired','cancelled');
create type public.event_kind as enum ('movie','concert');

-- ROLES -------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy user_roles_read_own on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- PROFILES ----------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy profiles_upsert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- VENUES ------------------------------------------------------------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  created_at timestamptz not null default now()
);
create table public.venue_seats (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  row_label text not null,
  seat_number int not null,
  category text not null,
  unique (venue_id, row_label, seat_number)
);
create index on public.venue_seats(venue_id);

grant select on public.venues to anon, authenticated;
grant select, insert, update, delete on public.venues to authenticated;
grant all on public.venues to service_role;
grant select on public.venue_seats to anon, authenticated;
grant select, insert, update, delete on public.venue_seats to authenticated;
grant all on public.venue_seats to service_role;
alter table public.venues enable row level security;
alter table public.venue_seats enable row level security;
create policy venues_public_read on public.venues for select using (true);
create policy venues_admin_write on public.venues for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy venue_seats_public_read on public.venue_seats for select using (true);
create policy venue_seats_admin_write on public.venue_seats for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- EVENTS ------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organiser_id uuid,
  venue_id uuid not null references public.venues(id) on delete restrict,
  title text not null,
  kind public.event_kind not null default 'movie',
  description text not null default '',
  poster_hue int not null default 30,
  starts_at timestamptz not null,
  hold_ttl_seconds int not null default 600,
  created_at timestamptz not null default now()
);
create table public.event_prices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  price numeric(10,2) not null default 0,
  unique (event_id, category)
);
grant select on public.events to anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
grant select on public.event_prices to anon, authenticated;
grant select, insert, update, delete on public.event_prices to authenticated;
grant all on public.event_prices to service_role;
alter table public.events enable row level security;
alter table public.event_prices enable row level security;
create policy events_public_read on public.events for select using (true);
create policy events_organiser_write on public.events for all to authenticated
  using (organiser_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  with check (organiser_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy prices_public_read on public.event_prices for select using (true);
create policy prices_organiser_write on public.event_prices for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and (e.organiser_id = auth.uid() or public.has_role(auth.uid(),'admin'))))
  with check (exists (select 1 from public.events e where e.id = event_id and (e.organiser_id = auth.uid() or public.has_role(auth.uid(),'admin'))));

-- BOOKINGS ----------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  customer_name text not null default '',
  customer_email text not null default '',
  total numeric(10,2) not null default 0,
  status public.booking_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
grant select on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
create policy bookings_read on public.bookings for select to authenticated
  using (user_id = auth.uid()
     or public.has_role(auth.uid(),'admin')
     or exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid()));

-- SEAT MAP ----------------------------------------------------------
create table public.show_seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_seat_id uuid not null references public.venue_seats(id) on delete cascade,
  row_label text not null,
  seat_number int not null,
  category text not null,
  status public.seat_status not null default 'available',
  held_by uuid,
  hold_expires_at timestamptz,
  hold_kind text,
  booking_id uuid references public.bookings(id) on delete set null,
  version int not null default 0,
  unique (event_id, venue_seat_id)
);
create index on public.show_seats(event_id, status);
create index on public.show_seats(hold_expires_at) where status = 'held';
grant select on public.show_seats to anon, authenticated;
grant all on public.show_seats to service_role;
alter table public.show_seats enable row level security;
create policy show_seats_public_read on public.show_seats for select using (true);

create table public.booking_seats (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  show_seat_id uuid not null references public.show_seats(id) on delete cascade,
  price numeric(10,2) not null default 0,
  primary key (booking_id, show_seat_id)
);
grant select on public.booking_seats to authenticated;
grant all on public.booking_seats to service_role;
alter table public.booking_seats enable row level security;
create policy booking_seats_read on public.booking_seats for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
    and (b.user_id = auth.uid() or public.has_role(auth.uid(),'admin')
      or exists (select 1 from public.events e where e.id = b.event_id and e.organiser_id = auth.uid()))));

-- WAITLIST ----------------------------------------------------------
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  user_id uuid not null,
  email text not null default '',
  seats_wanted int not null default 1,
  status public.waitlist_status not null default 'waiting',
  offer_token uuid,
  offer_expires_at timestamptz,
  offered_seat_id uuid references public.show_seats(id) on delete set null,
  offer_ttl_seconds int not null default 900,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.waitlist(event_id, category, status, joined_at);
grant select on public.waitlist to authenticated;
grant all on public.waitlist to service_role;
alter table public.waitlist enable row level security;
create policy waitlist_read on public.waitlist for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin')
     or exists (select 1 from public.events e where e.id = event_id and e.organiser_id = auth.uid()));

-- EMAIL OUTBOX ------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  html text not null,
  kind text not null default 'generic',
  booking_id uuid,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.email_outbox(status, created_at);
grant select on public.email_outbox to authenticated;
grant all on public.email_outbox to service_role;
alter table public.email_outbox enable row level security;
create policy outbox_read_own on public.email_outbox for select to authenticated
  using (to_email = (select email from public.profiles where id = auth.uid())
      or public.has_role(auth.uid(),'admin'));

alter publication supabase_realtime add table public.show_seats;
alter publication supabase_realtime add table public.waitlist;
