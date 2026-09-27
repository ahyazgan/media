export const metadata = { title: "Düzeltme politikası" };
export default function Page() {
  return (
    <div className="k-prose">
      <h1>Düzeltme politikası</h1>
      <p>Kaynak, her haberi resmi belgeye dayandırır. Bir hata bildirildiğinde ifade belgeyle karşılaştırılır; hata doğrulanırsa haber düzeltilir, sayfanın üstünde "Düzeltildi" notu ve gerekçesi ile önceki sürümlerin geçmişi gösterilir. Belgeyle çelişen haber geri çekilir; sayfa "Geri çekildi" notuyla erişilebilir kalır ve arama motorlarına dizinlenmemesi bildirilir. Hiçbir haber silinmez; içerik en az 2 yıl saklanır.</p>
      <h2>Talep süreci</h2>
      <p>Talepler <a href="/iletisim">iletişim formundan</a> alınır, editör kuyruğuna düşer ve en geç 24 saat içinde e-postayla yanıtlanır. Tekzip ve cevap hakkı talepleri Basın Kanunu'nun ilgili hükümlerine göre değerlendirilir.</p>
      <h2>Otomatik üretim ve insan onayı</h2>
      <p>Haberler yazılımla üretilir; belgede geçmeyen sayı içeren taslaklar yayınlanmaz, yüksek önemli haberler yayından önce editör onayından geçer. Yine de hata olabileceğini kabul ediyor ve her düzeltmeyi açıkça işaretliyoruz.</p>
    </div>
  );
}
