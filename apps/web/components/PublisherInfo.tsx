import { publisher } from "@/lib/publisher";

/** Kanunun saydığı iletişim/künye alanları — künye ve iletişim sayfalarında aynı blok */
export function PublisherInfo() {
  const p = publisher();
  return (
    <dl className="k-publisher">
      <dt>Sahibi / ticari unvan</dt><dd>{p.name}</dd>
      <dt>Sorumlu müdür</dt><dd>{p.editor}</dd>
      <dt>İş yeri adresi</dt><dd>{p.address}</dd>
      <dt>E-posta</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd>
      <dt>Telefon</dt><dd>{p.phone}</dd>
      <dt>Elektronik tebligat adresi (UETS)</dt><dd>{p.uets}</dd>
      <dt>Yer sağlayıcı</dt><dd>{p.hosting}<br />{p.hostingAddress}</dd>
      <dt>İnternet adresi</dt><dd>{p.site}</dd>
    </dl>
  );
}
