export const metadata = { title: "Düzeltme politikası" };
export default function Page() {
  return (
    <div className="k-prose">
      <h1>Düzeltme politikası</h1>
      <p>Kaynak, her haberi resmi belgeye dayandırır. Bir hata bildirildiğinde belgeyle karşılaştırılır; hata doğrulanırsa haber düzeltilir, sayfada "Düzeltildi" notu ve önceki sürüm geçmişi gösterilir. Belgeyle çelişen haber geri çekilir ve geri çekildiği belirtilir. Hiçbir haber silinmez; içerik en az 2 yıl saklanır.</p><h2>Talep süreci</h2><p>Talepler iletişim sayfasından alınır ve en geç 24 saat içinde yanıtlanır.</p>
    </div>
  );
}
