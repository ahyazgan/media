import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Env } from "./env.js";

export interface MailMessage { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
export interface Mailer { kind: "smtp" | "file" | "noop"; send(msg: MailMessage): Promise<void> }

/**
 * E-posta taşıyıcısı: SMTP_URL varsa nodemailer; yoksa geliştirme için .eml dosyasına yazar (MAIL_DIR, varsayılan storage/mail).
 * Bülten ve abonelik onayı bu arayüzü kullanır; gönderim hatası çağıranı düşürmez, yakalanıp loglanır.
 */
export async function createMailer(env: Pick<Env, "SMTP_URL" | "MAIL_FROM" | "MAIL_DIR">): Promise<Mailer> {
  const from = env.MAIL_FROM;
  if (env.SMTP_URL) {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport(env.SMTP_URL);
    return {
      kind: "smtp",
      async send(m) { await transport.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text, headers: m.headers }); },
    };
  }
  const dir = env.MAIL_DIR;
  return {
    kind: "file",
    async send(m) {
      await mkdir(dir, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${m.to.replace(/[^a-z0-9@.]/gi, "_")}.eml`;
      const headers = Object.entries({ From: from, To: m.to, Subject: m.subject, ...m.headers }).map(([k, v]) => `${k}: ${v}`).join("\n");
      await writeFile(join(dir, name), `${headers}\nContent-Type: text/html; charset=utf-8\n\n${m.html}\n\n--- text ---\n${m.text}\n`);
    },
  };
}
