import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LABEL,
  confidence,
  dataset,
  FACT_LABEL,
  factSection,
  SECTION_EXPECTED,
  sitePosition,
  stageGroup,
  STAGE_LABEL,
} from "@/lib/sites";
import type { Site, Stage } from "@/lib/types";

const site = (id: string, city: string, lat: number | null = null, lon: number | null = null): Site => ({
  id,
  name: id,
  city,
  location: { lat, lon, precision: lat == null ? "city" : "address" },
  stage: "operating",
  facts: { ai_use: { value: "AI", sources: ["toms-2025-11"] } },
});

describe("confidence", () => {
  it("is not_disclosed when the fact is missing or has no sources", () => {
    expect(confidence(undefined)).toBe("not_disclosed");
    expect(confidence({ value: "x", sources: [] })).toBe("not_disclosed");
  });

  it("is reported with one source", () => {
    expect(confidence({ value: "x", sources: ["toms-2025-11"] })).toBe("reported");
  });

  it("counts publishers, not source entries, so two pages from one publisher stay reported", () => {
    expect(confidence({ value: "x", sources: ["stack-svy02-page", "stack-svy02a-brochure"] })).toBe("reported");
  });

  it("is confirmed with two different publishers", () => {
    expect(confidence({ value: "x", sources: ["toms-2025-11", "realdeal-2025-11"] })).toBe("confirmed");
  });

  it("has a label for every level", () => {
    for (const level of ["confirmed", "reported", "not_disclosed"] as const) expect(CONFIDENCE_LABEL[level]).toBeTruthy();
  });
});

describe("stageGroup", () => {
  const cases: [Stage, string][] = [
    ["operating", "operating"],
    ["under_construction", "building"],
    ["built_not_energized", "building"],
    ["announced", "planned"],
    ["proposed", "planned"],
    ["in_review", "planned"],
    ["approved", "planned"],
  ];
  it.each(cases)("%s is drawn as %s", (stage, group) => {
    expect(stageGroup(stage)).toBe(group);
    expect(STAGE_LABEL[stage]).toBeTruthy();
  });
});

describe("sitePosition", () => {
  it("uses exact coordinates when a site has them", () => {
    const s = site("a", "Santa Clara", 37.37, -121.96);
    expect(sitePosition(s, [s])).toEqual({ lngLat: [-121.96, 37.37], offset: [0, 0], approximate: false });
  });

  it("puts a lone site without an address at its city center, with no offset", () => {
    const s = site("a", "Mountain View");
    const pos = sitePosition(s, [s]);
    expect(pos.approximate).toBe(true);
    expect(pos.offset).toEqual([0, 0]);
    expect(pos.lngLat).toEqual([-122.084, 37.386]);
  });

  it("fans out several sites in the same city so none overlap", () => {
    const all = [site("a", "Santa Clara"), site("b", "Santa Clara"), site("c", "Santa Clara")];
    const offsets = all.map((s) => sitePosition(s, all).offset.join(","));
    expect(new Set(offsets).size).toBe(3);
    for (const s of all) expect(sitePosition(s, all).lngLat).toEqual([-121.955, 37.354]);
  });

  it("falls back to a Bay Area center for an unknown city", () => {
    const s = site("a", "Nowhere");
    expect(sitePosition(s, [s]).lngLat).toEqual([-122.2, 37.6]);
  });
});

describe("sections", () => {
  it("files power and water facts under Power & water", () => {
    for (const k of ["utility", "power_status", "power_source", "grid_upgrades", "local_rates", "water"]) expect(factSection(k)).toBe("power");
  });

  it("files unknown facts under Overview", () => {
    expect(factSection("operator")).toBe("overview");
    expect(factSection("something_new")).toBe("overview");
  });

  it("has a label for every fact a tab expects", () => {
    for (const keys of Object.values(SECTION_EXPECTED)) for (const k of keys) expect(FACT_LABEL[k]).toBeTruthy();
  });
});

describe("the real dataset", () => {
  it("gives every fact on every site a label, so nothing shows a raw key", () => {
    for (const s of dataset.sites) for (const k of Object.keys(s.facts)) expect(FACT_LABEL[k], `${s.id}.${k}`).toBeTruthy();
  });

  it("has an operators entry for every site operator", () => {
    for (const s of dataset.sites) expect(dataset.operators[String(s.facts.operator?.value)], s.id).toBeDefined();
  });
});
