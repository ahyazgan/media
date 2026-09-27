import { NextResponse } from "next/server";
import { webVitals } from "@kaynak/db";
import { getDb } from "@/lib/db";

const NAMES = new Set(["LCP", "CLS", "INP", "FCP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 1024) return NextResponse.json({ ok: false }, { status: 413 });
  let b: { name?: unknown; value?: unknown; rating?: unknown; path?: unknown; mobile?: unknown } = {};
  try { b = JSON.parse(text); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const name = String(b.name), value = Number(b.value), rating = String(b.rating);
  if (!NAMES.has(name) || !Number.isFinite(value) || value < 0 || value > 600_000 || !RATINGS.has(rating)) return NextResponse.json({ ok: false }, { status: 400 });
  const path = typeof b.path === "string" ? b.path.slice(0, 120) : "/";
  const { db } = await getDb();
  await db.insert(webVitals).values({ name, value, rating, path, mobile: b.mobile === true });
  return new NextResponse(null, { status: 204 });
}
