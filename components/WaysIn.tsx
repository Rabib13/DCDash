"use client";

import { useState } from "react";
import type { Pathway } from "@/lib/types";

const KIND_LABEL: Record<Pathway["kind"], string> = { apprenticeship: "Apprenticeships", college: "College programs", training: "Free training" };

/** Sourced ways into data center work near the Bay Area: paid apprenticeships, college programs and free training. */
export default function WaysIn({ pathways }: { pathways: Pathway[] }) {
  const [kind, setKind] = useState<Pathway["kind"] | "">("");
  const kinds = (Object.keys(KIND_LABEL) as Pathway["kind"][]).filter((k) => pathways.some((p) => p.kind === k));
  const list = pathways.filter((p) => !kind || p.kind === kind);
  return (
    <section aria-label="Ways in">
      <p className="muted">
        Most data center jobs that don&apos;t need a degree are electrical, mechanical and cooling trades. The main way in is a paid union
        apprenticeship: you earn a wage while you train, often with no tuition. Each listing quotes the program&apos;s own page, read on the date
        shown.
      </p>
      <div className="chips" role="group" aria-label="Kind of program">
        <button type="button" className="chip" aria-pressed={!kind} onClick={() => setKind("")}>
          All ({pathways.length})
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]} ({pathways.filter((p) => p.kind === k).length})
          </button>
        ))}
      </div>
      <ul className="pathways">
        {list.map((p) => (
          <li key={p.id}>
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {p.name}
            </a>
            <span className="muted">
              {p.provider} · {p.city}
            </span>
            <span className="pathways__tags">
              {p.paid && <span className="tag tag--confirmed">Paid while you train</span>}
              {p.free && <span className="tag tag--confirmed">No tuition</span>}
              {p.length && <span className="tag">{p.length}</span>}
            </span>
            {p.pay && <span>Pay: {p.pay}</span>}
            {p.cost && <span>Cost: {p.cost}</span>}
            {p.who && <span>Who can apply: {p.who}</span>}
            {p.status && <span className="pathways__status">{p.status}</span>}
            <q className="quote">{p.quote}</q>
            <span className="muted">
              Checked {p.checked}
              {(p.more ?? []).map((m) => (
                <span key={m.url}>
                  {" · "}
                  <a href={m.url} target="_blank" rel="noopener noreferrer">
                    {m.label}
                  </a>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted">
        Not here yet: Microsoft&apos;s{" "}
        <a href="https://careers.microsoft.com/v2/global/en/datacenteracademy.html" target="_blank" rel="noopener noreferrer">
          Datacenter Academy
        </a>{" "}
        and Google&apos;s{" "}
        <a href="https://datacenters.google/workforce-development-program" target="_blank" rel="noopener noreferrer">
          STAR program
        </a>{" "}
        don&apos;t list a California location.
      </p>
    </section>
  );
}
