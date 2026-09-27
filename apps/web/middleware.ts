import { NextResponse, type NextRequest } from "next/server";

/**
 * /admin ve /api/admin için HTTP Basic Auth (şartname §6.2). Kimlik .env'den (ADMIN_USER / ADMIN_PASSWORD);
 * parola boş ya da varsayılan "change-me" ise admin kapalıdır (503) — yanlışlıkla açık kalmasın.
 * Karşılaştırma sabit zamanlıdır. robots noindex başlığı next.config.ts headers() ile eklenir.
 */
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASSWORD ?? "";
  if (!user || !pass || pass === "change-me") {
    return new NextResponse("Admin kapalı: .env içinde ADMIN_USER ve güçlü bir ADMIN_PASSWORD tanımlayın.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(header.slice(6)); } catch { decoded = ""; }
    const i = decoded.indexOf(":");
    const u = i >= 0 ? decoded.slice(0, i) : decoded, p = i >= 0 ? decoded.slice(i + 1) : "";
    if (safeEqual(u, user) && safeEqual(p, pass)) {
      const res = NextResponse.next();
      res.headers.set("cache-control", "no-store");
      return res;
    }
  }
  return new NextResponse("Kimlik doğrulama gerekli", { status: 401, headers: { "www-authenticate": 'Basic realm="Kaynak admin", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" } });
}
