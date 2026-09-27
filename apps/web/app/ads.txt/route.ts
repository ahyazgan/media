/** ads.txt (IAB): ADS_TXT ortam değişkeni satırları "|" ya da yeni satırla ayrılmış olarak; boşsa 404. */
export function GET() {
  const raw = process.env.ADS_TXT?.trim();
  if (!raw) return new Response("Not found", { status: 404 });
  const body = raw.split(/\s*\|\s*|\r?\n/).map((l) => l.trim()).filter(Boolean).join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
