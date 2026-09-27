import Link from "next/link";
export const metadata = { title: "Çevrimdışı", robots: { index: false } };
/** Service worker'ın ağ yokken gösterdiği sayfa; önbellekteki haberler /haber/[slug] altında açılmaya devam eder. */
export default function OfflinePage() {
  return (
    <div className="k-empty" style={{ margin: "40px auto", maxWidth: 520 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Çevrimdışısınız</h1>
      <p>Bu sayfa önbellekte yok. Daha önce açtığınız haberler ve ana sayfa bağlantı gelene kadar okunabilir.</p>
      <Link href="/" className="k-btn">Ana sayfa</Link>
    </div>
  );
}
