import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { toUsage, type Detailed } from "./meta.js";
import { VERIFY_SYSTEM, verifyUserMessage } from "./prompts.js";
import { VerifyOutput, type VerifyInput } from "./schemas.js";

/** Yazar ajanıyla aynı sınır: çok uzun belgede ilk ~60k karakter */
const MAX_DOC_CHARS = 60_000;

/**
 * Anlam doğrulaması (hızlı model): haberdeki iddialar belgeyle çelişiyor mu? Ham bulgular pipeline'da acceptIssues ile süzülür
 * (iddia haberde, kanıt belgede birebir geçmeli); süzülmeden yayın kararı verilmez.
 */
export async function verifyDetailed(input: VerifyInput): Promise<Detailed<VerifyOutput>> {
  const client = getClient();
  const model = models().classify;
  const doc = input.documentText.length > MAX_DOC_CHARS
    ? `${input.documentText.slice(0, MAX_DOC_CHARS)}\n\n[... belgenin ilk ${MAX_DOC_CHARS} karakteri ...]`
    : input.documentText;
  const t0 = Date.now();
  const res = await client.messages.parse({
    model,
    max_tokens: 4096,
    system: [{ type: "text", text: VERIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: verifyUserMessage({ ...input, documentText: doc }) }],
    output_config: { format: zodOutputFormat(VerifyOutput) },
  });
  const meta = { model, ms: Date.now() - t0, stopReason: res.stop_reason, usage: toUsage(res.usage) };
  if (res.stop_reason === "refusal") throw Object.assign(new Error("verify: model refused"), { meta });
  if (!res.parsed_output) throw Object.assign(new Error(`verify: unparseable output (stop_reason=${res.stop_reason})`), { meta });
  return { output: res.parsed_output, meta };
}

export async function verify(input: VerifyInput): Promise<VerifyOutput> {
  return (await verifyDetailed(input)).output;
}
