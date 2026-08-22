import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — venues & seat layouts — SeatFlow" },
      { name: "description", content: "Create venues, seat rows and seat categories." },
      { property: "og:title", content: "Admin — venues & seat layouts" },
      { property: "og:description", content: "Create venues, seat rows and seat categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type RowSpec = { label: string; seats: number; category: string };

function AdminPage() {
  const { roles, loading } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [rows, setRows] = useState<RowSpec[]>([
    { label: "A", seats: 10, category: "Premium" },
    { label: "B", seats: 10, category: "Standard" },
  ]);
  const [busy, setBusy] = useState(false);

  const { data: venues } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id,name,city,venue_seats(id,category)")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  async function createVenue() {
    setBusy(true);
    const { data: venue, error } = await supabase
      .from("venues")
      .insert({ name, city })
      .select()
      .single();
    if (error || !venue) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create venue");
      return;
    }
    const seatRows = rows.flatMap((r) =>
      Array.from({ length: r.seats }, (_, i) => ({
        venue_id: venue.id,
        row_label: r.label.toUpperCase(),
        seat_number: i + 1,
        category: r.category,
      })),
    );
    const { error: seatError } = await supabase.from("venue_seats").insert(seatRows);
    setBusy(false);
    if (seatError) {
      toast.error(seatError.message);
      return;
    }
    setName("");
    setCity("");
    toast.success(`Venue created with ${seatRows.length} seats.`);
    void qc.invalidateQueries({ queryKey: ["admin-venues"] });
  }

  if (!loading && !roles.includes("admin")) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-3xl">Admin access required</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Admin is granted from the database (add an <code>admin</code> row in user_roles for your
          account) — it is deliberately not self-service.
        </p>
        <Button asChild className="mt-6" variant="secondary">
          <Link to="/">Back to events</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10">
      <h1 className="text-4xl">Venues & seat layouts</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[380px_1fr]">
        <section className="panel h-fit p-5">
          <h2 className="text-2xl">New venue</h2>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <Label>Rows</Label>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <Input
                  value={r.label}
                  onChange={(e) =>
                    setRows((p) => p.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
                  }
                />
                <Input
                  type="number"
                  value={r.seats}
                  onChange={(e) =>
                    setRows((p) =>
                      p.map((x, j) => (i === j ? { ...x, seats: Number(e.target.value) } : x)),
                    )
                  }
                />
                <Input
                  value={r.category}
                  onChange={(e) =>
                    setRows((p) => p.map((x, j) => (i === j ? { ...x, category: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setRows((p) => [
                  ...p,
                  {
                    label: String.fromCharCode(65 + p.length),
                    seats: 10,
                    category: p[p.length - 1]?.category ?? "Standard",
                  },
                ])
              }
            >
              Add row
            </Button>
            <Button className="w-full" disabled={busy || !name} onClick={createVenue}>
              Create venue
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl">Existing venues</h2>
          {(venues ?? []).map((v) => {
            const cats = [...new Set((v.venue_seats ?? []).map((s) => s.category))];
            return (
              <article key={v.id} className="panel flex items-center justify-between p-5">
                <div>
                  <h3 className="text-xl leading-tight">{v.name}</h3>
                  <p className="text-sm text-muted-foreground">{v.city}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant="secondary">{(v.venue_seats ?? []).length} seats</Badge>
                  {cats.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
