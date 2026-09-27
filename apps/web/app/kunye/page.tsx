import { publisher } from "@/lib/publisher";

export const metadata = { title: "Künye" };

/** Basın Kanunu internet haber sitesi yükümlülüğü (şartname §10): ticari unvan, adres, e-posta, telefon, hosting, sorumlu müdür. */
export default function Page() {
  const p = publisher();
  return (
    <div className="k-prose">
      <h1>Künye</h1>
      <h2>Yayıncı</h2>
      <p>Ticari unvan: {p.name}<br />Adres: {p.address}<br />E-posta: <a href={`mailto:${p.email}`}>{p.email}</a><br />Telefon: {p.phone || "—"}<br />İnternet adresi: {p.site}</p>
      <h2>Sorumlu müdür</h2>
      <p>{p.editor}</p>
      <h2>Hosting sağlayıcı</h2>
      <p>{p.hosting}</p>
      <h2>Yayın ilkeleri</h2>
      <p>Haberler yalnızca resmi kaynaklardan (Resmi Gazete, KAP, TCMB, TÜİK) alınan belgelerden otomatik üretilir ve editör kurallarından geçer; her haberde kaynak belge bağlantısı bulunur. Yorum, tahmin ve yatırım tavsiyesi içermez. Hatalar <a href="/duzeltme-politikasi">düzeltme politikası</a> uyarınca düzeltilir; içerik en az 2 yıl saklanır.</p>
      <p>Yatırım tavsiyesi değildir.</p>
    </div>
  );
}
