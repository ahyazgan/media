import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sourceHealth, sources } from "@kaynak/db";
import { summarizeSources } from "@kaynak/pipeline";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Kaynak sağlığı (uptime izleyicisi için ayrı uç): etkin bir kaynak BOZUK ya da SESSİZ ise 503.
 * /api/health canlılık ucudur ve kaynak durumundan etkilenmez (Docker/Caddy onu kullanır).
 * Hata metni burada yayımlanmaz (sayfa örneği içerebilir); ayrıntı /admin/kaynaklar'da.
 */
export async function GET() {
  try {
    const { db } = await getDb();
    const enabled = (await db.select({ id: sources.id }).from(sources).where(eq(sources.enabled, true))).map((r) => r.id);
    const rows = await db.select().from(sourceHealth);
    const rep = summarizeSources(rows, enabled);
    const body = { ok: rep.ok, sources: rep.sources.map(({ lastError: _e, ...s }) => s), time: new Date().toISOString() };
    return NextResponse.json(body, { status: rep.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
