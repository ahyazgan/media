import type { Metadata } from "next";
import { AdInquiryForm } from "@/components/AdInquiryForm";
import { AD_SLOTS, type AdSlotId } from "@/lib/ads";
import { publisher } from "@/lib/publisher";

export const metadata: Metadata = { title: "Reklam", description: "Kaynak'ta reklam: hedef kitle, alanlar ve doğrudan satış." };

export default function Page() {
  const p = publisher();
  const sales = process.env.AD_SALES_EMAIL?.trim() || p.email;
  return (
    <div className="k-prose">
      <span className="k-label">Reklam</span>
      <h1>Karar verenlere, kaynağında ulaşın</h1>
      <p>Kaynak'ın okuru bireysel borsa yatırımcısı, KOBİ sahibi, mali müşavir ve finans sektörü çalışanıdır; Resmi Gazete, KAP, TCMB ve TÜİK bildirimlerini yorumsuz ve belgeye bağlı haber olarak dakikalar içinde okur. Sabah bülteni ve anlık bildirimlerle günün ilk saatlerinde ulaşırız.</p>
      <h2>Alanlar</h2>
      <table className="k-admin__table" style={{ fontSize: 14 }}>
        <thead><tr><th>Alan</th><th>Boyut (masaüstü)</th><th>Boyut (mobil)</th></tr></thead>
        <tbody>{(Object.keys(AD_SLOTS) as AdSlotId[]).map((id) => <tr key={id}><td>{AD_SLOTS[id].description}</td><td>{AD_SLOTS[id].size}</td><td>{AD_SLOTS[id].mobileSize}</td></tr>)}</tbody>
      </table>
      <p>Ek olarak: sabah bülteni sponsorluğu (üst banner, "Sponsorlu" etiketli) ve kategori sponsorluğu.</p>
      <h2>İlkeler</h2>
      <ul>
        <li>Her reklam "Reklam" ya da "Sponsorlu" etiketi taşır; editoryal içerikle karışmaz.</li>
        <li>Kayan/yapışkan kutu, sesli otomatik video ve tam ekran geçiş reklamı kullanılmaz (Better Ads Standards).</li>
        <li>Reklam ve ölçüm çerezleri yalnızca okurun açık rızasıyla yüklenir; alanlar sabit boyutludur, sayfa yerleşimini oynatmaz.</li>
        <li>Yatırım tavsiyesi niteliğinde, kaldıraçlı işlem çağrısı yapan ya da düzenleyici izni olmayan finansal ürün reklamları kabul edilmez.</li>
      </ul>
      <h2>Doğrudan satış</h2>
      <p>Programatik dışı kampanyalar, sponsorluk ve özel paketler için formu doldurun ya da <a href={`mailto:${sales}`}>{sales}</a> adresine yazın. Medya kiti ve güncel erişim rakamları teklifle birlikte gönderilir.</p>
      <AdInquiryForm />
    </div>
  );
}
