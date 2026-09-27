import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { newsletterSubscribers } from "@kaynak/db";
import { getDb } from "@/lib/db";
import { sendConfirmationMail } from "@/lib/mail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** POST { email, consent } → kayıt (onaysız) + onay e-postası. Var olan adres yeniden onay e-postası alır; iptal etmişse yeniden açılır. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; consent?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "KVKK açık rızası gerekli." }, { status: 400 });
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  const { db } = await getDb();
  const [existing] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
  let token: string;
  if (existing) {
    token = existing.token;
    if (existing.unsubscribedAt) await db.update(newsletterSubscribers).set({ unsubscribedAt: null, confirmedAt: null, consentAt: new Date() }).where(eq(newsletterSubscribers.id, existing.id));
    if (existing.confirmedAt && !existing.unsubscribedAt) return NextResponse.json({ ok: true, state: "already" });
  } else {
    const [row] = await db.insert(newsletterSubscribers).values({ email, consentAt: new Date() }).returning({ token: newsletterSubscribers.token });
    token = row!.token;
  }
  try { await sendConfirmationMail(email, token); }
  catch (e) { console.error("[bulten] onay e-postası gönderilemedi:", (e as Error).message); return NextResponse.json({ ok: false, error: "E-posta gönderilemedi, daha sonra deneyin." }, { status: 502 }); }
  return NextResponse.json({ ok: true, state: "pending" });
}
