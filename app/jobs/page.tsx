import type { Metadata } from "next";
import Link from "next/link";
import JobsBrowser from "@/components/JobsBrowser";
import { freshnessLabel } from "@/lib/jobfeeds";
import { getJobs, REFRESH_HOURS } from "@/lib/jobs-server";
import { dataset, factValueText, jobTotals, onMap } from "@/lib/sites";
import type { Fact } from "@/lib/types";

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
  const num = (f: Fact | undefined) => (f ? factValueText(f) : "Not stated");
  return (
    <section className="page__section" data-testid="filing-jobs">
      <h2>Jobs the projects expect to create</h2>
      <p>
        Added up, the filings plan about <strong>{totals.permanent.total.toLocaleString("en-US")} permanent jobs</strong> and about{" "}
        <strong>{totals.construction.total.toLocaleString("en-US")} construction workers</strong> in each project&apos;s busiest month, from
        filings for {rows.length} of {totals.siteCount} sites. Construction is temporary, and the projects don&apos;t all build at the same time.
        These are plans stated in each filing, not counts of who works there today. Where a filing gives a range, the total uses the low end.
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
                    <td>{num(s.facts.construction_jobs)}</td>
                    <td>{num(s.facts.permanent_jobs)}</td>
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
  const local = snap.jobs.filter((j) => !j.alsoElsewhere);
  const multi = snap.jobs.length - local.length;
  const employers = new Set(local.map((j) => j.employer)).size;
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
          {local.length} open jobs based in the Bay Area at {employers} employers
        </p>
        {multi > 0 && (
          <p data-testid="jobs-multi">
            Plus {multi} more that can be based here or elsewhere.
          </p>
        )}
        <p className="muted" data-testid="jobs-freshness">
          {freshnessLabel(snap.fetchedAt)} ({when(snap.fetchedAt)} Pacific). The list refreshes every {REFRESH_HOURS} hours.
        </p>
        {snap.refreshing && (
          <p className="note">We&apos;re still reading some employers&apos; job boards, so this list is incomplete. Reload in a minute or two.</p>
        )}
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
            Jobs in Bay Area cities posted on the public job boards of companies that own, run, build or power the data centers on our map.
            For employers that hire for much more than data centers, such as Amazon, Microsoft, Prologis and Lawrence Livermore National
            Laboratory, we keep only data center and infrastructure roles. Postings name a city, not a building, so we never say a job is at a
            specific site. Many construction and electrical jobs are hired through union halls, which don&apos;t post here, and some employers,
            such as CoreSite, Google and PG&amp;E, don&apos;t publish a job feed we can read yet.
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
