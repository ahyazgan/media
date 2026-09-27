import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, models } from "./client.js";
import { WRITE_SYSTEM, writeUserMessage } from "./prompts.js";
import { WriteOutput, type WriteInput } from "./schemas.js";

/** Belge metni çok uzunsa (ör. 200 sayfalık kanun) modele ilk ~60k karakter verilir; kalan kısım not düşülür. */
const MAX_DOC_CHARS = 60_000;

export async function write(input: WriteInput): Promise<WriteOutput> {
  const client = getClient();
  let doc = input.documentText;
  if (doc.length > MAX_DOC_CHARS) {
    doc = doc.slice(0, MAX_DOC_CHARS) + `\n\n[... belge ${input.documentText.length} karakter; ilk ${MAX_DOC_CHARS} karakter verildi ...]`;
  }
  const res = await client.messages.parse({
    model: models().write,
    max_tokens: 4096,
    system: [{ type: "text", text: WRITE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: writeUserMessage({
        sourceName: input.sourceName, sourceUrl: input.sourceUrl, title: input.title, publishedAt: input.publishedAt,
        summaryHint: input.classify.summaryHint, category: input.classify.category, documentText: doc,
        avoidPhrases: input.avoidPhrases,
      }),
    }],
    output_config: { format: zodOutputFormat(WriteOutput) },
  });
  if (res.stop_reason === "refusal") throw new Error("write: model refused");
  if (!res.parsed_output) throw new Error(`write: unparseable output (stop_reason=${res.stop_reason})`);
  return res.parsed_output;
}
