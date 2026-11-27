import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the build script
import { checkData, checkFeeds } from "../../scripts/check-data.mjs";

const valid = () => ({
  asOf: "2026-11-27",
  sources: { a: { title: "A", publisher: "Pub A", url: "https://a.example", accessed: "2026-11-27" } },
  operators: {
    Op: {
      careers: { url: "https://jobs.example", sources: ["a"] },
    },
  },
  sites: [
    {
      id: "s1",
      name: "S1",
      city: "Santa Clara",
      location: { lat: null, lon: null, precision: "city" },
      stage: "operating",
      facts: { operator: { value: "Op", sources: ["a"] }, ai_use: { value: "GPUs", sources: ["a"] } },
      documents: [{ title: "Permit", kind: "permit", url: "https://doc.example", sources: ["a"] }],
    },
  ],
});

type Data = ReturnType<typeof valid>;
const errorsFor = (change: (d: Data) => void) => {
  const d = valid();
  change(d);
  return checkData(d) as string[];
};

describe("checkData", () => {
  it("accepts valid data", () => expect(checkData(valid())).toEqual([]));

  it("accepts the real data/sites.json", () => {
    const real = JSON.parse(readFileSync(new URL("../../data/sites.json", import.meta.url), "utf8"));
    expect(checkData(real)).toEqual([]);
  });

  it("rejects a site with no AI evidence and no size", () => {
    expect(errorsFor((d) => delete (d.sites[0].facts as Record<string, unknown>).ai_use).join()).toMatch(/over 20 MW, or tied to AI/);
  });

  it("rejects a fact with no source", () => {
    expect(errorsFor((d) => (d.sites[0].facts.operator.sources = [])).join()).toMatch(/operator: no source/);
  });

  it("rejects a fact citing a source that doesn't exist", () => {
    expect(errorsFor((d) => (d.sites[0].facts.operator.sources = ["nope"])).join()).toMatch(/unknown source "nope"/);
  });

  it("rejects an empty fact value", () => {
    expect(errorsFor((d) => (d.sites[0].facts.operator.value = "")).join()).toMatch(/empty value/);
  });

  it("rejects non-https source urls", () => {
    expect(errorsFor((d) => (d.sources.a.url = "http://a.example")).join()).toMatch(/source a: url must be https/);
  });

  it("rejects a source without a publisher", () => {
    expect(errorsFor((d) => ((d.sources.a as Record<string, string>).publisher = "")).join()).toMatch(/needs title, publisher/);
  });

  it("rejects duplicate site ids", () => {
    expect(errorsFor((d) => d.sites.push({ ...d.sites[0] })).join()).toMatch(/duplicate id/);
  });

  it("rejects an unknown stage", () => {
    expect(errorsFor((d) => (d.sites[0].stage = "rumored")).join()).toMatch(/unknown stage/);
  });

  it("rejects half-set coordinates and coordinates without an address", () => {
    expect(errorsFor((d) => ((d.sites[0].location as { lat: number | null }).lat = 37)).join()).toMatch(/both be set/);
    expect(
      errorsFor((d) => Object.assign(d.sites[0].location, { lat: 37, lon: -122 })).join(),
    ).toMatch(/precision "address"/);
  });

  it("rejects a document without a source or https url", () => {
    expect(errorsFor((d) => (d.sites[0].documents[0].sources = [])).join()).toMatch(/documents\[0\]: no source/);
    expect(errorsFor((d) => (d.sites[0].documents[0].url = "ftp://x")).join()).toMatch(/documents\[0\]: url must be https/);
  });

  it("rejects careers links that aren't https", () => {
    expect(errorsFor((d) => (d.operators.Op.careers.url = "http://jobs.example")).join()).toMatch(/careers: url must be https/);
  });

  it("rejects copied job openings, which go stale; jobs come from live feeds", () => {
    expect(
      errorsFor((d) => Object.assign(d.operators.Op, { openings: { checked: "2026-11-27", sources: ["a"], items: [] } })).join(),
    ).toMatch(/openings go stale/);
  });
});

describe("checkData link rules", () => {
  it("rejects careers links with a tracking parameter", () => {
    expect(errorsFor((d) => (d.operators.Op.careers.url = "https://jobs.example/?from=mcp-claude-jobsearch")).join()).toMatch(/tracking link/);
  });
});

