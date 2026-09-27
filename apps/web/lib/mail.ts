import { resolveFromRoot } from "@kaynak/db";
import { createMailer } from "@kaynak/pipeline/mail";

const SITE = process.env.SITE_URL ?? "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Bülten çift onay e-postası. SMTP_URL yoksa storage/mail altına .eml yazılır (geliştirme). */
export async function sendConfirmationMail(email: string, token: string) {
  const mailer = await createMailer({ SMTP_URL: process.env.SMTP_URL || undefined, MAIL_FROM: process.env.MAIL_FROM ?? "Kaynak <bulten@example.com>", MAIL_DIR: resolveFromRoot(process.env.MAIL_DIR ?? "./storage/mail") }); // kök dizine göre (apps/web değil)
  const url = `${SITE}/api/bulten/onay?token=${token}`;
  await mailer.send({
    to: email,
    subject: "Kaynak sabah bülteni — aboneliğinizi onaylayın",
    html: `<p>Merhaba,</p><p>Kaynak sabah bültenine abone olmak için aşağıdaki bağlantıya tıklayın:</p><p><a href="${esc(url)}">${esc(url)}</a></p><p style="color:#7A7388;font-size:12px">Bu isteği siz yapmadıysanız bu e-postayı yok sayın; onaylanmayan adreslere bülten gönderilmez.</p>`,
    text: `Kaynak sabah bültenine abone olmak için: ${url}\n\nBu isteği siz yapmadıysanız yok sayın.`,
  });
  return mailer.kind;
}
