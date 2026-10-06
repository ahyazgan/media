import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { toUsage, type Detailed } from "./meta.js";
import { WRITE_SYSTEM, writeUserMessage } from "./prompts.js";
import { WriteOutput, type WriteInput } from "./schemas.js";

/** Belge metni çok uzunsa (ör. 200 sayfalık kanun) modele ilk ~60k karakter verilir; kalan kısım not düşülür. */
const MAX_DOC_CHARS = 60_000;

/** Haber yazımı + çağrı ölçümü (model, süre, token). */
export async function writeDetailed(input: WriteInput): Promise<Detailed<WriteOutput>> {
  const client = getClient();
  const model = models().write;
  let doc = input.documentText;
  if (doc.length > MAX_DOC_CHARS) {
    doc = doc.slice(0, MAX_DOC_CHARS) + `\n\n[... belge ${input.documentText.length} karakter; ilk ${MAX_DOC_CHARS} karakter verildi ...]`;
  }
  const t0 = Date.now();
  const res = await client.messages.parse({
    model,
    // Sonnet 5 varsayılan olarak düşünür; düşünme token'ları bu sınırdan yer. 4096 canlı testte 4/22 yazımı yarıda kesti.
    max_tokens: 16_000,
    system: [{ type: "text", text: WRITE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: writeUserMessage({
        sourceName: input.sourceName, sourceUrl: input.sourceUrl, title: input.title, publishedAt: input.publishedAt,
        summaryHint: input.classify.summaryHint, category: input.classify.category, documentText: doc,
        avoidPhrases: input.avoidPhrases, stockCodes: input.stockCodes, background: input.background,
      }),
    }],
    output_config: { format: zodOutputFormat(WriteOutput) },
  });
  const meta = { model, ms: Date.now() - t0, stopReason: res.stop_reason, usage: toUsage(res.usage) };
  if (res.stop_reason === "refusal") throw Object.assign(new Error("write: model refused"), { meta });
  if (!res.parsed_output) throw Object.assign(new Error(`write: unparseable output (stop_reason=${res.stop_reason})`), { meta });
  return { output: res.parsed_output, meta };
}

export async function write(input: WriteInput): Promise<WriteOutput> {
  return (await writeDetailed(input)).output;
}
