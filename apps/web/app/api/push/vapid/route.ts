import { NextResponse } from "next/server";
/** İstemci push aboneliği için VAPID açık anahtarı; anahtar tanımlı değilse 404 (istemci bildirim kutusunu göstermez). */
export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "push kapalı" }, { status: 404 });
  return NextResponse.json({ ok: true, publicKey: key }, { headers: { "cache-control": "public, max-age=3600" } });
}
