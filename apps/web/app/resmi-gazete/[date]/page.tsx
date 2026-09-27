import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GazetteList } from "@kaynak/ui";
import { gazetteForDate } from "@/lib/queries";
import { dateLabel, isIsoDate } from "@/lib/format";

export const revalidate = 300;

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  if (!isIsoDate(date)) return {};
  return { title: `Resmi Gazete ${dateLabel(date)}`, description: `${dateLabel(date)} tarihli Resmi Gazete'de yayımlanan yönetmelik, tebliğ, karar ve kanunlar; haberleştirilmiş maddeler.` };
}

export default async function GazetteDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isIsoDate(date)) notFound();
  const entries = await gazetteForDate(date);
  const d = new Date(`${date}T12:00:00Z`);
  const prev = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);
  const next = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
  return (
    <div style={{ maxWidth: 860 }}>
      <span className="k-label" style={{ color: "var(--accent-2)" }}>Resmi Gazete</span>
      <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>{dateLabel(date)}</h1>
      <p className="k-muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        {entries[0]?.issueNo ? `Sayı ${entries[0].issueNo} · ` : ""}{entries.length} madde · {entries.filter((e) => e.status === "published").length} haber
        {" · "}<Link href={`/resmi-gazete/${prev}`}>← {dateLabel(prev)}</Link> · <Link href={`/resmi-gazete/${next}`}>{dateLabel(next)} →</Link>
      </p>
      <GazetteList entries={entries} LinkComponent={NextLink} />
      <p className="k-muted" style={{ fontSize: 13, marginTop: 24 }}>Haber etiketi olmayan maddeler ekonomi okuru için haber değeri taşımadığından yalnızca listelenir; bağlantı resmi belgeye gider.</p>
    </div>
  );
}
