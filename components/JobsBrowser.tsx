"use client";

import { useMemo, useState } from "react";
import { CATEGORY_LABEL, citiesWithin, type Category, type Job } from "@/lib/jobfeeds";

/** How far "near" reaches, in miles. The site cards use the same distance. */
export const NEAR_MILES = 10;
const PAGE = 50;

type Filters = { role: string; employer: string; near: string };

function matches(j: Job, f: Filters, nearCities: Set<string> | null) {
  return (!f.role || j.category === f.role) && (!f.employer || j.employer === f.employer) && (!nearCities || (j.city !== null && nearCities.has(j.city)));
}

export default function JobsBrowser({ jobs, initial }: { jobs: Job[]; initial: Filters }) {
  const [f, setF] = useState<Filters>(initial);
  const [shown, setShown] = useState(PAGE);

  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    setShown(PAGE);
    const q = new URLSearchParams();
    for (const k of ["role", "employer", "near"] as const) if (next[k]) q.set(k, next[k]);
    window.history.replaceState(null, "", q.size ? `/jobs?${q}` : "/jobs");
  };

  const nearCities = f.near ? new Set(citiesWithin(f.near, NEAR_MILES)) : null;
  const employers = useMemo(() => [...new Set(jobs.map((j) => j.employer))].sort(), [jobs]);
  const cities = useMemo(() => [...new Set(jobs.map((j) => j.city).filter((c): c is string => !!c))].sort(), [jobs]);
  // Role counts follow the other filters, so each button says how many jobs it would show.
  const forRoles = jobs.filter((j) => matches(j, { ...f, role: "" }, nearCities));
  const roleCounts = (Object.keys(CATEGORY_LABEL) as Category[])
    .map((c) => ({ c, n: forRoles.filter((j) => j.category === c).length }))
    .filter(({ n, c }) => n > 0 || c === f.role);
  const list = jobs
    .filter((j) => matches(j, f, nearCities))
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? "") || a.title.localeCompare(b.title));

  return (
    <section className="page__section" aria-label="Browse open jobs">
      <div className="chips" role="group" aria-label="Role type">
        <button type="button" className="chip" aria-pressed={!f.role} onClick={() => set({ role: "" })}>
          All roles ({forRoles.length})
        </button>
        {roleCounts.map(({ c, n }) => (
          <button key={c} type="button" className="chip" aria-pressed={f.role === c} onClick={() => set({ role: c })}>
            {CATEGORY_LABEL[c]} ({n})
          </button>
        ))}
      </div>
      <div className="selects">
        <label>
          Employer
          <select value={f.employer} onChange={(e) => set({ employer: e.target.value })}>
            <option value="">All employers</option>
            {employers.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          Near
          <select value={f.near} onChange={(e) => set({ near: e.target.value })}>
            <option value="">Anywhere in the Bay Area</option>
            {[...new Set([...cities, ...(f.near ? [f.near] : [])])].sort().map((c) => (
              <option key={c} value={c}>
                Within {NEAR_MILES} miles of {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.length === 0 ? (
        <p className="note">No open jobs match these filters.</p>
      ) : (
        <ul className="joblist">
          {list.slice(0, shown).map((j) => (
            <li key={j.id}>
              <a href={j.url} target="_blank" rel="noopener noreferrer">
                {j.title}
              </a>
              <span className="muted">
                {j.employer} · {j.city ?? j.location} · {CATEGORY_LABEL[j.category]}
                {j.posted ? ` · posted ${j.posted}` : ""}
              </span>
              {j.alsoElsewhere && <span className="muted">Also based outside the Bay Area: {j.location}</span>}
            </li>
          ))}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" className="button" onClick={() => setShown(shown + PAGE)}>
          Show more ({list.length - shown} left)
        </button>
      )}
    </section>
  );
}
