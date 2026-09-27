import type { Env } from "./env.js";
import type { Mailer } from "./mail.js";

/** Operasyon uyarıları (kaynak bozuldu / düzeldi). Kanal yoksa yalnızca günlüğe yazar. */
export interface Alerter {
  channels: string[];
  send(subject: string, text: string): Promise<void>;
}

export function createAlerter(
  env: Pick<Env, "ALERT_EMAIL" | "ALERT_TELEGRAM_CHAT_ID" | "TELEGRAM_BOT_TOKEN"> & { TELEGRAM_API_BASE?: string },
  mailer?: Mailer,
  fetchImpl: typeof fetch = fetch,
): Alerter {
  const channels: string[] = [];
  const canMail = Boolean(env.ALERT_EMAIL && mailer && mailer.kind !== "noop");
  const canTelegram = Boolean(env.ALERT_TELEGRAM_CHAT_ID && env.TELEGRAM_BOT_TOKEN);
  if (canMail) channels.push("email");
  if (canTelegram) channels.push("telegram");
  return {
    channels,
    async send(subject, text) {
      console.warn(`[alert] ${subject} — ${text.split("\n")[0]}`);
      const jobs: Promise<unknown>[] = [];
      if (canMail) {
        const html = `<pre style="font:14px/1.5 monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`;
        jobs.push(mailer!.send({ to: env.ALERT_EMAIL!, subject: `[Kaynak] ${subject}`, text, html }));
      }
      if (canTelegram) {
        jobs.push(fetchImpl(`${env.TELEGRAM_API_BASE ?? "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: env.ALERT_TELEGRAM_CHAT_ID, text: `${subject}\n\n${text}`.slice(0, 4000), disable_web_page_preview: true }),
        }));
      }
      const results = await Promise.allSettled(jobs);
      for (const r of results) if (r.status === "rejected") console.error("[alert] gönderilemedi:", (r.reason as Error)?.message);
    },
  };
}
