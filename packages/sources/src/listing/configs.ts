/**
 * Faz 4+ kaynakları (şartname §4): SPK haftalık bülten (PDF, Cuma 17:00–20:00 5 dk), BDDK / EPDK / BOTAŞ duyuruları (15 dk).
 * Liste adresleri kamuya açık sayfalardır ve kurumlar sık taşır; `<ID>_LIST_URL` ile ezilebilir. Bu ortamdan erişim doğrulanamadı;
 * ayrıştırıcı hoşgörülüdür, ilk canlı çalıştırmada `pnpm pipeline:run -- --source spk` çıktısını kontrol edin.
 */
import { ListingAdapter, type ListingOptions } from "./adapter.js";

const TZ = "Europe/Istanbul";
type Partial_ = Partial<ListingOptions> & { http?: ListingOptions["http"] };

export const SPK_DEFAULT_LIST = "https://spk.gov.tr/haftalik-bultenler";
export class SpkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      id: "spk", official: true,
      // Cuma 17:00–20:00 arası 5 dk; diğer zamanlarda 6 saat
      schedule: { timezone: TZ, windows: [{ between: ["17:00", "20:00"], everySeconds: 300, weekdays: [5] }], defaultEverySeconds: 21_600 },
      linkPattern: /\.pdf(\?|$)/i, titlePattern: /b[üu]lten/i, excludePattern: /\beng?lish\b|\bEN\b/i,
      defaultTime: "17:30",
      section: (it) => ({ section: "haftalik-bulten", sectionLabel: `SPK Haftalık Bülten${it.date ? ` (${it.date})` : ""}` }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      listUrl: o.listUrl ?? process.env.SPK_LIST_URL ?? SPK_DEFAULT_LIST,
    });
  }
}

export const BDDK_DEFAULT_LIST = "https://www.bddk.org.tr/Duyuru";
export class BddkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: [1, 2, 3, 4, 5] }], defaultEverySeconds: 3600 },
      linkPattern: /duyuru|\.pdf(\?|$)/i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "10:00",
      section: (it) => (/kurulu? karar/i.test(it.title) ? { section: "kurul-karari", sectionLabel: "BDDK Kurul Kararı" } : { section: "duyuru", sectionLabel: "BDDK Duyurusu" }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "bddk", official: true, listUrl: o.listUrl ?? process.env.BDDK_LIST_URL ?? BDDK_DEFAULT_LIST,
    });
  }
}

export const EPDK_DEFAULT_LIST = "https://www.epdk.gov.tr/Detay/DuyuruListesi/1";
export class EpdkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: [1, 2, 3, 4, 5] }], defaultEverySeconds: 3600 },
      linkPattern: /duyuru|detay|\.pdf(\?|$)/i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "10:00",
      section: (it) => (/tarife|fiyat/i.test(it.title) ? { section: "tarife", sectionLabel: "EPDK Tarife" } : /kurulu? karar/i.test(it.title) ? { section: "kurul-karari", sectionLabel: "EPDK Kurul Kararı" } : { section: "duyuru", sectionLabel: "EPDK Duyurusu" }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "epdk", official: true, listUrl: o.listUrl ?? process.env.EPDK_LIST_URL ?? EPDK_DEFAULT_LIST,
    });
  }
}

export const BOTAS_DEFAULT_LIST = "https://www.botas.gov.tr/Sayfa/duyurular/6";
export class BotasAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: [1, 2, 3, 4, 5] }], defaultEverySeconds: 3600 },
      linkPattern: /duyuru|icerik|\.pdf(\?|$)/i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "10:00",
      section: (it) => (/tarife|fiyat|satış fiyat/i.test(it.title) ? { section: "tarife", sectionLabel: "BOTAŞ Tarife" } : { section: "duyuru", sectionLabel: "BOTAŞ Duyurusu" }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "botas", official: true, listUrl: o.listUrl ?? process.env.BOTAS_LIST_URL ?? BOTAS_DEFAULT_LIST,
    });
  }
}

export const LISTING_SOURCE_IDS = ["spk", "bddk", "epdk", "botas"] as const;
export function listingAdapterFor(id: string, o: Partial_ = {}): ListingAdapter | undefined {
  switch (id) {
    case "spk": return new SpkAdapter(o);
    case "bddk": return new BddkAdapter(o);
    case "epdk": return new EpdkAdapter(o);
    case "botas": return new BotasAdapter(o);
    default: return undefined;
  }
}
