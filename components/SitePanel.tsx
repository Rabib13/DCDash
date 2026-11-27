"use client";

import { useEffect, useState } from "react";
import {
  CONFIDENCE_LABEL,
  confidence,
  dataset,
  employerFor,
  FACT_LABEL,
  factValueText,
  factSection,
  SECTION_EXPECTED,
  SECTION_LABEL,
  runBy,
  sitePosition,
  stageGroup,
  STAGE_LABEL,
  type Section,
} from "@/lib/sites";
import { jobSearchUrl, ROLE_SEARCHES } from "@/lib/jobs";
import { citiesWithin, freshnessLabel, openingsNear, type JobsSnapshot } from "@/lib/jobfeeds";
import { NEAR_MILES } from "./JobsBrowser";
import type { Fact, Site } from "@/lib/types";

const SECTIONS: Section[] = ["overview", "power", "environment", "jobs", "community"];

/** The year of the newest dated source behind a fact. */
const planYear = (fact: Fact) =>
  fact.sources
    .map((id) => dataset.sources[id]?.published?.slice(0, 4))
    .filter(Boolean)
    .sort()
    .at(-1);

function FactRow({ name, fact }: { name: string; fact: Fact }) {
  const c = confidence(fact);
  return (
    <div className="fact">
      <dt>{FACT_LABEL[name] ?? name}</dt>
      <dd>
        <span>
          {factValueText(fact)}
          {fact.note ? <span className="muted"> ({fact.note})</span> : null}
        </span>
        {fact.quote && <q className="quote">{fact.quote}</q>}
        {(name === "construction_jobs" || name === "permanent_jobs") && planYear(fact) && (
          <span className="muted">Plan in a {planYear(fact)} filing, not a count of today&apos;s staff.</span>
        )}
        <span className="fact__meta">
          <span className={`tag tag--${c}`}>{CONFIDENCE_LABEL[c]}</span>
          {fact.sources
            .filter((id, i, all) => all.findIndex((o) => dataset.sources[o].publisher === dataset.sources[id].publisher) === i)
            .map((id) => (
              <a key={id} href={dataset.sources[id].url} target="_blank" rel="noopener noreferrer">
                {dataset.sources[id].publisher}
              </a>
            ))}
        </span>
      </dd>
    </div>
  );
}

function MissingRow({ name }: { name: string }) {
  return (
    <div className="fact">
      <dt>{FACT_LABEL[name] ?? name}</dt>
      <dd>
        <span className="tag tag--not_disclosed">Not disclosed yet</span>
      </dd>
    </div>
  );
}

let jobsRequest: Promise<JobsSnapshot | null> | undefined;
/** The jobs snapshot, fetched once per page load and shared by every site card. */
function useJobs() {
  const [snap, setSnap] = useState<JobsSnapshot | null | undefined>(undefined);
  useEffect(() => {
    jobsRequest ??= fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let live = true;
    jobsRequest.then((s) => live && setSnap(s));
    return () => {
      live = false;
    };
  }, []);
  return snap;
}

const jobsLink = (params: Record<string, string>) => `/jobs?${new URLSearchParams(params)}`;

