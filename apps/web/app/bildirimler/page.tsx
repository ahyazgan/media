import type { Metadata } from "next";
import { PushPreferences } from "@/components/PushPreferences";

export const metadata: Metadata = { title: "Bildirim tercihleri", description: "Kaynak anlık bildirimleri: kategori seçimi ve iptal." };

export default function Page() {
  return (
    <div className="k-prose">
      <span className="k-label">Bildirimler</span>
      <h1>Bildirim tercihleri</h1>
      <p>Yalnızca önemli haberlerde (faiz kararı, enflasyon, büyük KAP bildirimi, tüm sektörü etkileyen düzenleme) bildirim gönderiyoruz. Kategorileri buradan değiştirebilir, aboneliği tek tıkla kapatabilirsiniz. Tarayıcı kimliğiniz dışında veri saklanmaz (<a href="/kvkk">KVKK</a>).</p>
      <PushPreferences />
    </div>
  );
}
