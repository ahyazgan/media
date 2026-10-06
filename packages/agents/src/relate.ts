import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { toUsage, type Detailed } from "./meta.js";
import { RELATE_SYSTEM, relateUserMessage } from "./prompts.js";
import { RelateOutput, type RelateInput } from "./schemas.js";

/** Konu eşleştirme (hızlı model): yeni bildirim adaylardan birinin devamı mı? Aday yoksa çağrılmaz. */
export async function relateDetailed(input: RelateInput): Promise<Detailed<RelateOutput>> {
  const client = getClient();
  const model = models().classify;
  const t0 = Date.now();
  const res = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: RELATE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: relateUserMessage(input) }],
    output_config: { format: zodOutputFormat(RelateOutput) },
  });
  const meta = { model, ms: Date.now() - t0, stopReason: res.stop_reason, usage: toUsage(res.usage) };
  if (res.stop_reason === "refusal") throw Object.assign(new Error("relate: model refused"), { meta });
  if (!res.parsed_output) throw Object.assign(new Error(`relate: unparseable output (stop_reason=${res.stop_reason})`), { meta });
  // Aralık dışı numara (model uydurursa) eşleşme sayılmaz
  const out = res.parsed_output;
  return { output: out.match > input.candidates.length ? { ...out, match: 0 } : out, meta };
}

export async function relate(input: RelateInput): Promise<RelateOutput> {
  return (await relateDetailed(input)).output;
}
