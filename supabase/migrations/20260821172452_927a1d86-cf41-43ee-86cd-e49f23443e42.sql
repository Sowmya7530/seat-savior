
revoke all on function public.ensure_profile(text, text) from public, anon;
revoke all on function public.hold_seats(uuid, uuid[]) from public, anon;
revoke all on function public.release_my_holds(uuid) from public, anon;
revoke all on function public.confirm_booking(uuid, uuid[], text, text) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;
revoke all on function public.join_waitlist(uuid, text) from public, anon;
revoke all on function public.leave_waitlist(uuid) from public, anon;
revoke all on function public.claim_offer(uuid) from public, anon;
revoke all on function public.create_show_seats(uuid) from public, anon, authenticated;
revoke all on function public.sweep_expirations() from public, anon, authenticated;
revoke all on function public.offer_seat_to_next(uuid) from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;

grant execute on function public.ensure_profile(text, text) to authenticated;
grant execute on function public.hold_seats(uuid, uuid[]) to authenticated;
grant execute on function public.release_my_holds(uuid) to authenticated;
grant execute on function public.confirm_booking(uuid, uuid[], text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.join_waitlist(uuid, text) to authenticated;
grant execute on function public.leave_waitlist(uuid) to authenticated;
grant execute on function public.claim_offer(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.create_show_seats(uuid) to service_role;
grant execute on function public.sweep_expirations() to service_role;
grant execute on function public.offer_seat_to_next(uuid) to service_role;