describe("which sites belong on the map", () => {
  const noAi = (d: Data) => delete (d.sites[0].facts as Record<string, unknown>).ai_use;
  const capacity = (mw: unknown) => (d: Data) => {
    noAi(d);
    (d.sites[0].facts as Record<string, unknown>).capacity_mw = { value: mw, sources: ["a"] };
  };

  it("accepts a site over 20 MW with no AI evidence", () => {
    expect(errorsFor(capacity(25))).toEqual([]);
  });

  it("rejects a site of exactly 20 MW with no AI evidence, since the rule is more than 20", () => {
    expect(errorsFor(capacity(20)).join()).toMatch(/over 20 MW/);
  });

  it("rejects a small site with no AI evidence", () => {
    expect(errorsFor(capacity(5)).join()).toMatch(/over 20 MW/);
  });

  it("rejects a site with neither size nor AI evidence", () => {
    expect(errorsFor(noAi).join()).toMatch(/over 20 MW/);
  });

  it("keeps a small site when a source ties it to AI", () => {
    expect(errorsFor((d) => ((d.sites[0].facts as Record<string, unknown>).capacity_mw = { value: 1, sources: ["a"] }))).toEqual([]);
  });

  it("requires the size to be a number", () => {
    expect(errorsFor(capacity("48 MW")).join()).toMatch(/capacity_mw must be a number/);
  });
});

describe("stages", () => {
  it("accepts built, for a finished building not yet confirmed as operating", () => {
    expect(errorsFor((d) => (d.sites[0].stage = "built"))).toEqual([]);
  });
});

describe("job counts from filings", () => {
  const withCount = (key: string, fact: Record<string, unknown>) => (d: Data) => {
    (d.sources as Record<string, unknown>).f = { title: "Filing", publisher: "CEC", url: "https://f.example", published: "2022-03-01", accessed: "2026-11-27" };
    (d.sites[0].facts as Record<string, unknown>)[key] = fact;
  };

  it("accepts a sourced, quoted number from a dated filing", () => {
    expect(errorsFor(withCount("construction_jobs", { value: 300, sources: ["f"], quote: "peak workforce of 300" }))).toEqual([]);
  });

  it("rejects a count that isn't a number", () => {
    expect(errorsFor(withCount("permanent_jobs", { value: "about 30", sources: ["f"], quote: "30" })).join()).toMatch(/permanent_jobs: must be a number/);
  });

  it("rejects a count without the filing's exact words", () => {
    expect(errorsFor(withCount("construction_jobs", { value: 300, sources: ["f"] })).join()).toMatch(/construction_jobs: needs a quote/);
  });

  it("rejects a count from a source with no published date, since readers need to know how old the plan is", () => {
    expect(errorsFor(withCount("permanent_jobs", { value: 30, sources: ["a"], quote: "30 employees" })).join()).toMatch(/permanent_jobs: source "a" needs a published date/);
  });
});

describe("checkFeeds", () => {
  const feed = () => ({ employer: "Op", kind: "greenhouse", board: "op", careersUrl: "https://op.example/careers" });

  it("accepts a valid feed list and the real data/job-feeds.json", () => {
    expect(checkFeeds([feed()])).toEqual([]);
    expect(checkFeeds(JSON.parse(readFileSync(new URL("../../data/job-feeds.json", import.meta.url), "utf8")))).toEqual([]);
  });

  it("rejects an unknown feed type, a missing board, or a non-https careers page", () => {
    expect(checkFeeds([{ ...feed(), kind: "indeed" }]).join()).toMatch(/unknown kind "indeed"/);
    expect(checkFeeds([{ ...feed(), board: "" }]).join()).toMatch(/needs a board/);
    expect(checkFeeds([{ ...feed(), careersUrl: "http://op.example" }]).join()).toMatch(/careersUrl must be https/);
  });

  it("rejects a Workday board that isn't a full https address", () => {
    expect(checkFeeds([{ ...feed(), kind: "workday", board: "op" }]).join()).toMatch(/Workday board must be/);
  });

  it("rejects the same employer listed twice, which would count its jobs twice", () => {
    expect(checkFeeds([feed(), feed()]).join()).toMatch(/Op: listed twice/);
  });
});

describe("job count ranges", () => {
  const withRange = (upTo: unknown) => (d: Data) => {
    (d.sources as Record<string, unknown>).f = { title: "Filing", publisher: "CEC", url: "https://f.example", published: "2022-03", accessed: "2026-11-27" };
    (d.sites[0].facts as Record<string, unknown>).permanent_jobs = { value: 19, upTo, sources: ["f"], quote: "19-21 employees" };
  };
  it("accepts a range like 19 to 21 as value and upTo", () => expect(errorsFor(withRange(21))).toEqual([]));
  it("rejects an upTo that isn't a number above the value", () => {
    expect(errorsFor(withRange(19)).join()).toMatch(/upTo must be a number above value/);
    expect(errorsFor(withRange("21")).join()).toMatch(/upTo must be a number above value/);
  });
});

describe("link-only job feeds", () => {
  it("need only an employer and careers page", () => {
    expect(checkFeeds([{ employer: "Op", kind: "link", careersUrl: "https://op.example/careers" }])).toEqual([]);
  });
});
