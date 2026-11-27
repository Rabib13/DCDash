import { describe, expect, it } from "vitest";
import { buildoutSummary } from "@/lib/buildout";
import type { Job, JobsSnapshot } from "@/lib/jobfeeds";
import type { Site } from "@/lib/types";

const j = (employer: string, category: Job["category"], alsoElsewhere = false): Job => ({
  id: `${employer}-${Math.random()}`,
  employer,
  title: "t",
  location: "Santa Clara, CA",
  city: "Santa Clara",
  url: "https://x.example/",
  category,
  ...(alsoElsewhere ? { alsoElsewhere } : {}),
});
const snap = (jobs: Job[]): JobsSnapshot => ({ fetchedAt: "2026-11-27T00:00:00Z", feeds: [], jobs });
const site = (facts: Record<string, unknown>) => ({ id: "s", name: "S", city: "Santa Clara", stage: "operating", location: {}, facts }) as unknown as Site;
const fact = (value: number, upTo?: number) => ({ value, ...(upTo ? { upTo } : {}), sources: ["x"] });

describe("buildoutSummary", () => {
  it("counts jobs based here, names the biggest employers, and counts kinds of work", () => {
    const s = buildoutSummary(
      snap([j("Amazon", "operations"), j("Amazon", "electrical"), j("DPR", "construction"), j("DPR", "other"), j("SVP", "electrical"), j("Stack", "network"), j("Far Co", "security", true)]),
      [],
    );
    expect(s.open).toBe(6);
    expect(s.topEmployers).toEqual(["Amazon", "DPR", "Stack"]);
    expect(s.moreEmployers).toBe(1);
    // "Other roles" isn't a kind of work.
    expect(s.kinds).toBe(4);
  });

  it("breaks ties between employers by name, so the banner doesn't shuffle", () => {
    expect(buildoutSummary(snap([j("B", "operations"), j("A", "operations")]), []).topEmployers).toEqual(["A", "B"]);
  });

  it("has no job numbers when jobs couldn't load", () => {
    expect(buildoutSummary(null, []).open).toBeNull();
  });

  it("adds up the jobs the filings plan, using the low end of ranges", () => {
    const s = buildoutSummary(null, [site({ permanent_jobs: fact(19, 21), construction_jobs: fact(200) }), site({ permanent_jobs: fact(30) }), site({})]);
    expect(s.planned).toEqual({ permanent: 49, construction: 200, filings: 2 });
  });

  it("counts sites with a documented community benefit, and says none when there are none", () => {
    expect(buildoutSummary(null, [site({})]).benefitSites).toBe(0);
    expect(buildoutSummary(null, [site({ community_benefits: { value: "Grant fund", sources: ["x"] } }), site({})]).benefitSites).toBe(1);
  });
});

describe("about", () => {
  it("rounds planned totals so they don't read as exact counts", async () => {
    const { about } = await import("@/lib/buildout");
    expect(about(2834)).toBe("about 2,800");
    expect(about(539)).toBe("about 540");
  });
});
