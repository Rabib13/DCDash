import type { Metadata } from "next";
import Link from "next/link";
import JobsBrowser from "@/components/JobsBrowser";
import { freshnessLabel } from "@/lib/jobfeeds";
import { getJobs, REFRESH_HOURS } from "@/lib/jobs-server";
import { dataset, jobTotals, onMap } from "@/lib/sites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data center jobs in the Bay Area · DC Dash",
  description: "Open jobs at the companies that own, run or build Bay Area data centers, read live from their own job boards.",
};

const SITES = dataset.sites.filter(onMap);

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function FilingJobs() {
  const totals = jobTotals(SITES);
  const rows = SITES.filter((s) => s.facts.construction_jobs || s.facts.permanent_jobs);
  const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : "Not stated");
  return (
    <section className="page__section" data-testid="filing-jobs">
      <h2>Jobs the projects expect to create</h2>
      <p>
        About <strong>{totals.construction.total.toLocaleString("en-US")}</strong> construction jobs at peak and{" "}
        <strong>{totals.permanent.total.toLocaleString("en-US")}</strong> permanent jobs, from filings for {rows.length} of {totals.siteCount} sites.
        These are plans stated in each project&apos;s filing, not counts of who works there today.
      </p>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="filing-table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Construction (peak)</th>
                <th scope="col">Permanent</th>
                <th scope="col">Filing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const ids = [...new Set([...(s.facts.construction_jobs?.sources ?? []), ...(s.facts.permanent_jobs?.sources ?? [])])];
                return (
                  <tr key={s.id}>
                    <th scope="row">
                      {s.name}
                      <span className="muted">{s.city}</span>
                    </th>
                    <td>{num(s.facts.construction_jobs?.value)}</td>
                    <td>{num(s.facts.permanent_jobs?.value)}</td>
                    <td>
                      {ids.map((id) => (
                        <a key={id} href={dataset.sources[id].url} target="_blank" rel="noopener noreferrer">
                          {dataset.sources[id].publisher}
                          {dataset.sources[id].published ? `, ${dataset.sources[id].published!.slice(0, 4)}` : ""}
                        </a>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const snap = await getJobs();
  const employers = new Set(snap.jobs.map((j) => j.employer)).size;
  const problems = snap.feeds.filter((f) => !f.ok);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <div className="page">
      <main className="page__inner">
        <Link href="/" className="page__back">
          Back to the map
        </Link>
        <h1>Data center jobs in the Bay Area</h1>
        <p className="headline" data-testid="jobs-headline">
          {snap.jobs.length} open jobs at {employers} data center companies
        </p>
        <p className="muted" data-testid="jobs-freshness">
          {freshnessLabel(snap.fetchedAt)} ({when(snap.fetchedAt)} Pacific). The list refreshes every {REFRESH_HOURS} hours.
        </p>
        {problems.length > 0 && (
          <ul className="note feed-problems" data-testid="feed-problems">
            {problems.map((f) => (
              <li key={f.employer}>
                {f.refreshedAt && f.count > 0
                  ? `${f.employer}: couldn't refresh since ${when(f.refreshedAt)}, showing its last ${f.count} job${f.count === 1 ? "" : "s"}.`
                  : `${f.employer}: couldn't reach its job board, so none of its jobs are listed.`}
              </li>
            ))}
          </ul>
        )}
        <JobsBrowser
          jobs={snap.jobs}
          initial={{ role: one(params.role), employer: one(params.employer), near: one(params.near) }}
        />
        <FilingJobs />
        <section className="page__section">
          <h2>What counts here</h2>
          <p>
            Jobs in Bay Area cities posted on the public job boards of companies that own, run or build the data centers on our map. Postings
            name a city, not a building, so we never say a job is at a specific site. Many construction and electrical jobs are hired through
            contractors and union halls, which don&apos;t post here.
          </p>
          <ul className="careers">
            {snap.feeds.map((f) => (
              <li key={f.employer}>
                <a href={f.careersUrl} target="_blank" rel="noopener noreferrer">
                  {f.employer} careers
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
