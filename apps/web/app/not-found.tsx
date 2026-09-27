import Link from "next/link";
export default function NotFound() {
  return (
    <div className="k-empty" style={{ margin: "40px auto", maxWidth: 520 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Sayfa bulunamadı</h1>
      <p>Aradığınız haber yayından kaldırılmış ya da adres hatalı olabilir.</p>
      <Link href="/" className="k-btn">Ana sayfa</Link>
    </div>
  );
}
