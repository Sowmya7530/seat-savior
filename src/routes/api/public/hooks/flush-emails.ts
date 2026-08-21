import { createFileRoute } from "@tanstack/react-router";

/**
 * Delivers queued outbox emails. If RESEND_API_KEY is configured the mail is
 * really sent; otherwise it is marked `simulated` and stays readable in the
 * in-app mailbox, so the flow is demonstrable without a paid mail domain.
 */
export const Route = createFileRoute("/api/public/hooks/flush-emails")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const key = process.env["RESEND_API_KEY"];
        const from = process.env["RESEND_FROM"] ?? "tickets@resend.dev";

        const { data: queued, error } = await supabaseAdmin
          .from("email_outbox")
          .select("id, to_email, subject, html")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(25);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let sent = 0;
        for (const mail of queued ?? []) {
          let status = "simulated";
          let errText: string | null = null;
          if (key) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from,
                to: [mail.to_email],
                subject: mail.subject,
                html: mail.html,
              }),
            });
            status = res.ok ? "sent" : "failed";
            if (!res.ok) errText = (await res.text()).slice(0, 300);
          }
          await supabaseAdmin
            .from("email_outbox")
            .update({ status, error: errText, sent_at: new Date().toISOString() })
            .eq("id", mail.id);
          sent += 1;
        }
        return Response.json({ processed: sent, delivery: key ? "resend" : "simulated" });
      },
    },
  },
});
