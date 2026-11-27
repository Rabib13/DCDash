"use client";

import localBenefits from "@/data/local-benefits.json";
import { dataset, onMap } from "@/lib/sites";

const SITES = dataset.sites.filter(onMap);

type Local = { id: string; place: string; value: string; quote: string; url: string; publisher: string; published?: string; status?: string; checked: string };

/** Every documented community benefit: per site from the site data, then citywide money and rules, each with its source. */
export default function Benefits({ onOpenSite }: { onOpenSite: (id: string) => void }) {
  const withBenefits = SITES.filter((s) => s.facts.community_benefits);
  const none = SITES.length - withBenefits.length;
  return (
    <section aria-label="Community benefits">
      <p className="muted">
        What data center projects have committed to the places they&apos;re built, from city papers, legal settlements and news. Each item quotes
        its source. We list only what a public source documents.
      </p>
      <h3>At specific sites</h3>
      <ul className="benefits">
        {withBenefits.map((s) => {
          const f = s.facts.community_benefits!;
          return (
            <li key={s.id}>
              <button type="button" className="benefits__site" aria-label={`Open ${s.name}`} onClick={() => onOpenSite(s.id)}>
                {s.name}, {s.city}
              </button>
              <span>{String(f.value).replace(/^./, (c) => c.toUpperCase())}.</span>
              {f.note && <span className="muted">{f.note}.</span>}
              {f.quote && <q className="quote">{f.quote}</q>}
              <span className="muted">
                {f.sources.map((id, i) => (
                  <span key={id}>
                    {i > 0 && " · "}
                    <a href={dataset.sources[id].url} target="_blank" rel="noopener noreferrer">
                      {dataset.sources[id].publisher}
                      {dataset.sources[id].published ? `, ${dataset.sources[id].published}` : ""}
                    </a>
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="note">
        {none} sites have no community benefit on record. That can mean none was agreed, or that it isn&apos;t public yet.
      </p>
      <h3>Citywide</h3>
      <ul className="local-benefits">
        {(localBenefits as Local[]).map((b) => (
          <li key={b.id}>
            <strong>{b.place}</strong>
            <span>{b.value.replace(/^./, (c) => c.toUpperCase())}.</span>
            {b.status && <span className="pathways__status">{b.status}</span>}
            <q className="quote">{b.quote}</q>
            <span className="muted">
              <a href={b.url} target="_blank" rel="noopener noreferrer">
                {b.publisher}
                {b.published ? `, ${b.published}` : ""}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
