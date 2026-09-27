/** "Kaynak belge" kutusu (şartname §6.3): belge adı, kurum, tarih, "Belgeyi aç". */
export function SourceBox({ title, institution, dateLabel, url, excerpt }: { title: string; institution: string; dateLabel: string; url: string; excerpt?: string }) {
  return (
    <aside className="k-src k-card" aria-label="Kaynak belge">
      <span className="k-label" style={{ color: "var(--accent-2)" }}>Kaynak belge</span>
      <h4 className="k-src__title">{title}</h4>
      <p className="k-src__meta k-muted">{institution} · {dateLabel}</p>
      {excerpt && <p className="k-src__excerpt k-body">{excerpt}</p>}
      <a className="k-btn k-btn--ghost" href={url} target="_blank" rel="noopener">Belgeyi aç ↗</a>
      <style>{`
        .k-src{margin:28px 0;border-left:4px solid var(--accent-2)}
        .k-src__title{font-family:var(--font-text);font-size:16px;font-weight:700;margin:6px 0 2px}
        .k-src__meta{font-size:13px;margin:0 0 10px}
        .k-src__excerpt{font-size:14px;margin:0 0 12px;white-space:pre-line}
      `}</style>
    </aside>
  );
}
