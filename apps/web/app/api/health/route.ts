import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { rawEvents } from "@kaynak/db";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Sağlık ucu (uptime izleme): DB erişimi, son olay zamanı, bekleyen olay sayısı. Sır içermez. */
export async function GET() {
  const t0 = Date.now();
  try {
    const { db, dialect } = await getDb();
    const [last] = await db.select({ at: rawEvents.createdAt }).from(rawEvents).orderBy(desc(rawEvents.createdAt)).limit(1);
    const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(rawEvents).where(eq(rawEvents.status, "new"));
    return NextResponse.json({ ok: true, db: dialect, dbMs: Date.now() - t0, lastEventAt: last?.at ?? null, pendingEvents: pending?.n ?? 0, time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
