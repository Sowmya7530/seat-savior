import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { money, when } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QRTicket } from "@/components/QRTicket";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "My bookings — SeatFlow" },
      { name: "description", content: "Your QR tickets, booking history and cancellations." },
      { property: "og:title", content: "My bookings — SeatFlow" },
      { property: "og:description", content: "Your QR tickets, booking history and cancellations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const { data: bookings } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, events(title,starts_at,venues(name,city)), booking_seats(price, show_seats(row_label,seat_number,category))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: waitlist } = useQuery({
    queryKey: ["my-waitlist", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist")
        .select("*, events(title)")
        .in("status", ["waiting", "offered"])
        .order("joined_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id });
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled — freed seats are offered to the waitlist automatically.");
    void qc.invalidateQueries({ queryKey: ["my-bookings", user?.id] });
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-3xl">Sign in to see your bookings</h1>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-10">
      <h1 className="text-4xl">My bookings</h1>

      {(waitlist ?? []).length > 0 && (
        <section className="panel mt-6 p-5">
          <h2 className="text-2xl">Waitlist</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(waitlist ?? []).map((w) => (
              <li key={w.id} className="flex items-center justify-between">
                <span>
                  {w.events?.title} · {w.category}
                </span>
                {w.status === "offered" ? (
                  <Button size="sm" asChild>
                    <Link to="/claim/$token" params={{ token: w.offer_token ?? "" }}>
                      Claim seat
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="secondary">Waiting</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-5">
        {(bookings ?? []).map((b) => (
          <article key={b.id} className="panel flex flex-col gap-5 p-5 sm:flex-row">
            <QRTicket value={b.reference} size={120} />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl leading-tight">{b.events?.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {b.events?.starts_at ? when(b.events.starts_at) : ""} · {b.events?.venues?.name}
                  </p>
                </div>
                <Badge variant={b.status === "cancelled" ? "destructive" : "secondary"}>{b.status}</Badge>
              </div>
              <p className="mt-3 text-sm">
                Seats{" "}
                {(b.booking_seats ?? [])
                  .map((s) => `${s.show_seats?.row_label}${s.show_seats?.seat_number}`)
                  .join(", ")}
              </p>
              <p className="text-sm text-muted-foreground">
                Reference {b.reference} · {money(Number(b.total))}
              </p>
              {b.status === "confirmed" && (
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => cancel(b.id)}>
                  Cancel booking
                </Button>
              )}
            </div>
          </article>
        ))}
        {(bookings ?? []).length === 0 && (
          <p className="text-muted-foreground">No bookings yet — pick a show to get started.</p>
        )}
      </div>
    </main>
  );
}
