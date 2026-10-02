import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { toUsage, type Detailed } from "./meta.js";
import { FLASH_SYSTEM } from "./prompts.js";
import { FlashOutput, type FlashInput } from "./schemas.js";

/**
 * Flaş yazımı: hızlı model (MODEL_CLASSIFY), belgenin başı. Sınıflandırmayla paralel çağrılır; hedef 2–3 sn.
 * Çıktı pipeline'da sayı kontrolü ve yasaklı kalıp denetiminden geçmeden yayımlanmaz.
 */
export async function flashDetailed(input: FlashInput): Promise<Detailed<FlashOutput>> {
  const client = getClient();
  const model = models().classify;
  const t0 = Date.now();
  const res = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: FLASH_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Kaynak: ${input.sourceName} (${input.sourceId})\nBaşlık: ${input.title}${input.stockCodes?.length ? `\nBorsa kodu: ${input.stockCodes.join(", ")}` : ""}\n\nBelge:\n${input.textHead.slice(0, 6000)}`,
    }],
    output_config: { format: zodOutputFormat(FlashOutput) },
  });
  const meta = { model, ms: Date.now() - t0, stopReason: res.stop_reason, usage: toUsage(res.usage) };
  if (res.stop_reason === "refusal") throw Object.assign(new Error("flash: model refused"), { meta });
  if (!res.parsed_output) throw Object.assign(new Error(`flash: unparseable output (stop_reason=${res.stop_reason})`), { meta });
  return { output: res.parsed_output, meta };
}

export async function flash(input: FlashInput): Promise<FlashOutput> {
  return (await flashDetailed(input)).output;
}
