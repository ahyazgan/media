/** IndexNow anahtar dosyası: /<INDEXNOW_KEY>.txt → next.config rewrite ile buraya gelir; içerik anahtarın kendisidir. */
export function GET(req: Request) {
  // Rewrite sonrası req.url özgün yol (/<key>.txt) olabilir; hem sorgu hem yol okunur.
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? /^\/([A-Za-z0-9-]{8,128})\.txt$/.exec(u.pathname)?.[1] ?? "";
  const expected = process.env.INDEXNOW_KEY;
  if (!expected || !key || key !== expected) return new Response("Not found", { status: 404 });
  return new Response(expected, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
