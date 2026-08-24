# SeatFlow — system design

## Data model

The pivot of the system is `show_seats`: one row per physical seat per show, cloned from the venue's
`venue_seats` layout when an organiser publishes a show. Because the seat map is materialised rather
than computed from bookings, the frontend renders the grid from a single indexed query
(`event_id, status`) and never has to reconcile "seats minus bookings minus holds". Every mutable fact
about a seat lives on that row: `status` (`available | held | booked`), `held_by`, `hold_expires_at`,
`hold_kind` (`checkout | waitlist`), `booking_id`, and a monotonic `version`. The row is published on
the realtime channel, so any status change repaints every browser watching that show; a 15-second
poll is kept as a cheap fallback for dropped sockets.

Bookings are separate from seats (`bookings` + `booking_seats`) so a cancellation is a status change
plus seat release, never a delete — history and revenue reporting stay intact.

## Seat hold and TTL

A hold is not a separate reservation record; it is a state on the seat row with an expiry timestamp.
`hold_seats(event_id, seat_ids[])` stamps `hold_expires_at = now() + events.hold_ttl_seconds`, so the
TTL is configurable per show by the organiser (default 10 minutes).

Expiry is enforced three ways, deliberately redundant:

1. **Read-time truth.** Every reader — the seat map, `hold_seats`, `confirm_booking` — treats a hold
   whose `hold_expires_at < now()` as free. Correctness therefore does not depend on the cleanup job
   running on time; the job only tidies up.
2. **Explicit release.** Closing checkout or unmounting the page calls `release_my_holds`, which frees
   the customer's non-waitlist holds instantly, so abandonment is usually visible to others in under a
   second rather than after ten minutes.
3. **Scheduled sweeper.** `pg_cron` runs `sweep_expirations()` every minute inside the database, with
   no application server in the path. It expires stale waitlist offers first (re-offering their seats),
   then flips every expired hold back to `available`.

Because expiry is evaluated at read time, there is no window where a released seat looks blocked, and
no window where an expired hold can be paid for.

## Concurrency protection

Double-booking is prevented by the database, not by application code. `hold_seats` performs one
set-based statement:

```sql
UPDATE show_seats SET status='held', held_by=uid, hold_expires_at=…
WHERE id = ANY($seats) AND event_id = $event
  AND (status='available' OR (status='held' AND hold_expires_at < now())
       OR (status='held' AND held_by = uid))
RETURNING id;
```

and then asserts `count(returned) = count(requested)`, raising `SEAT_TAKEN` otherwise, which rolls the
transaction back. Two sessions requesting the same seat contend on the same row: Postgres serialises
them, the second re-evaluates the predicate against the winner's committed row, matches zero rows, and
aborts. The result is all-or-nothing per selection — a customer never ends up holding three of the
four seats they asked for — with no advisory locks, no read-then-write gap, and no retry loop.
`confirm_booking` repeats the ownership and freshness check before it writes, so the booking step is
guarded independently of the hold step. Seat identity is further pinned by a unique
`(event_id, venue_seat_id)` constraint, making duplicate seat rows impossible.

Waitlist assignment uses `SELECT … FOR UPDATE SKIP LOCKED` on the queue head, so simultaneous
cancellations on the same show hand seats to *different* waiting customers instead of colliding on one.

All of this runs inside `SECURITY DEFINER` functions granted only to `authenticated` and scoped by
`auth.uid()`. The tables themselves grant no direct write access at all, so a hostile client with the
publishable key cannot flip a seat, forge a booking, or read another customer's tickets — RLS gives
public read on catalogue and seat status, owner-scoped read on bookings and waitlist entries, and
organiser-scoped read on their own shows' bookings.

## Waitlist auto-assignment and time-limited offers

Each `(event, category)` pair is a FIFO queue ordered by `joined_at`. When a booking is cancelled,
`cancel_booking` frees each seat and calls `offer_seat_to_next(seat)` in the same transaction. That
function takes the queue head and, crucially, **does not release the seat to general sale** — it
re-holds it in the waiting customer's name with `hold_kind='waitlist'`,
`hold_expires_at = now() + offer_ttl_seconds` (15 minutes), mints a random `offer_token`, and queues
an email containing a `/claim/<token>` link. Only if the queue is empty does the seat go back on sale.

Because the offer *is* a hold, the seat map, the offer record, and the claim page can never disagree:
other customers see the seat as unavailable for exactly as long as the offer stands.

`claim_offer(token)` validates that the token exists, belongs to the caller, and has not expired,
then the claim page completes the normal `confirm_booking` path, which marks the waitlist entry
`converted`. If the window lapses instead, the minute sweeper marks the entry `expired` and calls
`offer_seat_to_next` on the same seat again, cascading it to the next person — repeatedly, until
someone books it or the queue drains. Both the hold TTL and the offer TTL are stored as data
(`events.hold_ttl_seconds`, `waitlist.offer_ttl_seconds`), so timings are tunable per show or per
customer without a code change.

## Tickets and email

`confirmBooking` (a server function, so the service credentials never reach the browser) renders the
booking reference as an SVG QR code, inlines it into a branded HTML ticket, and queues it in
`email_outbox`. Delivery is a separate, retryable step: `POST /api/public/hooks/flush-emails` sends
the queue through Resend's free tier when `RESEND_API_KEY` is configured, and otherwise marks each
message `simulated` while leaving it fully readable at `/mailbox`. Decoupling composition from
delivery means a mail-provider outage can never fail a booking, and the waitlist emails written
directly by the database use the same queue.
