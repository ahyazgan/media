/**
 * OAuth 1.0a (HMAC-SHA1) imzalama — X API v2 "user context" için. Ek bağımlılık yok; RFC 5849 / X belgelerine göre:
 * percent-encoding RFC 3986 (unreserved dışında her şey), parametreler anahtar+değer sırasıyla, imza tabanı METHOD&URL&PARAMS.
 */
import { createHmac, randomBytes } from "node:crypto";

export interface OAuth1Credentials { consumerKey: string; consumerSecret: string; accessToken: string; accessSecret: string }

export function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** İmza tabanı: yalnızca sorgu/form parametreleri + oauth_* (JSON gövde imzaya girmez). */
export function signatureBase(method: string, url: string, params: Record<string, string>): string {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  const all: Record<string, string> = { ...params };
  u.searchParams.forEach((v, k) => { all[k] = v; });
  const normalized = Object.entries(all).map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join("&");
  return `${method.toUpperCase()}&${percentEncode(base)}&${percentEncode(normalized)}`;
}

export function sign(base: string, consumerSecret: string, tokenSecret: string): string {
  return createHmac("sha1", `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`).update(base).digest("base64");
}

/** Authorization başlığı üretir. `bodyParams` yalnızca form-encoded gövde için verilir (JSON gövdede boş). */
export function authorizationHeader(creds: OAuth1Credentials, method: string, url: string, bodyParams: Record<string, string> = {}, opts: { nonce?: string; timestamp?: number } = {}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: opts.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(opts.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const base = signatureBase(method, url, { ...bodyParams, ...oauth });
  oauth["oauth_signature"] = sign(base, creds.consumerSecret, creds.accessSecret);
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauth[k]!)}"`).join(", ");
}
