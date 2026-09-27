import { publisher } from "@/lib/publisher";
export const metadata = { title: "KVKK Aydınlatma Metni" };
export default function Page() {
  const p = publisher();
  return (
    <div className="k-prose">
      <h1>KVKK Aydınlatma Metni</h1>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca veri sorumlusu <b>{p.name}</b> ({p.address}) tarafından hazırlanmıştır.</p>
      <h2>Hangi veriler, hangi amaçla</h2>
      <p><b>Sabah bülteni:</b> e-posta adresiniz, yalnızca her sabah bülten göndermek için, açık rızanızla işlenir. Çift onay uygulanır; her bültenin altındaki bağlantıyla abonelikten çıkabilirsiniz.</p>
      <p><b>Bildirimler:</b> tarayıcınızın push uç noktası ve şifreleme anahtarları ile seçtiğiniz kategoriler, yalnızca önemli haber bildirimi göndermek için, açık rızanızla işlenir. Tarayıcı ayarlarından izni kaldırdığınızda kayıt silinir.</p>
      <p><b>İletişim formu:</b> ad, e-posta ve mesajınız, talebinizi yanıtlamak ve düzeltme sürecini kayıt altına almak için işlenir; talep kapatıldıktan sonra 2 yıl saklanır (Basın Kanunu içerik saklama yükümlülüğüne paralel).</p>
      <p><b>Çerezler:</b> zorunlu çerezler dışında çerez kullanılmaz. Reklam çerezleri yalnızca çerez barında "Kabul et" seçildiğinde yüklenir; "Sadece zorunlu" ile reddedilebilir.</p>
      <h2>Aktarım ve saklama</h2>
      <p>Veriler üçüncü taraflarla paylaşılmaz; yalnızca hizmetin çalışması için gerekli altyapı sağlayıcısında ({p.hosting}) saklanır. Push bildirimleri tarayıcı üreticisinin push servisi üzerinden iletilir.</p>
      <h2>Haklarınız</h2>
      <p>Kanunun 11. maddesi kapsamındaki haklarınızı (bilgi alma, düzeltme, silme, itiraz) <a href={`mailto:${p.email}`}>{p.email}</a> adresine yazarak kullanabilirsiniz; başvurular en geç 30 gün içinde yanıtlanır.</p>
    </div>
  );
}
