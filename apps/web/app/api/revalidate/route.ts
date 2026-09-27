import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Worker publish sonrası çağırır: POST { paths: string[] } + x-revalidate-secret başlığı (sabit zamanlı karşılaştırma). */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || secret === "change-me" || !safeEqual(req.headers.get("x-revalidate-secret") ?? "", secret)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && /^\/[\w\-./%~]*$/.test(p)).slice(0, 50) : [];
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
