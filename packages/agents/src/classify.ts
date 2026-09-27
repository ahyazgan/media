import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { toUsage, type Detailed } from "./meta.js";
import { CLASSIFY_SYSTEM } from "./prompts.js";
import { ClassifyOutput, type ClassifyInput } from "./schemas.js";

/** Sınıflandırma + çağrı ölçümü (model, süre, token). */
export async function classifyDetailed(input: ClassifyInput): Promise<Detailed<ClassifyOutput>> {
  const client = getClient();
  const model = models().classify;
  const head = input.textHead.slice(0, 2000);
  const t0 = Date.now();
  const res = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Kaynak: ${input.sourceId}${input.section ? `\nBölüm: ${input.section}` : ""}\nBaşlık: ${input.title}\n\nBelge başı:\n${head}`,
    }],
    output_config: { format: zodOutputFormat(ClassifyOutput) },
  });
  const meta = { model, ms: Date.now() - t0, stopReason: res.stop_reason, usage: toUsage(res.usage) };
  if (res.stop_reason === "refusal") throw Object.assign(new Error("classify: model refused"), { meta });
  if (!res.parsed_output) throw Object.assign(new Error(`classify: unparseable output (stop_reason=${res.stop_reason})`), { meta });
  return { output: res.parsed_output, meta };
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  return (await classifyDetailed(input)).output;
}
