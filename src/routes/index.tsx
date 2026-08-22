import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, MapPin, Timer, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { money, when } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SeatFlow — live seat booking for movies & concerts" },
      {
        name: "description",
        content:
          "Pick seats on a live map, holds expire automatically, and sold-out shows hand freed seats to the waitlist.",
      },
      { property: "og:title", content: "SeatFlow — live seat booking" },
      {
        property: "og:description",
        content: "Live seat maps, expiring holds and an automatic waitlist for movies and concerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

type Row = {
  id: string;
  title: string;
  kind: "movie" | "concert";
  description: string;
  poster_hue: number;
  starts_at: string;
  venues: { name: string; city: string } | null;
  event_prices: { price: number }[];
  show_seats: { count: number }[];
};

function Home() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "movie" | "concert">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id,title,kind,description,poster_hue,starts_at,venues(name,city),event_prices(price),show_seats(count)",
        )
        .order("starts_at");
      if (error) throw error;
      return data as unknown as Row[];
    },
    refetchInterval: 20000,
  });

  const { data: freeCounts } = useQuery({
    queryKey: ["free-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_seats")
        .select("event_id,status")
        .eq("status", "available");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.event_id] = (map[r.event_id] ?? 0) + 1;
      return map;
    },
    refetchInterval: 10000,
  });

  const events = (data ?? []).filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (q.trim() === "" ||
        e.title.toLowerCase().includes(q.toLowerCase()) ||
        (e.venues?.city ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <section className="py-14">
        <p className="mb-2 text-xs tracking-[0.3em] text-primary">SEAT HOLDS THAT EXPIRE · WAITLIST THAT MOVES</p>
        <h1 className="max-w-3xl text-5xl leading-[1.05] sm:text-7xl">
          Every seat is either yours, someone's for ten minutes, or free again.
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Pick seats on a live map. Abandon checkout and the hold dissolves on its own. Cancel a booking
          and the seat walks straight to the next person waiting — with a time-limited claim link.
        </p>
        <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Timer className="size-4 text-primary" /> 10-minute holds
          </span>
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-accent" /> Auto-assigned waitlist
          </span>
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" /> QR tickets by email
          </span>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search titles or cities…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {(["all", "movie", "concert"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "secondary"}
            className="capitalize"
            onClick={() => setKind(k)}
          >
            {k}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading shows…</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const total = e.show_seats?.[0]?.count ?? 0;
            const free = freeCounts?.[e.id] ?? 0;
            const min = Math.min(...(e.event_prices ?? []).map((p) => Number(p.price)));
            return (
              <Link
                key={e.id}
                to="/events/$eventId"
                params={{ eventId: e.id }}
                className="panel group overflow-hidden transition-transform hover:-translate-y-1"
              >
                <div
                  className="h-32"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.55 0.16 ${e.poster_hue}), oklch(0.28 0.06 ${e.poster_hue + 40}))`,
                  }}
                />
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="secondary" className="capitalize">
                      {e.kind}
                    </Badge>
                    {free === 0 ? (
                      <Badge variant="destructive">Sold out</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {free}/{total} free
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl leading-tight">{e.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.description}</p>
                  <div className="mt-4 space-y-1 text-sm">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="size-4" /> {when(e.starts_at)}
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="size-4" /> {e.venues?.name} · {e.venues?.city}
                    </p>
                  </div>
                  <p className="mt-4 text-primary">from {money(min)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
