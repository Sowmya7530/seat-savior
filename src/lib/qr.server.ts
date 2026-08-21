import QRCode from "qrcode";

/** Renders a QR code as an inline SVG data URI (works in email clients and <img>). */
export async function qrDataUri(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, width: 240 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function ticketEmailHtml(opts: {
  reference: string;
  title: string;
  startsAt: string;
  seats: string[];
  total: number;
  qr: string;
}) {
  return `
  <div style="font-family:Arial,sans-serif;background:#1b1712;color:#f3ece1;padding:24px;border-radius:12px;max-width:520px">
    <p style="letter-spacing:2px;color:#e0a44a;margin:0 0 4px;font-size:12px">CONFIRMED TICKET</p>
    <h1 style="margin:0 0 12px;font-size:24px">${opts.title}</h1>
    <p style="margin:0 0 16px;color:#c9bda9">${new Date(opts.startsAt).toUTCString()}</p>
    <p style="margin:0 0 4px"><b>Seats:</b> ${opts.seats.join(", ")}</p>
    <p style="margin:0 0 4px"><b>Total:</b> ₹${opts.total}</p>
    <p style="margin:0 0 16px"><b>Booking reference:</b> ${opts.reference}</p>
    <img src="${opts.qr}" alt="QR ticket" width="200" height="200"
      style="background:#fff;padding:8px;border-radius:8px" />
    <p style="color:#9b9081;font-size:12px;margin-top:16px">
      Show this QR at the gate. It encodes your booking reference ${opts.reference}.
    </p>
  </div>`;
}