function JobsSection({ site, operator }: { site: Site; operator: string | null }) {
  const snap = useJobs();
  const employer = snap ? employerFor(site, snap.feeds) : null;
  const linkOnly = snap?.feeds.find((f) => f.employer === employer && f.linkOnly);
  const op = operator ? dataset.operators[operator] : undefined;
  const near = snap && employer ? openingsNear(snap.jobs, employer, site.city, NEAR_MILES) : [];
  const nearCities = new Set(citiesWithin(site.city, NEAR_MILES));
  const allNear = snap ? snap.jobs.filter((j) => j.city !== null && nearCities.has(j.city)).length : 0;
  return (
    <>
      <section data-testid="site-openings">
        <h3>Open jobs nearby</h3>
        {!operator && !employer && (
          <p className="note">Public sources don&apos;t name who runs this site yet, so we can&apos;t list its own openings.</p>
        )}
        {snap === undefined && <p className="muted">Loading open jobs…</p>}
        {snap === null && <p className="note">We couldn&apos;t load open jobs just now. Try again in a few minutes.</p>}
        {snap && employer && linkOnly && (
          <p className="note">
            {employer}&apos;s job board doesn&apos;t allow automated reading, so we can&apos;t count its openings.{" "}
            <a href={linkOnly.careersUrl} target="_blank" rel="noopener noreferrer">
              See {employer} jobs on its own site
            </a>
          </p>
        )}
        {snap && employer && !linkOnly && (
          <>
            <p>
              {near.length} opening{near.length === 1 ? "" : "s"} at {employer} within {NEAR_MILES} miles of {site.city}
            </p>
            {near.length > 0 && (
              <ul className="jobs">
                {near.slice(0, 5).map((j) => (
                  <li key={j.id}>
                    <a href={j.url} target="_blank" rel="noopener noreferrer">
                      {j.title}
                    </a>
                    <span className="muted">{j.city}</span>
                  </li>
                ))}
              </ul>
            )}
            <a className="button" href={jobsLink({ employer, near: site.city })}>
              See all {employer} jobs
            </a>
            <p className="muted">
              Job postings name a city, not a building, so these may be for any {employer} site nearby. {freshnessLabel(snap.fetchedAt)}.
            </p>
          </>
        )}
        {snap && !employer && operator && (
          <>
            {op?.careersNote ? (
              <p className="note">{op.careersNote}</p>
            ) : op?.careers ? (
              <p className="note">
                {operator} doesn&apos;t publish a job feed we can read yet.{" "}
                <a href={op.careers.url} target="_blank" rel="noopener noreferrer">
                  All {operator} jobs
                </a>
              </p>
            ) : (
              <p className="note">{operator} doesn&apos;t publish a job feed we can read yet.</p>
            )}
          </>
        )}
        {snap && (
          <p>
            <a href={jobsLink({ near: site.city })}>
              All data center jobs near {site.city} ({allNear})
            </a>
          </p>
        )}
      </section>
      <section>
        <h3>Data center jobs anywhere</h3>
        <p className="muted">Common roles at data centers, across all operators.</p>
        <ul className="jobs">
          {ROLE_SEARCHES.map(({ label, query }) => (
            <li key={label}>
              {label}:{" "}
              <a href={jobSearchUrl(query, `${site.city}, CA`)} target="_blank" rel="noopener noreferrer">
                near {site.city}
              </a>
              {" · "}
              <a href={jobSearchUrl(query, "remote")} target="_blank" rel="noopener noreferrer">
                remote
              </a>
              {" · "}
              <a href={jobSearchUrl(query, "")} target="_blank" rel="noopener noreferrer">
                anywhere in the US
              </a>
            </li>
          ))}
        </ul>
        <p className="muted">Links open a live job search on Indeed.</p>
      </section>
    </>
  );
}

export default function SitePanel({ site, onClose }: { site: Site; onClose: () => void }) {
  const [tab, setTab] = useState<Section>("overview");
  useEffect(() => setTab("overview"), [site.id]);

  const who = runBy(site);
  const operator = site.facts.operator ? String(site.facts.operator.value) : null;
  const { approximate } = sitePosition(site, dataset.sites);
  const order = Object.keys(FACT_LABEL);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const entries = Object.entries(site.facts)
    .filter(([k]) => factSection(k) === tab)
    .sort(([a], [b]) => rank(a) - rank(b));
  const missing = SECTION_EXPECTED[tab].filter((k) => !site.facts[k]);
  const docs = tab === "environment" ? site.documents ?? [] : [];
  const usedSources = Array.from(
    new Set([
      ...Object.values(site.facts).flatMap((f) => f.sources),
      ...(site.documents ?? []).flatMap((d) => d.sources),
    ]),
  );

  return (
    <aside className="panel" aria-label={`${site.name} details`}>
      <div className="panel__head">
        <div>
          <h2>{site.name}</h2>
          <p className="muted">
            {who ? `${who.label} ${who.name}` : "Operator not disclosed"} · {site.city}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close site details">
          ×
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Site details">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            className={tab === s ? "tab tab--active" : "tab"}
            onClick={() => setTab(s)}
          >
            {SECTION_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="panel__body" role="tabpanel" aria-label={SECTION_LABEL[tab]}>
        {tab === "overview" && (
          <>
            <span className={`status status--${stageGroup(site.stage)}`}>{STAGE_LABEL[site.stage]}</span>
            {approximate && (
              <p className="note">
                The pin sits at the city center.
                {site.facts.address ? " The address is below." : " No public source gives the exact address yet."}
              </p>
            )}
          </>
        )}

        {tab === "jobs" ? (
          <>
            <dl className="facts">
              {entries.map(([k, f]) => (
                <FactRow key={k} name={k} fact={f} />
              ))}
              {missing.map((k) => (
                <MissingRow key={k} name={k} />
              ))}
            </dl>
            <JobsSection site={site} operator={operator} />
          </>
        ) : (
          (entries.length > 0 || missing.length > 0) && (
            <dl className="facts">
              {entries.map(([k, f]) => (
                <FactRow key={k} name={k} fact={f} />
              ))}
              {missing.map((k) => (
                <MissingRow key={k} name={k} />
              ))}
            </dl>
          )
        )}

        {tab === "environment" && (
          <section>
            <h3>Public documents</h3>
            {docs.length > 0 ? (
              <ul className="sources">
                {docs.map((d) => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      {d.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">We haven&apos;t found a public permit or environmental report for this site yet.</p>
            )}
          </section>
        )}

        {tab === "community" && !site.facts.community_benefits && (
          <p className="note">
            We list grants, benefit agreements and local programs only when a public source documents them. We haven&apos;t found
            one for this site yet.
          </p>
        )}

        {tab === "overview" && (
          <section>
            <h3>All sources</h3>
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
        )}
      </div>
    </aside>
  );
}
