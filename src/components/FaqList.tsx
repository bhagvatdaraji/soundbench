import type { FaqItem } from '../help/faq';

/** Questions only; the answer opens on tap (native details/summary, accessible). */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="faq">
      {items.map((f) => (
        <details key={f.id} className="faq-item">
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
