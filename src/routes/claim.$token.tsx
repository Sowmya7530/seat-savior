import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { confirmBooking } from "@/lib/booking.functions";
import { useAuth } from "@/lib/auth";
import { mmss, money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRTicket } from "@/components/QRTicket";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({
    meta: [
      { title: "Claim your waitlist seat — SeatFlow" },
      { name: "description", content: "Complete your booking for a seat released from the waitlist." },
      { property: "og:title", content: "Claim your waitlist seat — SeatFlow" },
      { property: "og:description", content: "Time-limited offer for a freed seat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const confirm = useServerFn(confirmBooking);

  const [offer, setOffer] = useState<{ eventId: string; seatId: string; expiresAt: number } | null>(null);
  const [seat, setSeat] = useState<{ label: string; category: string; title: string; price: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    setEmail((e) => e || (user.email ?? ""));
    void (async () => {
      const { data, error } = await supabase.rpc("claim_offer", { p_token: token });
      if (error) {
        setError(error.message.replace(/^[A-Z_]+: /, ""));
        return;
      }
      const row = (data as { event_id: string; seat_id: string; expires_at: string }[])?.[0];
      if (!row) return setError("This claim link is not valid.");
      setOffer({
        eventId: row.event_id,
        seatId: row.seat_id,
        expiresAt: new Date(row.expires_at).getTime(),
      });
      const [{ data: s }, { data: ev }] = await Promise.all([
        supabase.from("show_seats").select("row_label,seat_number,category").eq("id", row.seat_id).single(),
        supabase.from("events").select("title, event_prices(category,price)").eq("id", row.event_id).single(),
      ]);
      if (s && ev) {
        setSeat({
          label: `${s.row_label}${s.seat_number}`,
          category: s.category,
          title: ev.title,
          price: Number(
            (ev.event_prices ?? []).find((p: { category: string }) => p.category === s.category)?.price ?? 0,
          ),
        });
      }
    })();
  }, [token, user, loading]);

  async function complete() {
    if (!offer) return;
    setBusy(true);
    try {
      const res = await confirm({
        data: { eventId: offer.eventId, seatIds: [offer.seatId], name, email },
      });
      setRef(res.reference);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete booking");
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !user) {
    return (
      <Centered title="Sign in to claim your seat">
        <Button onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
      </Centered>
    );
  }

  if (ref) {
    return (
      <Centered title="Seat claimed">
        <QRTicket value={ref} />
        <p className="text-lg">{ref}</p>
        <Button asChild>
          <Link to="/bookings">View my bookings</Link>
        </Button>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered title="Offer unavailable">
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-sm text-muted-foreground">
          The seat has moved on to the next person in the queue.
        </p>
        <Button asChild variant="secondary">
          <Link to="/">Browse events</Link>
        </Button>
      </Centered>
    );
  }

  const left = offer ? offer.expiresAt - now : 0;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="panel p-6">
        <p className="text-xs tracking-[0.3em] text-primary">TIME-LIMITED WAITLIST OFFER</p>
        <h1 className="mt-2 text-4xl">{seat?.title ?? "Loading…"}</h1>
        {seat && (
          <p className="mt-2 text-muted-foreground">
            Seat {seat.label} · {seat.category} · {money(seat.price)}
          </p>
        )}
        <p className="mt-4 text-2xl text-primary">{mmss(left)} left to complete</p>
        <div className="mt-6 space-y-3">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy || left <= 0 || !offer || !name} onClick={complete}>
            Complete booking
          </Button>
        </div>
      </div>
    </main>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-4xl">{title}</h1>
      {children}
    </main>
  );
}
