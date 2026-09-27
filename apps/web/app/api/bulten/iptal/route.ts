import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { newsletterSubscribers } from "@kaynak/db";
import { getDb } from "@/lib/db";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";

/** GET ?token= → unsubscribedAt (List-Unsubscribe başlığı da buraya gelir); /bulten?durum=iptal. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) return NextResponse.redirect(`${SITE}/bulten?durum=gecersiz`);
  const { db } = await getDb();
  const rows = await db.update(newsletterSubscribers).set({ unsubscribedAt: new Date() }).where(eq(newsletterSubscribers.token, token)).returning({ id: newsletterSubscribers.id });
  return NextResponse.redirect(`${SITE}/bulten?durum=${rows.length ? "iptal" : "gecersiz"}`);
}
/** RFC 8058 tek tıkla iptal (List-Unsubscribe-Post). */
export const POST = GET;
