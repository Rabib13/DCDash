import raw from "@/data/sites.json";
import type { Confidence, Dataset, Fact, Site, Stage } from "./types";

export const dataset = raw as unknown as Dataset;

/** Two or more independent sources = confirmed, one = reported. */
export function confidence(fact: Fact | undefined): Confidence {
  if (!fact || fact.sources.length === 0) return "not_disclosed";
  const publishers = new Set(fact.sources.map((s) => dataset.sources[s]?.publisher ?? s));
  return publishers.size >= 2 ? "confirmed" : "reported";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: "Confirmed in 2+ sources",
  reported: "Reported in 1 source",
  not_disclosed: "Not disclosed",
};

export const STAGE_LABEL: Record<Stage, string> = {
  announced: "Announced",
  proposed: "Proposed",
  in_review: "In review",
  approved: "Approved",
  under_construction: "Under construction",
  built_not_energized: "Built, waiting for power",
  operating: "Operating",
};

/** Marker style group: operating, being built (incl. waiting for power), or planned. */
export function stageGroup(stage: Stage): "operating" | "building" | "planned" {
  if (stage === "operating") return "operating";
  if (stage === "under_construction" || stage === "built_not_energized") return "building";
  return "planned";
}

/** Sites larger than this (MW) go on the map even without AI evidence. Matches scripts/check-data.mjs. */
export const MIN_MW = 20;

/** Who runs the site, else who owns it, for the marker and card header. */
export function runBy(site: Site): { label: string; name: string } | null {
  if (site.facts.operator) return { label: "Run by", name: String(site.facts.operator.value) };
  if (site.facts.owner) return { label: "Owned by", name: String(site.facts.owner.value) };
  return null;
}

export function onMap(site: Site): boolean {
  const mw = site.facts.capacity_mw?.value;
  return Boolean(site.facts.ai_use) || (typeof mw === "number" && mw > MIN_MW);
}

/** The whole Bay Area: Santa Rosa and Vallejo down to Gilroy, Half Moon Bay across to Livermore. */
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [-122.75, 36.95],
  [-121.45, 38.5],
];

/** The smallest box around every site's map position, as [[west, south], [east, north]]. */
export function siteBounds(sites: Site[]): [[number, number], [number, number]] {
  const pts = sites.map((s) => sitePosition(s, sites).lngLat);
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** Approximate city centers, used only when a site has no sourced address. */
export const CITY_CENTER: Record<string, [number, number]> = {
  "Santa Clara": [-121.955, 37.354],
  "San Jose": [-121.886, 37.338],
  "Mountain View": [-122.084, 37.386],
  Sunnyvale: [-122.036, 37.368],
  Milpitas: [-121.899, 37.432],
  Fremont: [-121.988, 37.548],
  Hayward: [-122.081, 37.668],
  Oakland: [-122.271, 37.804],
  "San Francisco": [-122.419, 37.775],
  "Palo Alto": [-122.143, 37.442],
  Gilroy: [-121.568, 37.006],
  Livermore: [-121.768, 37.682],
  Newark: [-122.04, 37.53],
};

/**
 * Map position for a site. Sites without a sourced address sit at their city center, and several in one
 * city are fanned out by a fixed pixel offset so they stay clickable at every zoom level.
 */
export function sitePosition(
  site: Site,
  all: Site[],
): { lngLat: [number, number]; offset: [number, number]; approximate: boolean } {
  if (site.location.lat != null && site.location.lon != null) {
    return { lngLat: [site.location.lon, site.location.lat], offset: [0, 0], approximate: false };
  }
  const center = CITY_CENTER[site.city] ?? [-122.2, 37.6];
  const sameCity = all.filter((s) => s.city === site.city && s.location.lat == null);
  const i = sameCity.findIndex((s) => s.id === site.id);
  if (sameCity.length <= 1) return { lngLat: center, offset: [0, 0], approximate: true };
  // Fill rings outward, each ring holding as many 44 px markers as fit with a small gap.
  const GAP = 48;
  let ring = 0;
  let start = 0;
  for (;;) {
    const r = 30 + ring * GAP;
    const capacity = Math.max(1, Math.floor((2 * Math.PI * r) / GAP));
    const inRing = Math.min(capacity, sameCity.length - start);
    if (i < start + inRing) {
      const angle = (2 * Math.PI * (i - start)) / inRing - Math.PI / 2;
      return { lngLat: center, offset: [Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle))], approximate: true };
    }
    start += inRing;
    ring++;
  }
}

export const FACT_LABEL: Record<string, string> = {
  operator: "Operator",
  owner: "Owner",
  address: "Address",
  capacity_mw: "Size (MW)",
  size_sqft: "Building size (sq ft)",
  ai_use: "AI use",
  opened: "Opened",
  status: "Status",
  utility: "Electric utility",
  power_status: "Power",
  power_source: "Power source",
  grid_upgrades: "Grid upgrades",
  local_rates: "Electric bills",
  water: "Water",
  environmental_review: "Environmental review",
  energy_commission: "Energy Commission",
  air_permit: "Air permit",
  local_jobs: "Jobs at this site",
  community_benefits: "Community benefits",
};

export type Section = "overview" | "power" | "environment" | "jobs" | "community";

export const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview",
  power: "Power & water",
  environment: "Environment",
  jobs: "Jobs",
  community: "Community",
};

/** Which tab each fact appears under. Facts not listed here go under Overview. */
const FACT_SECTION: Record<string, Section> = {
  utility: "power",
  power_status: "power",
  power_source: "power",
  grid_upgrades: "power",
  local_rates: "power",
  water: "power",
  environmental_review: "environment",
  energy_commission: "environment",
  air_permit: "environment",
  local_jobs: "jobs",
  community_benefits: "community",
};

export function factSection(key: string): Section {
  return FACT_SECTION[key] ?? "overview";
}

/** The questions each tab answers, shown as "Not disclosed yet" when no source covers them. */
export const SECTION_EXPECTED: Record<Section, string[]> = {
  overview: ["operator", "capacity_mw", "ai_use"],
  power: ["utility", "power_source", "water"],
  environment: ["environmental_review", "air_permit"],
  jobs: ["local_jobs"],
  community: ["community_benefits"],
};
