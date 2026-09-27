import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Article } from "@kaynak/db";
import { loadEnv } from "@kaynak/pipeline/env";
import { makeOnPublished, pathsFor } from "@kaynak/pipeline/publish";
import { createPushSender } from "@kaynak/pipeline/push";
import { getDb } from "./db";

/** Basic Auth başlığındaki kullanıcı adı — işlemlerde "kim yaptı" kaydı için. */
export async function editorName(): Promise<string> {
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  try { return atob(auth.slice(6)).split(":")[0] || "admin"; } catch { return "admin"; }
}

/**
 * Admin'den yayın/düzeltme sonrası: ISR sayfalarını doğrudan yeniler, sonra pipeline'ın dağıtım kancasını (Telegram, push, IndexNow) çalıştırır.
 * Kanca kendi revalidate HTTP çağrısını da yapar; aynı yolun iki kez yenilenmesi zararsızdır.
 */
export async function afterPublish(a: Article, sourceId?: string, opts: { distribute?: boolean } = {}) {
  for (const p of pathsFor(a, sourceId)) revalidatePath(p);
  revalidatePath("/rss.xml"); revalidatePath("/news-sitemap.xml"); revalidatePath("/sitemap.xml");
  if (opts.distribute === false) return;
  const env = loadEnv();
  const { db } = await getDb();
  const push = await createPushSender(env);
  await makeOnPublished(env, { db, push, log: (m, meta) => console.log(`[admin:${m}]`, JSON.stringify(meta ?? {})) })(a, sourceId ? { sourceId } : undefined);
}
