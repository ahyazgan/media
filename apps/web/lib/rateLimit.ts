import "server-only";
import { NextResponse } from "next/server";

/**
 * Süreç içi hız sınırı (sabit pencere). Herkese açık POST uçları (iletişim, reklam, bülten, push, vitals) için kaba koruma;
 * çok örnekli üretimde ters vekil/WAF sınırının yerini tutmaz, onu tamamlar. Anahtar: uç + istemci IP (X-Forwarded-For'un ilk adresi).
 */
const buckets = new Map<string, { n: number; reset: number }>();
let lastSweep = 0;

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

/** İzin veriyorsa null, aşıldıysa 429 yanıtı döndürür. */
export function rateLimit(req: Request, scope: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  if (now - lastSweep > windowMs) { for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); lastSweep = now; }
  const key = `${scope}:${clientIp(req)}`;
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return null; }
  b.n++;
  if (b.n > limit) return NextResponse.json({ ok: false, error: "Çok fazla istek; biraz sonra deneyin." }, { status: 429, headers: { "retry-after": String(Math.ceil((b.reset - now) / 1000)) } });
  return null;
}
