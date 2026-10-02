/**
 * Canlı kaynak yoklaması (DB ve model yok): her adapter'ın listesini çeker, ilk belgeyi indirip metin uzunluğunu yazar.
 *   pnpm --filter @kaynak/sources probe [kap tcmb tuik spk bddk epdk botas calendar]   (argümansız: hepsi)
 */
import { BddkAdapter, BotasAdapter, documentToText, EpdkAdapter, importCalendars, KapAdapter, SpkAdapter, TcmbAdapter, TuikAdapter, type SourceAdapter } from "../src/index.js";

const all: Record<string, () => SourceAdapter> = {
  kap: () => new KapAdapter(),
  tcmb: () => new TcmbAdapter(),
  tuik: () => new TuikAdapter(),
  spk: () => new SpkAdapter(),
  bddk: () => new BddkAdapter(),
  epdk: () => new EpdkAdapter(),
  botas: () => new BotasAdapter(),
};
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : [...Object.keys(all), "calendar"];
const since = new Date(Date.now() - 14 * 86_400_000);

for (const id of wanted) {
  if (id === "calendar") {
    try {
      const r = await importCalendars({ year: new Date().getFullYear() });
      console.log(`\n== calendar: ${r.entries.length} kayıt, ${r.errors.length} hata`);
      for (const e of r.errors) console.log("  hata:", e);
      for (const e of r.entries.slice(0, 5)) console.log("  ", JSON.stringify(e));
    } catch (e) { console.log(`\n== calendar: HATA ${(e as Error).message}`); }
    continue;
  }
  const a = all[id]!();
  const t0 = Date.now();
  try {
    const events = await a.fetchNew(since);
    console.log(`\n== ${id}: ${events.length} olay (${Date.now() - t0} ms)`);
    for (const e of events.slice(0, 4)) console.log("  ", e.externalId, "|", e.title?.slice(0, 90), "|", e.url);
    if (events[0]) {
      const d = await a.fetchDocument(events[0]);
      const text = await documentToText(d.mime, d.bytes);
      console.log(`  belge: ${d.mime} ${d.bytes.length} bayt, ${text.length} karakter → ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`\n== ${id}: HATA ${(e as Error).name}: ${(e as Error).message}`);
  }
}
