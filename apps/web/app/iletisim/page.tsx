import { ContactForm } from "@/components/ContactForm";
import { PublisherInfo } from "@/components/PublisherInfo";

export const metadata = { title: "İletişim" };

export default async function Page({ searchParams }: { searchParams: Promise<{ haber?: string }> }) {
  const { haber } = await searchParams;
  return (
    <div className="k-prose">
      <h1>İletişim</h1>
      <PublisherInfo />
      <h2>Düzeltme ve tekzip talebi</h2>
      <p>Her haber resmi belgeye dayanır. Bir ifadenin belgeyle çeliştiğini düşünüyorsanız aşağıdaki formu doldurun; talep editör kuyruğuna düşer ve <a href="/duzeltme-politikasi">düzeltme politikası</a> gereği en geç 24 saat içinde yanıtlanır.</p>
      <ContactForm defaultArticle={haber ?? ""} />
    </div>
  );
}
