import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { money, when } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/organiser")({
  head: () => ({
    meta: [
      { title: "Organiser console — SeatFlow" },
      { name: "description", content: "Publish shows, set per-category pricing and track revenue." },
      { property: "og:title", content: "Organiser console — SeatFlow" },
      { property: "og:description", content: "Publish shows and track bookings and revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrganiserPage,
});

function OrganiserPage() {
  const { user, roles, loading } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"movie" | "concert">("movie");
  const [description, setDescription] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [ttl, setTtl] = useState(10);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data: venues } = useQuery({
    queryKey: ["venues-with-cats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id,name,city,venue_seats(category)");
      if (error) throw error;
      return (data ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        city: v.city,
        categories: [...new Set((v.venue_seats ?? []).map((s) => s.category))],
      }));
    },
  });

  const { data: myEvents } = useQuery({
    queryKey: ["organiser-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,starts_at,venues(name),bookings(total,status),waitlist(id,status)")
        .eq("organiser_id", user!.id)
        .order("starts_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 20000,
  });

  const venue = venues?.find((v) => v.id === venueId);

  async function createEvent() {
    if (!venueId || !title || !startsAt) {
      toast.error("Title, venue and start time are required.");
      return;
    }
    setBusy(true);
    const { data: ev, error } = await supabase
      .from("events")
      .insert({
        title,
        kind,
        description,
        venue_id: venueId,
        organiser_id: user!.id,
        starts_at: new Date(startsAt).toISOString(),
        hold_ttl_seconds: Math.max(60, ttl * 60),
        poster_hue: Math.floor(Math.random() * 360),
      })
      .select()
      .single();
    if (error || !ev) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create event");
      return;
    }
    const rows = (venue?.categories ?? []).map((c) => ({
      event_id: ev.id,
      category: c,
      price: Number(prices[c] ?? 0),
    }));
    if (rows.length) await supabase.from("event_prices").insert(rows);
    // seat map is generated from the venue layout
    await supabase.rpc("create_show_seats", { p_event_id: ev.id });
    setBusy(false);
    setTitle("");
    setDescription("");
    toast.success("Show published with its seat map.");
    void qc.invalidateQueries({ queryKey: ["organiser-events", user?.id] });
  }

  if (!loading && !roles.includes("organiser")) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl">Organiser access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an account with the organiser role to publish shows.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10">
      <h1 className="text-4xl">Organiser console</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[380px_1fr]">
        <section className="panel h-fit p-5">
          <h2 className="text-2xl">Publish a show</h2>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex gap-2">
              {(["movie", "concert"] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={kind === k ? "default" : "secondary"}
                  className="flex-1 capitalize"
                  onClick={() => setKind(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">Select a venue…</option>
                {(venues ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.city}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Starts at</Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Seat hold TTL (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              />
            </div>
            {(venue?.categories ?? []).map((c) => (
              <div key={c} className="space-y-2">
                <Label>{c} price</Label>
                <Input
                  type="number"
                  value={prices[c] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [c]: e.target.value }))}
                />
              </div>
            ))}
            <Button className="w-full" disabled={busy} onClick={createEvent}>
              Publish show
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl">Your shows</h2>
          {(myEvents ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing published yet.</p>
          )}
          {(myEvents ?? []).map((e) => {
            const confirmed = (e.bookings ?? []).filter((b) => b.status === "confirmed");
            const revenue = confirmed.reduce((s, b) => s + Number(b.total), 0);
            const refunded = (e.bookings ?? [])
              .filter((b) => b.status === "cancelled")
              .reduce((s, b) => s + Number(b.total), 0);
            const waiting = (e.waitlist ?? []).filter((w) => w.status === "waiting").length;
            return (
              <article key={e.id} className="panel p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl leading-tight">{e.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {when(e.starts_at)} · {e.venues?.name}
                    </p>
                  </div>
                  <Badge variant="secondary">{waiting} waiting</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <Stat label="Bookings" value={String(confirmed.length)} />
                  <Stat label="Revenue" value={money(revenue)} />
                  <Stat label="Cancelled" value={money(refunded)} />
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl text-primary">{value}</p>
    </div>
  );
}
