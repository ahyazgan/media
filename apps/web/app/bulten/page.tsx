import type { Metadata } from "next";
import { NewsletterForm } from "@/components/NewsletterForm";

export const metadata: Metadata = { title: "Sabah bülteni", description: "Her sabah 07:30'da: dün gece Resmi Gazete, bugünün veri takvimi ve en önemli 5 haber." };

const STATES: Record<string, string> = {
  onaylandi: "Aboneliğiniz onaylandı. İlk bülten yarın sabah 07:30'da gelecek.",
  iptal: "Aboneliğiniz iptal edildi. Bir daha bülten gönderilmeyecek.",
  gecersiz: "Bağlantı geçersiz ya da süresi dolmuş. Aşağıdan yeniden abone olabilirsiniz.",
};

export default async function BultenPage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { durum } = await searchParams;
  const msg = durum ? STATES[durum] : undefined;
  return (
    <div className="k-prose">
      <span className="k-label">Sabah bülteni</span>
      <h1>Güne resmi kaynakla başlayın</h1>
      {msg && <p className="k-card" style={{ fontSize: 15 }}>{msg}</p>}
      <p>Her sabah 07:30'da tek e-posta: gece yayımlanan Resmi Gazete'nin ekonomi okurunu ilgilendiren maddeleri, bugünün TCMB/TÜİK veri takvimi ve son 24 saatin en önemli 5 haberi. Yorum yok, reklam yok, yatırım tavsiyesi yok.</p>
      <NewsletterForm />
      <h2>Nasıl çalışır</h2>
      <p>Adresinize bir onay bağlantısı gönderiyoruz; tıklamadan bülten gelmez (çift onay). Her bültenin altında tek tıkla iptal bağlantısı bulunur. Adresiniz yalnızca bülten için saklanır, üçüncü tarafla paylaşılmaz.</p>
    </div>
  );
}
