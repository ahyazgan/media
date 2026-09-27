import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { CLASSIFY_SYSTEM } from "./prompts.js";
import { ClassifyOutput, type ClassifyInput } from "./schemas.js";

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const client = getClient();
  const head = input.textHead.slice(0, 2000);
  const res = await client.messages.parse({
    model: models().classify,
    max_tokens: 1024,
    system: [{ type: "text", text: CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `Kaynak: ${input.sourceId}${input.section ? `\nBölüm: ${input.section}` : ""}\nBaşlık: ${input.title}\n\nBelge başı:\n${head}`,
    }],
    output_config: { format: zodOutputFormat(ClassifyOutput) },
  });
  if (res.stop_reason === "refusal") throw new Error("classify: model refused");
  if (!res.parsed_output) throw new Error(`classify: unparseable output (stop_reason=${res.stop_reason})`);
  return res.parsed_output;
}
