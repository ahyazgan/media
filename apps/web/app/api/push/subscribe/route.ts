import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@kaynak/db";
import { getDb } from "@/lib/db";

const CATEGORIES = new Set(["borsa", "mevzuat", "makro", "bankacilik", "enerji", "sirketler", "diger"]);

interface Body { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; categories?: unknown; consent?: unknown }

/** POST: abonelik kaydı (KVKK açık rıza zorunlu, şartname §10). Aynı endpoint yeniden gelirse kategoriler güncellenir. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "push", 20);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Body;
  const sub = body.subscription;
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "Açık rıza gerekli." }, { status: 400 });
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth || !/^https:\/\//.test(sub.endpoint)) return NextResponse.json({ ok: false, error: "Geçersiz abonelik." }, { status: 400 });
  const categories = Array.isArray(body.categories) ? body.categories.filter((c): c is string => typeof c === "string" && CATEGORIES.has(c)) : [];
  const { db } = await getDb();
  await db.insert(pushSubscriptions).values({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, categories, consentAt: new Date() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, categories, consentAt: new Date() } });
  return NextResponse.json({ ok: true, categories });
}

/** DELETE: abonelik iptali (istemci pushManager.unsubscribe sonrası çağırır). */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  const { db } = await getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
  return NextResponse.json({ ok: true });
}
