import { FeedAdapter, type FeedAdapterOptions } from "./feed/adapter.js";
import type { FeedItem } from "./feed/parse.js";

/**
 * TÜİK haber bültenleri. Bültenler sabit saatte (10:00 TR) yayımlanır; worker takvim saatinde 30 sn, diğer zamanlarda 15 dk tarar.
 * Besleme adresi `TUIK_FEED_URL` ile ezilebilir.
 */
export const TUIK_DEFAULT_FEED = "https://data.tuik.gov.tr/Bulten/Rss";

export function tuikSection(it: FeedItem): { section: string; sectionLabel: string } {
  const t = it.title.toLocaleLowerCase("tr");
  if (/fiyat endeksi|enflasyon/.test(t)) return { section: "fiyat", sectionLabel: "Fiyat İstatistikleri" };
  if (/gayrisafi|büyüme|milli gelir/.test(t)) return { section: "buyume", sectionLabel: "Ulusal Hesaplar" };
  if (/işgücü|işsizlik|istihdam/.test(t)) return { section: "isgucu", sectionLabel: "İşgücü" };
  if (/dış ticaret|ihracat|ithalat/.test(t)) return { section: "dis-ticaret", sectionLabel: "Dış Ticaret" };
  if (/sanayi üretim|ciro|kapasite/.test(t)) return { section: "sanayi", sectionLabel: "Sanayi" };
  return { section: "bulten", sectionLabel: "Haber Bülteni" };
}

export class TuikAdapter extends FeedAdapter {
  constructor(opts: Partial<FeedAdapterOptions> = {}) {
    super({
      id: "tuik", official: true,
      feedUrl: opts.feedUrl ?? process.env.TUIK_FEED_URL ?? TUIK_DEFAULT_FEED,
      schedule: { timezone: "Europe/Istanbul", windows: [], defaultEverySeconds: 900, hotEverySeconds: 30 },
      sectionOf: tuikSection,
      accept: (it) => !/\/en\//i.test(it.link),
      ...opts,
    });
  }
}
export const tuik = new TuikAdapter();
