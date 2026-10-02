import { PublisherInfo } from "@/components/PublisherInfo";

export const metadata = { title: "Künye" };

/** Basın Kanunu internet haber sitesi yükümlülüğü (şartname §10; 7418 sayılı değişiklik): bkz. PublisherInfo. */
export default function Page() {
  return (
    <div className="k-prose">
      <h1>Künye</h1>
      <h2>Yayıncı ve iletişim</h2>
      <PublisherInfo />
      <h2>Yayın ilkeleri</h2>
      <p>Haberler yalnızca resmi kaynaklardan (Resmi Gazete, KAP, TCMB, TÜİK, SPK, BDDK, EPDK, BOTAŞ) alınan belgelerden otomatik üretilir ve editör kurallarından geçer; her haberde kaynak belge bağlantısı bulunur. Yorum, tahmin ve yatırım tavsiyesi içermez. Hatalar <a href="/duzeltme-politikasi">düzeltme politikası</a> uyarınca düzeltilir; içerik en az 2 yıl saklanır.</p>
      <p>Yatırım tavsiyesi değildir.</p>
    </div>
  );
}
