import { ContactForm } from "@/components/ContactForm";
import { publisher } from "@/lib/publisher";

export const metadata = { title: "İletişim" };

export default async function Page({ searchParams }: { searchParams: Promise<{ haber?: string }> }) {
  const { haber } = await searchParams;
  const p = publisher();
  return (
    <div className="k-prose">
      <h1>İletişim</h1>
      <p>E-posta: <a href={`mailto:${p.email}`}>{p.email}</a>{p.phone ? <> · Telefon: {p.phone}</> : null}</p>
      <h2>Düzeltme ve tekzip talebi</h2>
      <p>Her haber resmi belgeye dayanır. Bir ifadenin belgeyle çeliştiğini düşünüyorsanız aşağıdaki formu doldurun; talep editör kuyruğuna düşer ve <a href="/duzeltme-politikasi">düzeltme politikası</a> gereği en geç 24 saat içinde yanıtlanır.</p>
      <ContactForm defaultArticle={haber ?? ""} />
    </div>
  );
}
