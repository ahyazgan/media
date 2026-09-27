"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { correctionRequests, rawEvents } from "@kaynak/db";
import { publishCorrection, publishFromReview, rejectFromReview, retractArticle } from "@kaynak/pipeline/editorial";
import { retryFailure } from "@kaynak/pipeline/failures";
import { getDb } from "@/lib/db";
import { afterPublish, editorName } from "@/lib/admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
async function sourceIdOf(rawEventId: string | null) {
  if (!rawEventId) return undefined;
  const { db } = await getDb();
  const [ev] = await db.select({ sourceId: rawEvents.sourceId }).from(rawEvents).where(eq(rawEvents.id, rawEventId)).limit(1);
  return ev?.sourceId;
}
const back = (path: string, msg: string, ok = true) => redirect(`${path}?${ok ? "ok" : "hata"}=${encodeURIComponent(msg)}`);

/** İnceleme: yayınla (düzenlemelerle) — dağıtım kancası da çalışır. */
export async function publishReviewAction(fd: FormData) {
  const id = str(fd, "id");
  const { db } = await getDb();
  try {
    const a = await publishFromReview(db, id, { by: await editorName(), patch: { title: str(fd, "title"), dek: str(fd, "dek"), bodyMarkdown: str(fd, "bodyMarkdown") }, note: str(fd, "note") || undefined });
    await afterPublish(a, await sourceIdOf(a.rawEventId));
    revalidatePath("/admin"); revalidatePath("/admin/inceleme");
    back("/admin/inceleme", `Yayınlandı: /haber/${a.slug}`);
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") throw e;
    back(`/admin/inceleme/${id}`, (e as Error).message, false);
  }
}

export async function rejectReviewAction(fd: FormData) {
  const id = str(fd, "id");
  const reason = str(fd, "reason") || "editör reddi";
  const { db } = await getDb();
  await rejectFromReview(db, id, { by: await editorName(), reason });
  revalidatePath("/admin"); revalidatePath("/admin/inceleme");
  back("/admin/inceleme", "Reddedildi");
}

/** Düzeltme yayınla: sürüm alınır, "Düzeltildi" notu haber sayfasında görünür; dağıtım tekrar yapılmaz (yalnızca revalidate). */
export async function correctionAction(fd: FormData) {
  const id = str(fd, "id");
  const { db } = await getDb();
  try {
    const a = await publishCorrection(db, id, { title: str(fd, "title"), dek: str(fd, "dek"), bodyMarkdown: str(fd, "bodyMarkdown") }, { by: await editorName(), reason: str(fd, "reason") });
    await afterPublish(a, await sourceIdOf(a.rawEventId), { distribute: false });
    revalidatePath("/admin/duzeltme"); revalidatePath(`/admin/duzeltme/${id}`);
    back(`/admin/duzeltme/${id}`, "Düzeltme yayınlandı");
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") throw e;
    back(`/admin/duzeltme/${id}`, (e as Error).message, false);
  }
}

export async function retractAction(fd: FormData) {
  const id = str(fd, "id");
  const { db } = await getDb();
  try {
    const a = await retractArticle(db, id, { by: await editorName(), reason: str(fd, "reason") });
    await afterPublish(a, await sourceIdOf(a.rawEventId), { distribute: false });
    revalidatePath("/admin/duzeltme");
    back(`/admin/duzeltme/${id}`, "Geri çekildi");
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") throw e;
    back(`/admin/duzeltme/${id}`, (e as Error).message, false);
  }
}

export async function resolveRequestAction(fd: FormData) {
  const id = str(fd, "id");
  const { db } = await getDb();
  await db.update(correctionRequests).set({ resolvedAt: new Date(), resolvedBy: await editorName(), resolution: str(fd, "resolution") || "kapatıldı" }).where(eq(correctionRequests.id, id));
  revalidatePath("/admin/talepler"); revalidatePath("/admin");
  back("/admin/talepler", "Talep kapatıldı");
}

export async function retryFailureAction(fd: FormData) {
  const id = str(fd, "id");
  const { db } = await getDb();
  await retryFailure(db, id, await editorName());
  revalidatePath("/admin/hatalar"); revalidatePath("/admin");
  back("/admin/hatalar", "Yeniden denemeye alındı; worker 5 dk içinde işler");
}
