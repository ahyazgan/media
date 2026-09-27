export interface KeyFactItem { text: string; quoteFromSource: string }

/** "Belgede ne diyor" — her olgu için belgeden birebir alıntı. */
export function KeyFacts({ facts }: { facts: KeyFactItem[] }) {
  if (!facts.length) return null;
  return (
    <section className="k-facts">
      <h3 className="k-facts__h">Belgede ne diyor</h3>
      <ol className="k-facts__list">
        {facts.map((f, i) => (
          <li key={i} className="k-facts__item">
            <p className="k-facts__text">{f.text}</p>
            <blockquote className="k-facts__quote k-body">“{f.quoteFromSource}”</blockquote>
          </li>
        ))}
      </ol>
      <style>{`
        .k-facts{margin:28px 0}
        .k-facts__h{font-size:22px;margin-bottom:12px}
        .k-facts__list{margin:0;padding:0 0 0 20px}
        .k-facts__item{margin-bottom:14px}
        .k-facts__text{margin:0 0 4px;font-weight:600}
        .k-facts__quote{margin:0;padding:8px 12px;border-left:3px solid var(--line);font-size:14px;font-style:italic}
      `}</style>
    </section>
  );
}
