import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Confirms a booking: the atomic seat transition happens inside the database
 * function `confirm_booking` (RLS as the caller), then we render a QR ticket and
 * queue the confirmation email in the outbox.
 */
export const confirmBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        seatIds: z.array(z.string().uuid()).min(1).max(10),
        name: z.string().min(1).max(120),
        email: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: booking, error } = await supabase.rpc("confirm_booking", {
      p_event_id: data.eventId,
      p_seat_ids: data.seatIds,
      p_name: data.name,
      p_email: data.email,
    });
    if (error) throw new Error(error.message);
    const b = booking as unknown as { id: string; reference: string; total: number };

    const [{ data: event }, { data: seats }] = await Promise.all([
      supabase.from("events").select("title, starts_at").eq("id", data.eventId).single(),
      supabase.from("show_seats").select("row_label, seat_number").in("id", data.seatIds),
    ]);

    const seatLabels = (seats ?? []).map((s) => `${s.row_label}${s.seat_number}`).sort();
    const { qrDataUri, ticketEmailHtml } = await import("@/lib/qr.server");
    const qr = await qrDataUri(b.reference);
    const html = ticketEmailHtml({
      reference: b.reference,
      title: event?.title ?? "Your event",
      startsAt: event?.starts_at ?? new Date().toISOString(),
      seats: seatLabels,
      total: Number(b.total),
      qr,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_outbox").insert({
      to_email: data.email,
      subject: `Your ticket for ${event?.title ?? "your event"} — ${b.reference}`,
      html,
      kind: "ticket",
      booking_id: b.id,
    });

    return { reference: b.reference, total: Number(b.total), seats: seatLabels, qr };
  });
