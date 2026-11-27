import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the build script
import { checkData } from "../../scripts/check-data.mjs";

const valid = () => ({
  asOf: "2026-11-27",
  sources: { a: { title: "A", publisher: "Pub A", url: "https://a.example", accessed: "2026-11-27" } },
  operators: {
    Op: {
      careers: { url: "https://jobs.example", sources: ["a"] },
      openings: { checked: "2026-11-27", sources: ["a"], items: [{ title: "Tech", location: "Santa Clara, CA", url: "https://jobs.example/1" }] },
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

  it("rejects job data without a checked date, source, or https link", () => {
    expect(errorsFor((d) => (d.operators.Op.openings.checked = "")).join()).toMatch(/needs a checked date/);
    expect(errorsFor((d) => (d.operators.Op.openings.sources = [])).join()).toMatch(/openings: no source/);
    expect(errorsFor((d) => (d.operators.Op.openings.items[0].url = "javascript:alert(1)")).join()).toMatch(/url must be https/);
    expect(errorsFor((d) => (d.operators.Op.careers.url = "http://jobs.example")).join()).toMatch(/careers: url must be https/);
  });
});

describe("checkData link rules", () => {
  it("rejects short-lived tracking links for jobs, which stop working", () => {
    expect(errorsFor((d) => (d.operators.Op.openings.items[0].url = "https://to.indeed.com/aawkzdcsy6zd")).join()).toMatch(/tracking link/);
  });
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
