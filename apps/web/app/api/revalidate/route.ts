import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/** Worker publish sonrası çağırır: POST { paths: string[] } + x-revalidate-secret başlığı. */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/")) : [];
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
