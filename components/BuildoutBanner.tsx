"use client";

import { about, type BuildoutSummary } from "@/lib/buildout";

type WaysIn = { apprenticeships: number; freeApprenticeships: number; other: number };

/** What the AI buildout brings Bay Area residents, shown on the map without a click. Only sourced numbers. */
export default function BuildoutBanner({
  summary,
  ways,
  onSeeJobs,
  onSeeWays,
  onSeeBenefits,
  onHide,
}: {
  summary: BuildoutSummary;
  ways: WaysIn;
  onSeeJobs: () => void;
  onSeeWays: () => void;
  onSeeBenefits: () => void;
  onHide: () => void;
}) {
  const { open, topEmployers, moreEmployers, kinds, planned, benefitSites, benefitExample, siteCount } = summary;
  return (
    <section className="buildout" data-testid="buildout-banner" aria-label="What the AI buildout brings here">
      <div className="buildout__head">
        <h2>What the AI buildout brings here</h2>
        <button type="button" className="close" onClick={onHide} aria-label="Hide summary">
          ×
        </button>
      </div>
      <div className="buildout__stats">
        <div className="buildout__stat">
          {open === null ? (
            <p className="muted">Loading open jobs…</p>
          ) : (
            <p>
              <strong>
                {open} job{open === 1 ? "" : "s"} open now
              </strong>{" "}
              {topEmployers.length > 0 && (
                <>
                  at {topEmployers.join(", ")}
                  {moreEmployers > 0 ? ` and ${moreEmployers} more` : ""}
                </>
              )}
              {kinds > 0 && `, across ${kinds} kind${kinds === 1 ? "" : "s"} of work`}
            </p>
          )}
          <button type="button" className="button" onClick={onSeeJobs}>
            See open jobs
          </button>
        </div>
        {ways.apprenticeships > 0 && (
          <div className="buildout__stat">
            <p>
              <strong>Ways in without a degree:</strong> {ways.apprenticeships} paid apprenticeships nearby
              {ways.freeApprenticeships > 0 ? `, ${ways.freeApprenticeships} with no tuition` : ""}
              {ways.other > 0 ? `, plus ${ways.other} college and free training programs` : ""}
            </p>
            <button type="button" className="button button--quiet" onClick={onSeeWays}>
              See ways in
            </button>
          </div>
        )}
        {planned.filings > 0 && (
          <div className="buildout__stat">
            <p>
              <strong>{about(planned.permanent)} permanent jobs</strong> and <strong>{about(planned.construction)} construction workers</strong> at
              the busiest point, planned from {planned.filings} sites&apos; filings
            </p>
          </div>
        )}
      </div>
      <div className="buildout__stat buildout__stat--note">
        {benefitSites === 0 || !benefitExample ? (
          <p className="muted">No community benefit agreements or local grants are documented for these sites yet.</p>
        ) : (
          <p className="muted">
            {benefitSites} of {siteCount} sites have documented community benefits, such as {benefitExample.value} at {benefitExample.site} in{" "}
            {benefitExample.city}. Most have none on record.
          </p>
        )}
        <button type="button" className="button button--quiet" onClick={onSeeBenefits}>
          See community benefits
        </button>
      </div>
    </section>
  );
}
