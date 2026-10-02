/**
 * Faz 4+ kaynakları (şartname §4): SPK bültenleri (PDF), BDDK / EPDK duyuruları ve BOTAŞ doğal gaz satış tarifesi.
 * Liste adresleri kamuya açık sayfalardır ve kurumlar sık taşır; `<ID>_LIST_URL` ile ezilebilir (ilk liste adresi).
 * Canlıda doğrulandı (2026-10-02, `pnpm --filter @kaynak/sources probe spk bddk epdk botas`); gerçek örnekler fixtures/ altında.
 */
import { ListingAdapter, type ListingOptions } from "./adapter.js";

const TZ = "Europe/Istanbul";
const WEEKDAYS = [1, 2, 3, 4, 5];
type Partial_ = Partial<ListingOptions> & { http?: ListingOptions["http"] };

/**
 * SPK bültenleri: yıllık sayfa, yeniden eskiye; bağlantı metni "Bülten No : 2026/67 Yayımlanma : 30 Eylül 2026 Çarşamba".
 * Bülten haftada birkaç kez çıkar (artık yalnızca Cuma değil); akşam saatlerinde sık taranır.
 */
export const SPK_DEFAULT_LIST = "https://spk.gov.tr/spk-bultenleri/{yil}-yili-spk-bultenleri";
export class SpkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      // Hafta içi 16:00–22:00 arası 10 dk; diğer zamanlarda 2 saat
      schedule: { timezone: TZ, windows: [{ between: ["16:00", "22:00"], everySeconds: 600, weekdays: WEEKDAYS }], defaultEverySeconds: 7_200 },
      linkPattern: /\.pdf(\?|$)/i, titlePattern: /b[üu]lten/i, excludePattern: /\beng?lish\b|\bEN\b/i,
      defaultTime: "18:00",
      titleOf: (it) => {
        const no = /(\d{4})\s*\/\s*(\d{1,3})/.exec(it.title);
        return no ? `SPK Bülteni ${no[1]}/${no[2]}` : it.title;
      },
      section: (it) => ({ section: "bulten", sectionLabel: `SPK Bülteni${it.date ? ` (${it.date})` : ""}` }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "spk", official: true, listUrl: o.listUrl ?? process.env.SPK_LIST_URL ?? SPK_DEFAULT_LIST,
    });
  }
}

/**
 * BDDK: /Duyuru yalnızca kategori listesidir. Basın (39), mevzuat (40) ve kuruluş (48: lisans/izin) duyuruları taranır;
 * duyuru metni detay sayfasındaki PDF ekindedir (/Duyuru/EkGetir/<no>?ekId=). Sunucu zincirin ara sertifikasını
 * göndermez → packages/sources/certs/ (extraCa.ts).
 */
export const BDDK_DEFAULT_LIST = "https://www.bddk.org.tr/Duyuru/Liste/39";
export const BDDK_EXTRA_LISTS = ["https://www.bddk.org.tr/Duyuru/Liste/40", "https://www.bddk.org.tr/Duyuru/Liste/48"];
export class BddkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: WEEKDAYS }], defaultEverySeconds: 3600 },
      containerSelector: ".kategoriList", linkPattern: /\/Duyuru\/Detay\/\d+/i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "10:00",
      extraListUrls: BDDK_EXTRA_LISTS,
      documentSelector: "#content-container", attachmentPattern: /\/Duyuru\/EkGetir\//i,
      section: (it) => (/kurulu? karar/i.test(it.title) ? { section: "kurul-karari", sectionLabel: "BDDK Kurul Kararı" } : { section: "duyuru", sectionLabel: "BDDK Duyurusu" }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "bddk", official: true, listUrl: o.listUrl ?? process.env.BDDK_LIST_URL ?? BDDK_DEFAULT_LIST,
    });
  }
}

/** EPDK duyuruları: #AnnouncementList tablosu (Tarih | Konu | Belge); detayda ana içerik .icerik-orta */
export const EPDK_DEFAULT_LIST = "https://www.epdk.gov.tr/Detay/Icerik/4-0-1/duyurular";
export class EpdkAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: WEEKDAYS }], defaultEverySeconds: 3600 },
      containerSelector: "#AnnouncementList", linkPattern: /\/Detay\/Icerik\/4-\d+\//i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "10:00",
      documentSelector: ".icerik-orta",
      section: (it) => (/tarife|fiyat/i.test(it.title) ? { section: "tarife", sectionLabel: "EPDK Tarife" } : /kurulu? karar/i.test(it.title) ? { section: "kurul-karari", sectionLabel: "EPDK Kurul Kararı" } : { section: "duyuru", sectionLabel: "EPDK Duyurusu" }),
      ...o,
      // Adres yayılımdan sonra: { listUrl: undefined } (boş .env) varsayılanı ezmesin
      id: "epdk", official: true, listUrl: o.listUrl ?? process.env.EPDK_LIST_URL ?? EPDK_DEFAULT_LIST,
    });
  }
}

/**
 * BOTAŞ: haber değeri taşıyan duyuru doğal gaz toptan satış tarifesidir. Satış Fiyat Tarifesi sayfasında yürürlükteki tarife
 * "4 Nisan 2026 Tarihinden İtibaren Geçerli …" kartı olarak durur; yeni tarife yeni kart (yeni adres) demektir. Fiyatlar detay
 * sayfasındaki tablodadır. Kurumsal haberler (ödül, ziyaret) alınmaz.
 */
export const BOTAS_DEFAULT_LIST = "https://www.botas.gov.tr/Sayfa/satis-fiyat-tarifesi/439";
export class BotasAdapter extends ListingAdapter {
  constructor(o: Partial_ = {}) {
    super({
      schedule: { timezone: TZ, windows: [{ between: ["08:00", "19:00"], everySeconds: 900, weekdays: WEEKDAYS }], defaultEverySeconds: 3600 },
      linkPattern: /tarihinden-itibaren-gecerli|tarife/i, titlePattern: /tarife/i, excludePattern: /\/en\/|\beng?lish\b/i, defaultTime: "00:00",
      allowUndated: false,
      documentSelector: "h1, .table-responsive",
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
