import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, MapPin, Timer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmBooking } from "@/lib/booking.functions";
import { useAuth } from "@/lib/auth";
import { money, when, mmss } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QRTicket } from "@/components/QRTicket";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/$eventId")({
  head: () => ({
    meta: [
      { title: "Choose your seats — SeatFlow" },
      { name: "description", content: "Live seat map with expiring holds and an automatic waitlist." },
      { property: "og:title", content: "Choose your seats — SeatFlow" },
      { property: "og:description", content: "Live seat map with expiring holds and waitlist offers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventPage,
});

type Seat = {
  id: string;
  row_label: string;
  seat_number: number;
  category: string;
  status: "available" | "held" | "booked";
  held_by: string | null;
  hold_expires_at: string | null;
};

function EventPage() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useServerFn(confirmBooking);

  const [selected, setSelected] = useState<string[]>([]);
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ reference: string; total: number; seats: string[] } | null>(null);
  const holdingRef = useRef(false);

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, venues(name,city), event_prices(category,price)")
        .eq("id", eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: seats } = useQuery({
    queryKey: ["seats", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_seats")
        .select("id,row_label,seat_number,category,status,held_by,hold_expires_at")
        .eq("event_id", eventId)
        .order("row_label")
        .order("seat_number");
      if (error) throw error;
      return data as Seat[];
    },
    refetchInterval: 15000,
  });

  const { data: myWaitlist } = useQuery({
    queryKey: ["waitlist", eventId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist")
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  // realtime seat status
  useEffect(() => {
    const channel = supabase
      .channel(`seats-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "show_seats", filter: `event_id=eq.${eventId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["seats", eventId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId, qc]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // release holds when leaving checkout (abandonment) — TTL is the backstop
  const releaseHolds = useCallback(async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    await supabase.rpc("release_my_holds", { p_event_id: eventId });
    void qc.invalidateQueries({ queryKey: ["seats", eventId] });
  }, [eventId, qc]);

  useEffect(() => () => void releaseHolds(), [releaseHolds]);

  useEffect(() => {
    if (holdUntil && now > holdUntil && holdingRef.current) {
      holdingRef.current = false;
      setHoldUntil(null);
      setCheckoutOpen(false);
      setSelected([]);
      toast.warning("Your seat hold expired and the seats were released.");
      void qc.invalidateQueries({ queryKey: ["seats", eventId] });
    }
  }, [now, holdUntil, eventId, qc]);

  const priceOf = useCallback(
    (category: string) =>
      Number(
        (event?.event_prices ?? []).find((p: { category: string }) => p.category === category)?.price ?? 0,
      ),
    [event],
  );

  const rows = useMemo(() => {
    const map = new Map<string, Seat[]>();
    for (const s of seats ?? []) {
      const list = map.get(s.row_label) ?? [];
      list.push(s);
      map.set(s.row_label, list);
    }
    return [...map.entries()];
  }, [seats]);

  const categories = useMemo(() => {
    const map = new Map<string, { total: number; free: number }>();
    for (const s of seats ?? []) {
      const c = map.get(s.category) ?? { total: 0, free: 0 };
      c.total += 1;
      if (s.status === "available") c.free += 1;
      map.set(s.category, c);
    }
    return [...map.entries()];
  }, [seats]);

  const selectedSeats = (seats ?? []).filter((s) => selected.includes(s.id));
  const subtotal = selectedSeats.reduce((sum, s) => sum + priceOf(s.category), 0);

  function seatState(s: Seat): "booked" | "mine" | "held" | "free" {
    const expired = s.hold_expires_at ? new Date(s.hold_expires_at).getTime() < now : false;
    if (s.status === "booked") return "booked";
    if (s.status === "held" && !expired) return s.held_by === user?.id ? "mine" : "held";
    return "free";
  }

  function toggle(s: Seat) {
    const state = seatState(s);
    if (state === "booked" || state === "held") return;
    if (holdUntil) return; // locked during an active hold
    setSelected((prev) => (prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]));
  }

  async function startHold() {
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("hold_seats", {
      p_event_id: eventId,
      p_seat_ids: selected,
    });
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["seats", eventId] });
    if (error) {
      setSelected([]);
      toast.error(
        error.message.includes("SEAT_TAKEN")
          ? "Someone grabbed one of those seats first. Pick again."
          : error.message,
      );
      return;
    }
    const expires = (data as { hold_expires_at: string }[])?.[0]?.hold_expires_at;
    holdingRef.current = true;
    setHoldUntil(expires ? new Date(expires).getTime() : Date.now() + 600000);
    setEmail((e) => e || (user.email ?? ""));
    setCheckoutOpen(true);
  }

  async function pay() {
    setBusy(true);
    try {
      const res = await confirm({ data: { eventId, seatIds: selected, name, email } });
      holdingRef.current = false;
      setHoldUntil(null);
      setCheckoutOpen(false);
      setSelected([]);
      setTicket({ reference: res.reference, total: res.total, seats: res.seats });
      void qc.invalidateQueries({ queryKey: ["seats", eventId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist(category: string) {
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    const { error } = await supabase.rpc("join_waitlist", { p_event_id: eventId, p_category: category });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`You're on the ${category} waitlist. We'll email you the moment a seat frees up.`);
    void qc.invalidateQueries({ queryKey: ["waitlist", eventId, user.id] });
  }

  const legend = [
    ["Available", "bg-seat-free"],
    ["Your pick", "bg-seat-mine"],
    ["Held by others", "bg-seat-held"],
    ["Booked", "bg-seat-booked"],
  ] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← All events
      </Link>

      <header className="mt-4 mb-8">
        <Badge variant="secondary" className="capitalize">
          {event?.kind ?? "show"}
        </Badge>
        <h1 className="mt-2 text-5xl">{event?.title ?? "…"}</h1>
        <div className="mt-2 flex flex-wrap gap-5 text-sm text-muted-foreground">
          {event && (
            <>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4" /> {when(event.starts_at)}
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4" /> {event.venues?.name} · {event.venues?.city}
              </span>
              <span className="inline-flex items-center gap-2">
                <Timer className="size-4" /> holds last {Math.round(event.hold_ttl_seconds / 60)} min
              </span>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="panel p-6">
          <div className="mx-auto mb-8 max-w-md rounded-b-[100%] border-b-2 border-primary/60 pb-2 text-center text-xs tracking-[0.4em] text-primary/80">
            SCREEN / STAGE
          </div>

          <div className="space-y-2 overflow-x-auto">
            {rows.map(([row, list]) => (
              <div key={row} className="flex items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{row}</span>
                <div className="flex gap-1.5">
                  {list.map((s) => {
                    const st = seatState(s);
                    const picked = selected.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s)}
                        disabled={st === "booked" || st === "held"}
                        title={`${s.row_label}${s.seat_number} · ${s.category} · ${money(priceOf(s.category))}`}
                        className={cn(
                          "size-7 rounded-t-md text-[10px] transition-all",
                          st === "booked" && "cursor-not-allowed bg-seat-booked text-muted-foreground/40",
                          st === "held" && "cursor-not-allowed bg-seat-held/70",
                          st === "mine" && "bg-seat-mine text-background",
                          st === "free" && !picked && "bg-seat-free hover:-translate-y-0.5 hover:bg-primary/70",
                          picked && st !== "mine" && "bg-primary text-primary-foreground",
                        )}
                      >
                        {s.seat_number}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {legend.map(([label, cls]) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className={cn("size-3 rounded-sm", cls)} /> {label}
              </span>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-2xl">Your selection</h2>
            {selectedSeats.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Tap seats on the map to select them.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {selectedSeats.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>
                      {s.row_label}
                      {s.seat_number} · {s.category}
                    </span>
                    <span className="text-muted-foreground">{money(priceOf(s.category))}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Total</span>
              <span className="text-xl text-primary">{money(subtotal)}</span>
            </div>
            {holdUntil ? (
              <div className="mt-4 rounded-md bg-secondary p-3 text-center text-sm">
                Seats held — {mmss(holdUntil - now)} left
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => {
                    setHoldUntil(null);
                    setCheckoutOpen(false);
                    setSelected([]);
                    void releaseHolds();
                  }}
                >
                  Release seats
                </Button>
              </div>
            ) : (
              <Button
                className="mt-4 w-full"
                disabled={selectedSeats.length === 0 || busy}
                onClick={startHold}
              >
                Hold seats & checkout
              </Button>
            )}
          </div>

          <div className="panel p-5">
            <h2 className="text-2xl">Categories</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {categories.map(([cat, c]) => {
                const entry = (myWaitlist ?? []).find(
                  (w) => w.category === cat && (w.status === "waiting" || w.status === "offered"),
                );
                return (
                  <li key={cat} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span>{cat}</span>
                      <span className="text-muted-foreground">{money(priceOf(cat))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {c.free} of {c.total} available
                      </span>
                      {c.free === 0 &&
                        (entry ? (
                          <Badge variant="secondary">
                            {entry.status === "offered" ? "Seat offered — check email" : "On waitlist"}
                          </Badge>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => joinWaitlist(cat)}>
                            Join waitlist
                          </Button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>

      <Dialog
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) {
            setHoldUntil(null);
            setSelected([]);
            void releaseHolds();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Seats reserved for you — {holdUntil ? mmss(holdUntil - now) : "00:00"} remaining. Close this
            window and they go back on sale.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email for your QR ticket</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">
                {selectedSeats.map((s) => `${s.row_label}${s.seat_number}`).join(", ")}
              </span>
              <span className="text-xl text-primary">{money(subtotal)}</span>
            </div>
            <Button className="w-full" disabled={busy || !name || !email} onClick={pay}>
              Pay & confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ticket} onOpenChange={() => setTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Booking confirmed</DialogTitle>
          </DialogHeader>
          {ticket && (
            <div className="flex flex-col items-center gap-3 text-center">
              <QRTicket value={ticket.reference} />
              <p className="text-lg">{ticket.reference}</p>
              <p className="text-sm text-muted-foreground">
                Seats {ticket.seats.join(", ")} · {money(ticket.total)}
              </p>
              <p className="text-xs text-muted-foreground">
                A QR ticket has been emailed to {email}. You can also find it under My bookings.
              </p>
              <Button asChild className="w-full">
                <Link to="/bookings">View my bookings</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
