import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { correctionRequests } from "@kaynak/db";
import { getDb } from "@/lib/db";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KINDS = new Set(["duzeltme", "tekzip", "diger"]);
const SITE_HOST = (() => { try { return new URL(process.env.SITE_URL ?? "http://localhost:3000").host; } catch { return ""; } })();

/** Haber URL'sinden slug; başka sitenin bağlantısı ise yok sayılır. */
function slugFrom(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = /^\/?haber\/([a-z0-9-]+)\/?$/.exec(s);
  if (m) return m[1]!;
  try { const u = new URL(s); if (u.host === SITE_HOST) { const mm = /^\/haber\/([a-z0-9-]+)\/?$/.exec(u.pathname); if (mm) return mm[1]!; } } catch { /* düz metin */ }
  return null;
}

/** POST { name, email, kind, article, message, consent, website(honeypot) } → correction_requests; admin "Düzeltme talepleri"nde görünür. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "iletisim", 5);
  if (limited) return limited;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.website === "string" && b.website) return NextResponse.json({ ok: true }); // bot tuzağı: sessizce kabul
  const name = String(b.name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const message = String(b.message ?? "").trim().slice(0, 4000);
  const kind = KINDS.has(String(b.kind)) ? (String(b.kind) as "duzeltme" | "tekzip" | "diger") : "duzeltme";
  if (b.consent !== true) return NextResponse.json({ ok: false, error: "KVKK açık rızası gerekli." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Ad Soyad girin." }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ ok: false, error: "Mesaj en az 10 karakter olmalı." }, { status: 400 });
  const { db } = await getDb();
  await db.insert(correctionRequests).values({ kind, name, email, message, articleSlug: slugFrom(String(b.article ?? "")) });
  return NextResponse.json({ ok: true });
}
