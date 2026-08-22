import { useEffect, useState } from "react";

export function QRTicket({ value, size = 160 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let alive = true;
    void import("qrcode").then(async (m) => {
      const out = await m.default.toString(value, { type: "svg", margin: 1, width: size });
      if (alive) setSvg(out);
    });
    return () => {
      alive = false;
    };
  }, [value, size]);

  return (
    <div
      aria-label={`QR ticket for ${value}`}
      className="rounded-lg bg-white p-2"
      style={{ width: size + 16, height: size + 16 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
