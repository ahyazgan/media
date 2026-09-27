import { HttpError } from "./http.js";

/**
 * Kaynak hatası türleri. Sağlık kaydı ve alarm eşikleri buna göre ayrılır:
 *  - structure: sayfa geldi ama beklenen yapıda değil (site yeniden tasarlandı, engelleme sayfası) → ilk seferde alarm
 *  - tls / robots: yapılandırma sorunu, kendiliğinden düzelmez → ilk seferde alarm
 *  - http / network: geçici olabilir → üst üste birkaç kez olursa alarm
 */
export type SourceErrorKind = "structure" | "tls" | "robots" | "http" | "network" | "unknown";

export class StructureError extends Error {
  readonly kind = "structure" as const;
  constructor(readonly sourceId: string, message: string, readonly sample?: string) {
    super(`${sourceId}: ${message}`);
    this.name = "StructureError";
  }
}

export function classifySourceError(e: unknown): SourceErrorKind {
  if (e instanceof StructureError) return "structure";
  if (e instanceof HttpError) return "http";
  const err = e as { message?: string; code?: string; cause?: { code?: string; message?: string } } | undefined;
  const text = `${err?.code ?? ""} ${err?.cause?.code ?? ""} ${err?.message ?? String(e)} ${err?.cause?.message ?? ""}`;
  if (/robots\.txt/i.test(text)) return "robots";
  if (/CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|DEPTH_ZERO|certificate/i.test(text)) return "tls";
  if (/ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|EPIPE|abort|fetch failed|socket|network|timed? ?out/i.test(text)) return "network";
  return "unknown";
}

/** Engelleme, captcha ya da hız sınırı sayfası mı? (200 dönse bile gerçek içerik değildir) */
export function looksLikeBlockPage(html: string): boolean {
  const head = html.slice(0, 20_000);
  return /captcha|cf-chl|cloudflare|access denied|request rejected|erişim(iniz)? (engellen|reddedil)|too many requests|güvenlik doğrulaması/i.test(head);
}

/** Hata ayrıntısını kayıt için kısaltır (sayfa örneği dahil). */
export function describeSourceError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  const sample = e instanceof StructureError && e.sample ? ` | örnek: ${e.sample.replace(/\s+/g, " ").slice(0, 200)}` : "";
  return (msg + sample).slice(0, 600);
}
