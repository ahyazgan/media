import { FeedAdapter, type FeedAdapterOptions } from "./feed/adapter.js";
import type { FeedItem } from "./feed/parse.js";

/**
 * TCMB basın duyuruları (PPK karar metni, basın duyuruları). Varsayılan besleme adresi kamuya açık RSS'tir;
 * TCMB portalı adresleri sık değiştirdiğinden `TCMB_FEED_URL` ile ezilebilir (README "Doğrulama sınırı").
 * Zamanlama (şartname §4): takvim saatinde 30 sn (worker, calendar_events'e bakarak `hot` verir), diğer zamanlarda 10 dk.
 */
// Canlıda doğrulandı (2026-10-02): Atom 1.0, tarihler "1 Eki 2026 14:00:00" (Türkiye saati), bağlantılar http:// ve küçük harf
export const TCMB_DEFAULT_FEED = "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Bottom+Menu/Diger/RSS/Basin+Duyurulari";

export function tcmbSection(it: FeedItem): { section: string; sectionLabel: string } {
  const t = it.title.toLocaleLowerCase("tr");
  if (/para politikası kurulu|faiz|ppk/.test(t)) return { section: "ppk", sectionLabel: "PPK Kararı" };
  if (/enflasyon raporu|finansal istikrar raporu/.test(t)) return { section: "rapor", sectionLabel: "Rapor" };
  if (/zorunlu karşılık|likidite|kredi|makroihtiyati/.test(t)) return { section: "duzenleme", sectionLabel: "Düzenleme" };
  return { section: "basin", sectionLabel: "Basın Duyurusu" };
}

export class TcmbAdapter extends FeedAdapter {
  constructor(opts: Partial<FeedAdapterOptions> = {}) {
    super({
      id: "tcmb", official: true,
      schedule: { timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 600, hotEverySeconds: 30 },
      sectionOf: tcmbSection,
      accept: (it) => !/\/EN\/|\bEN\b/.test(it.link) && !/^press release/i.test(it.title),
      ...opts,
      // Adres yayılımdan sonra: { feedUrl: undefined } (boş .env) varsayılanı ezmesin
      feedUrl: opts.feedUrl ?? process.env.TCMB_FEED_URL ?? TCMB_DEFAULT_FEED,
    });
  }
}
export const tcmb = new TcmbAdapter();
