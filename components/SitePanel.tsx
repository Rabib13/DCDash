"use client";

import { CONFIDENCE_LABEL, confidence, dataset, FACT_LABEL, sitePosition, stageGroup, STAGE_LABEL } from "@/lib/sites";
import type { Site } from "@/lib/types";

export default function SitePanel({ site, onClose }: { site: Site; onClose: () => void }) {
  const operator = site.facts.operator ? String(site.facts.operator.value) : "Operator not disclosed";
  const { approximate } = sitePosition(site, dataset.sites);
  const usedSources = Array.from(new Set(Object.values(site.facts).flatMap((f) => f.sources)));

  return (
    <aside className="panel" aria-label={`${site.name} details`}>
      <div className="panel__head">
        <div>
          <h2>{site.name}</h2>
          <p className="muted">
            Run by {operator} · {site.city}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close site details">
          ×
        </button>
      </div>
      <div className="panel__body">
        <span className={`status status--${stageGroup(site.stage)}`}>{STAGE_LABEL[site.stage]}</span>
        {approximate && (
          <p className="note">Location shown at the city center. No public source gives the exact address yet.</p>
        )}
        <dl className="facts">
          {Object.entries(site.facts).map(([key, fact]) => {
            const c = confidence(fact);
            return (
              <div className="fact" key={key}>
                <dt>{FACT_LABEL[key] ?? key}</dt>
                <dd>
                  <span>
                    {typeof fact.value === "number" ? fact.value.toLocaleString("en-US") : fact.value}
                    {fact.note ? <span className="muted"> ({fact.note})</span> : null}
                  </span>
                  {fact.quote && <q className="quote">{fact.quote}</q>}
                  <span className={`tag tag--${c}`}>{CONFIDENCE_LABEL[c]}</span>
                </dd>
              </div>
            );
          })}
        </dl>
        <section>
          <h3>Sources</h3>
          <ul className="sources">
            {usedSources.map((key) => {
              const s = dataset.sources[key];
              return (
                <li key={key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                  <span className="muted">
                    {" "}
                    · {s.publisher}
                    {s.published ? `, ${s.published}` : ""} · checked {s.accessed}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}
