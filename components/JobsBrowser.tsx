"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABEL, citiesWithin, type Category, type Job } from "@/lib/jobfeeds";
import { CATEGORY_COLOR, matchesView, NEAR_MILES, type JobsView } from "@/lib/jobs-view";

const PAGE = 50;

/** Role chips, employer and place filters, and the list of jobs. The map owns the filters, so the circles follow them. */
export default function JobsBrowser({ jobs, view, onChange }: { jobs: Job[]; view: JobsView; onChange: (patch: Partial<JobsView>) => void }) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [view.role, view.employer, view.city, view.near]);

  const nearCities = view.near ? new Set(citiesWithin(view.near, NEAR_MILES)) : null;
  const employers = useMemo(() => [...new Set(jobs.map((j) => j.employer))].sort(), [jobs]);
  const place = view.city ? view.city : view.near;
  const cities = useMemo(
    () => [...new Set([...jobs.map((j) => j.city).filter((c): c is string => !!c), ...(place ? [place] : [])])].sort(),
    [jobs, place],
  );
  // Role counts follow the other filters, so each button says how many jobs it would show.
  const forRoles = jobs.filter((j) => matchesView(j, { ...view, role: "" }, nearCities));
  const roleCounts = (Object.keys(CATEGORY_LABEL) as Category[])
    .map((c) => ({ c, n: forRoles.filter((j) => j.category === c).length }))
    .filter(({ n, c }) => n > 0 || c === view.role);
  const list = jobs
    .filter((j) => matchesView(j, view, nearCities))
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? "") || a.title.localeCompare(b.title));
  const placeValue = view.city ? `city:${view.city}` : view.near ? `near:${view.near}` : "";

  return (
    <section className="jobs-browser" aria-label="Browse open jobs">
      <div className="chips" role="group" aria-label="Role type">
        <button type="button" className="chip" aria-pressed={!view.role} onClick={() => onChange({ role: "" })}>
          All roles ({forRoles.length})
        </button>
        {roleCounts.map(({ c, n }) => (
          <button key={c} type="button" className="chip" aria-pressed={view.role === c} onClick={() => onChange({ role: c })}>
            <i className="chip__dot" style={{ background: CATEGORY_COLOR[c] }} aria-hidden="true" />
            {CATEGORY_LABEL[c]} ({n})
          </button>
        ))}
      </div>
      <div className="selects">
        <label>
          Employer
          <select value={view.employer} onChange={(e) => onChange({ employer: e.target.value })}>
            <option value="">All employers</option>
            {employers.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          Place
          <select
            value={placeValue}
            onChange={(e) => {
              const [kind, name = ""] = e.target.value.split(/:(.*)/);
              onChange({ city: kind === "city" ? name : "", near: kind === "near" ? name : "" });
            }}
          >
            <option value="">Anywhere in the Bay Area</option>
            {cities.map((c) => (
              <optgroup key={c} label={c}>
                <option value={`city:${c}`}>In {c}</option>
                <option value={`near:${c}`}>
                  Within {NEAR_MILES} miles of {c}
                </option>
              </optgroup>
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
              <i className="chip__dot" style={{ background: CATEGORY_COLOR[j.category] }} aria-hidden="true" />
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
