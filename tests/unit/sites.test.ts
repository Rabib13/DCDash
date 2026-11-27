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

  it("keeps fanned-out markers at least one marker width (44 px) apart, even with 25 in one city", () => {
    for (const n of [2, 3, 6, 12, 25]) {
      const all = Array.from({ length: n }, (_, i) => site(`s${i}`, "Santa Clara"));
      const pts = all.map((s) => sitePosition(s, all).offset);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]), `${n} sites`).toBeGreaterThanOrEqual(44);
    }
  });

  it("knows the center of every city in the data", async () => {
    const { CITY_CENTER } = await import("@/lib/sites");
    for (const s of dataset.sites) expect(CITY_CENTER[s.city], s.city).toBeDefined();
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

  it("has no jobs data for an operator that runs none of the sites, which would mean a typo", () => {
    const operators = new Set(dataset.sites.map((s) => String(s.facts.operator?.value)));
    for (const name of Object.keys(dataset.operators)) expect(operators.has(name), name).toBe(true);
  });

  it("runBy prefers the operator, then the owner", async () => {
    const { runBy } = await import("@/lib/sites");
    const base = site("x", "Santa Clara");
    expect(runBy(base)).toBeNull();
    expect(runBy({ ...base, facts: { ...base.facts, owner: { value: "O", sources: ["toms-2025-11"] } } })).toEqual({ label: "Owned by", name: "O" });
    expect(
      runBy({ ...base, facts: { ...base.facts, owner: { value: "O", sources: ["toms-2025-11"] }, operator: { value: "P", sources: ["toms-2025-11"] } } }),
    ).toEqual({ label: "Run by", name: "P" });
  });
});

describe("onMap", () => {
  it("includes big sites and AI sites, and nothing else", async () => {
    const { onMap } = await import("@/lib/sites");
    const base = site("x", "Santa Clara");
    const { ai_use: _ai, ...noAi } = base.facts;
    expect(onMap(base)).toBe(true);
    expect(onMap({ ...base, facts: { ...noAi, capacity_mw: { value: 21, sources: ["toms-2025-11"] } } as Site["facts"] })).toBe(true);
    expect(onMap({ ...base, facts: { ...noAi, capacity_mw: { value: 20, sources: ["toms-2025-11"] } } as Site["facts"] })).toBe(false);
  });

  it("every site in the real data qualifies", async () => {
    const { onMap } = await import("@/lib/sites");
    for (const s of dataset.sites) expect(onMap(s), s.id).toBe(true);
  });
});

describe("map bounds", () => {
  it("frame every site in the data", async () => {
    const { MAP_BOUNDS } = await import("@/lib/sites");
    const [[w, s], [e, n]] = MAP_BOUNDS;
    for (const x of dataset.sites) {
      const [lon, lat] = sitePosition(x, dataset.sites).lngLat;
      expect(lon, x.id).toBeGreaterThanOrEqual(w);
      expect(lon, x.id).toBeLessThanOrEqual(e);
      expect(lat, x.id).toBeGreaterThanOrEqual(s);
      expect(lat, x.id).toBeLessThanOrEqual(n);
    }
  });
});

describe("siteBounds", () => {
  it("is the smallest box around every site, so the first view is as zoomed in as possible", async () => {
    const { siteBounds } = await import("@/lib/sites");
    const a = site("a", "Santa Clara", 37.3, -122.0);
    const b = site("b", "Hayward", 37.7, -122.1);
    expect(siteBounds([a, b])).toEqual([
      [-122.1, 37.3],
      [-122.0, 37.7],
    ]);
  });

  it("stays inside the Bay Area box for the real data", async () => {
    const { siteBounds, MAP_BOUNDS } = await import("@/lib/sites");
    const [[w, s], [e, n]] = siteBounds(dataset.sites);
    expect(w).toBeGreaterThanOrEqual(MAP_BOUNDS[0][0]);
    expect(s).toBeGreaterThanOrEqual(MAP_BOUNDS[0][1]);
    expect(e).toBeLessThanOrEqual(MAP_BOUNDS[1][0]);
    expect(n).toBeLessThanOrEqual(MAP_BOUNDS[1][1]);
  });
});
