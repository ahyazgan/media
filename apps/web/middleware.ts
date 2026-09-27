import { NextResponse, type NextRequest } from "next/server";

/**
 * /admin ve /api/admin için HTTP Basic Auth (şartname §6.2). Kimlik .env'den (ADMIN_USER / ADMIN_PASSWORD);
 * parola boş ya da varsayılan "change-me" ise admin kapalıdır (503) — yanlışlıkla açık kalmasın.
 * Karşılaştırma sabit zamanlıdır. robots noindex başlığı next.config.ts headers() ile eklenir.
 */
export const config = { matcher: ["/((?!_next/static|_next/image|icons/|sw\\.js|swe-worker|favicon\\.ico).*)"] };

/**
 * CSP: varsayılan Report-Only (ihlaller /api/csp-report'a düşer, sayfa bozulmaz); CSP_ENFORCE=1 ile zorlanır.
 * Nonce tabanlı sıkı CSP bilinçli olarak kullanılmadı: Next nonce'u yalnızca dinamik render edilen sayfalara uygular, bu da ISR
 * önbelleğini (ana sayfa 60 sn, haberler publish'te revalidate) iptal ederdi. Bunun yerine script/style için 'unsafe-inline' + yalnızca
 * izinli kaynaklar; object-src 'none', base-uri, form-action ve frame-ancestors kısıtlı. XSS yüzeyi ayrıca lib/markdown.ts ile kapatılır.
 */
function cspHeader(): string {
  const ads = "https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.googletagservices.com https://*.adtrafficquality.google";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${ads}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https: ${ads}`,
    `frame-src ${ads} https://*.doubleclick.net https://*.google.com`,
    `connect-src 'self' ${ads} https://*.google.com https://*.doubleclick.net`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

function withCsp(res: NextResponse): NextResponse {
  if (process.env.CSP_DISABLE === "1") return res;
  res.headers.set(process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", cspHeader());
  return res;
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!(path.startsWith("/admin") || path.startsWith("/api/admin"))) return withCsp(NextResponse.next());
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
      const res = withCsp(NextResponse.next());
      res.headers.set("cache-control", "no-store");
      return res;
    }
  }
  return new NextResponse("Kimlik doğrulama gerekli", { status: 401, headers: { "www-authenticate": 'Basic realm="Kaynak admin", charset="UTF-8"', "content-type": "text/plain; charset=utf-8" } });
}
