"use client";

import { about, type BuildoutSummary } from "@/lib/buildout";

/** What the AI buildout brings Bay Area residents, shown on the map without a click. Only sourced numbers. */
export default function BuildoutBanner({ summary, onSeeJobs, onHide }: { summary: BuildoutSummary; onSeeJobs: () => void; onHide: () => void }) {
  const { open, topEmployers, moreEmployers, kinds, planned, benefitSites } = summary;
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
        {planned.filings > 0 && (
          <div className="buildout__stat">
            <p>
              <strong>{about(planned.permanent)} permanent jobs</strong> and <strong>{about(planned.construction)} construction workers</strong> at
              the busiest point, planned from {planned.filings} sites&apos; filings
            </p>
          </div>
        )}
      </div>
      {benefitSites === 0 ? (
        <p className="muted buildout__note">No community benefit agreements or local grants are documented for these sites yet.</p>
      ) : (
        <p className="muted buildout__note">
          {benefitSites} site{benefitSites === 1 ? " has" : "s have"} a documented community benefit. Tap a site to see it.
        </p>
      )}
    </section>
  );
}
