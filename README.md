# SeatFlow — ticket booking with expiring seat holds and a self-driving waitlist

Movies and concerts, booked from a live seat map. Seat holds expire on their own, sold-out shows
run a per-category waitlist, and a cancellation hands the freed seat to the next person in line
with a time-limited claim link. Every confirmed booking produces a QR ticket by email.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + TanStack Start/Router, Tailwind v4 design tokens |
| Backend API | TanStack server functions (`src/lib/*.functions.ts`) + server routes (`src/routes/api/public/*`) |
| Database / auth / realtime | Postgres (Lovable Cloud), RLS, `pg_cron` |
| QR | `qrcode` (SVG, rendered client-side and inlined into email) |
| Email | Outbox table + pluggable sender (Resend free tier if `RESEND_API_KEY` is set, otherwise readable in-app mailbox) |

## Setup

```sh
npm install
npm run dev          # http://localhost:8080
```

`.env.example`:

```
VITE_SUPABASE_URL=            # database/auth URL (public)
VITE_SUPABASE_PUBLISHABLE_KEY=# publishable key (public)
SUPABASE_URL=                 # same URL, server side
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server only, used for the email outbox
RESEND_API_KEY=               # optional: real email delivery
RESEND_FROM=tickets@resend.dev
```

Roles: sign up as **customer** or **organiser** from `/auth`. **Admin** is granted deliberately from the
database (`insert into user_roles(user_id, role) values ('<uid>','admin')`) so it can never be
self-assigned from the client.

## Database schema

```
profiles(id, email, full_name)
user_roles(user_id, role)                  -- customer | organiser | admin, separate table by design
venues(id, name, city)
venue_seats(id, venue_id, row_label, seat_number, category)
events(id, organiser_id, venue_id, title, kind, starts_at, hold_ttl_seconds, poster_hue)
event_prices(event_id, category, price)
show_seats(id, event_id, venue_seat_id, row_label, seat_number, category,
           status, held_by, hold_expires_at, hold_kind, booking_id, version)
bookings(id, reference, event_id, user_id, customer_email, total, status, cancelled_at)
booking_seats(booking_id, show_seat_id, price)
waitlist(id, event_id, category, user_id, status, offer_token, offer_expires_at,
         offered_seat_id, offer_ttl_seconds, joined_at)
email_outbox(id, to_email, subject, html, kind, status, sent_at)
```

`show_seats` is the per-show seat map: one row per physical seat, cloned from the venue layout when a
show is published (`create_show_seats`). It is the single source of truth for the visual grid and is
published on the realtime channel, so every browser watching the show repaints on any status change.

## API

Database RPCs (all `security definer`, all keyed off `auth.uid()`, `authenticated` only):

| Function | Purpose |
| --- | --- |
| `ensure_profile(full_name, role)` | creates profile + first role after signup |
| `hold_seats(event_id, seat_ids[])` | atomic all-or-nothing hold, returns expiry |
| `release_my_holds(event_id)` | explicit abandonment release |
| `confirm_booking(event_id, seat_ids[], name, email)` | validates holds, books, prices, returns booking |
| `cancel_booking(booking_id)` | cancels and re-offers each freed seat |
| `join_waitlist(event_id, category)` / `leave_waitlist(id)` | queue management |
| `claim_offer(token)` | validates a time-limited waitlist offer |
| `sweep_expirations()` | internal, `service_role` only, run every minute by `pg_cron` |

HTTP:

| Route | Purpose |
| --- | --- |
| `POST /api/public/hooks/flush-emails` | delivers queued outbox mail (Resend, or marks it simulated) |
| `confirmBooking` server function | booking + QR render + queues the ticket email |

Reads (events, seat maps, prices) go straight through the Data API with public read policies; writes
never do — every state change is a function with the rule inside it.

## Seat hold logic

1. A customer selects seats and presses **Hold seats & checkout**. `hold_seats` runs one set-based
   `UPDATE … WHERE status='available' OR hold expired OR already mine` and counts the affected rows.
   If the count doesn't match the request the whole statement is rolled back with `SEAT_TAKEN`.
2. The hold carries `hold_expires_at = now() + events.hold_ttl_seconds` (configurable per show,
   default 10 minutes) and is reflected to everyone else as *held*.
3. Release happens on three independent paths, so nothing can leak:
   - the customer closes checkout → `release_my_holds`;
   - the page unmounts → same call from the cleanup effect;
   - nothing at all happens → `pg_cron` runs `sweep_expirations()` every minute.
   The UI additionally treats any hold whose expiry is in the past as free, so a stale row is never
   shown as blocked even between sweeps.

## Concurrency

The guard is the single conditional `UPDATE`, not application logic. Two sessions racing for seat
`C7` both try to flip the same row; Postgres serialises them, the loser re-evaluates the `WHERE`
clause against the committed row, matches nothing, and the count check aborts its transaction. There
is no read-then-write window to lose, no advisory locks, and no retry loop. `confirm_booking`
re-verifies `held_by = auth.uid() AND hold_expires_at > now()` before writing, so an expired hold can
never be paid for. Waitlist offers use `FOR UPDATE SKIP LOCKED` so two concurrent cancellations never
offer the same seat to the same person twice.

## Waitlist logic

- When every seat in a category is gone, the customer joins that category's queue (FIFO on `joined_at`).
- `cancel_booking` frees each seat and immediately calls `offer_seat_to_next`, which takes the head of
  the queue, re-holds the seat in that user's name with `hold_kind='waitlist'`, mints an
  `offer_token`, sets `offer_expires_at = now() + offer_ttl_seconds` (15 min), and queues the offer email.
- The offer email links to `/claim/<token>`. `claim_offer` validates ownership and expiry, and the
  customer completes the booking from that page.
- If the window lapses, the minute sweeper marks the entry `expired` and calls `offer_seat_to_next`
  again — the same seat cascades down the queue until someone books it or the queue empties, at which
  point it returns to general sale.

The seat is never "free" during an offer: it stays a hold owned by the offered user, so the offer and
the seat map can never disagree.

## Email + QR

`confirmBooking` renders the booking reference as an SVG QR, inlines it into the ticket email, and
queues it in `email_outbox`. `POST /api/public/hooks/flush-emails` delivers the queue through Resend
when `RESEND_API_KEY` is present; without a key the message is marked `simulated` and stays fully
readable at `/mailbox`, so the whole flow is demonstrable without owning a sending domain.

See `DESIGN.md` for the system-design write-up.
