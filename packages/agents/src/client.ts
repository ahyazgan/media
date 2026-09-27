import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | undefined;

/** Tembel istemci: API anahtarı yalnızca gerçekten çağrı yapılırken gerekir (testler modelsiz koşabilir). */
export function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ maxRetries: 3, timeout: 120_000 });
  return _client;
}

export function models() {
  return {
    // Şartname: model kimlikleri kodda sabit değil .env'den okunur.
    classify: process.env.MODEL_CLASSIFY ?? "claude-haiku-4-5",
    write: process.env.MODEL_WRITE ?? "claude-sonnet-5",
  };
}

export function reviewThreshold(): number {
  const n = Number(process.env.REVIEW_THRESHOLD ?? 4);
  return Number.isFinite(n) ? n : 4;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
