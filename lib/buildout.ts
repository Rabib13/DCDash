/** The banner on the map: what the buildout brings Bay Area residents, from sourced data only. */
import type { Category, JobsSnapshot } from "./jobfeeds";
import { jobTotals } from "./sites";
import type { Pathway, Site } from "./types";

export type BuildoutSummary = {
  /** Open jobs based only in the Bay Area, or null when jobs haven't loaded. */
  open: number | null;
  topEmployers: string[];
  moreEmployers: number;
  /** Kinds of work among those jobs, not counting "Other roles". */
  kinds: number;
  planned: { permanent: number; construction: number; filings: number };
  /** Sites with a sourced community benefit, and one to name in the banner. */
  benefitSites: number;
  benefitExample: { value: string; site: string; city: string } | null;
  siteCount: number;
};

export function buildoutSummary(snap: JobsSnapshot | null | undefined, sites: Site[]): BuildoutSummary {
  const local = snap ? snap.jobs.filter((j) => !j.alsoElsewhere) : [];
  const byEmployer = new Map<string, number>();
  for (const j of local) byEmployer.set(j.employer, (byEmployer.get(j.employer) ?? 0) + 1);
  const ranked = [...byEmployer].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([e]) => e);
  const kinds = new Set<Category>(local.map((j) => j.category));
  kinds.delete("other");
  const totals = jobTotals(sites);
  const withBenefits = sites.filter((s) => s.facts.community_benefits);
  return {
    open: snap ? local.length : null,
    topEmployers: ranked.slice(0, 3),
    moreEmployers: Math.max(0, ranked.length - 3),
    kinds: kinds.size,
    planned: {
      permanent: totals.permanent.total,
      construction: totals.construction.total,
      filings: sites.filter((s) => s.facts.permanent_jobs || s.facts.construction_jobs).length,
    },
    siteCount: sites.length,
    benefitSites: withBenefits.length,
    benefitExample: withBenefits[0]
      ? { value: String(withBenefits[0].facts.community_benefits!.value), site: withBenefits[0].name, city: withBenefits[0].city }
      : null,
  };
}

/** Rounds a planned total for a headline, since filings' peaks don't all land at once: 2,834 → "about 2,800". */
export const about = (n: number) => `about ${(n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10).toLocaleString("en-US")}`;

/** Ways in for the banner: paid apprenticeships (and how many charge no tuition), plus college and training programs. */
export function waysInSummary(pathways: Pick<Pathway, "kind" | "paid" | "free">[]) {
  const apprenticeships = pathways.filter((p) => p.kind === "apprenticeship" && p.paid);
  return {
    apprenticeships: apprenticeships.length,
    freeApprenticeships: apprenticeships.filter((p) => p.free).length,
    other: pathways.filter((p) => p.kind !== "apprenticeship").length,
  };
}
