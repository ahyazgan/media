import { NextResponse } from "next/server";
import { adInquiries } from "@kaynak/db";
import { getDb } from "@/lib/db";
import { notifySales } from "@/lib/mail";
import { AD_SLOTS } from "@/lib/ads";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Doğrudan satış formu → ad_inquiries; AD_SALES_EMAIL tanımlıysa e-posta bildirimi. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.website === "string" && b.website) return NextResponse.json({ ok: true }); // bot tuzağı
  const company = String(b.company ?? "").trim().slice(0, 160);
  const name = String(b.name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const phone = String(b.phone ?? "").trim().slice(0, 40) || null;
  const budget = String(b.budget ?? "").trim().slice(0, 60) || null;
  const message = String(b.message ?? "").trim().slice(0, 4000);
  const formats = Array.isArray(b.formats) ? b.formats.filter((f): f is string => typeof f === "string" && f in AD_SLOTS) : [];
  if (b.consent !== true) return NextResponse.json({ ok: false, error: "KVKK açık rızası gerekli." }, { status: 400 });
  if (company.length < 2 || name.length < 2) return NextResponse.json({ ok: false, error: "Şirket ve ad soyad girin." }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ ok: false, error: "Mesaj en az 10 karakter olmalı." }, { status: 400 });
  const { db } = await getDb();
  await db.insert(adInquiries).values({ company, name, email, phone, budget, formats, message });
  notifySales(`Reklam talebi: ${company}`, `${name} <${email}>${phone ? ` · ${phone}` : ""}\nBütçe: ${budget ?? "—"}\nFormatlar: ${formats.join(", ") || "—"}\n\n${message}`).catch((e) => console.warn("[reklam] bildirim gönderilemedi:", (e as Error).message));
  return NextResponse.json({ ok: true });
}
