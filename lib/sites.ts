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

/** Approximate city centers, used only when a site has no sourced address. */
const CITY_CENTER: Record<string, [number, number]> = {
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
  const angle = (2 * Math.PI * i) / sameCity.length - Math.PI / 2;
  const r = 26;
  return { lngLat: center, offset: [Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle))], approximate: true };
}

export const FACT_LABEL: Record<string, string> = {
  operator: "Operator",
  owner: "Owner",
  capacity_mw: "Size (MW)",
  size_sqft: "Building size (sq ft)",
  ai_use: "AI use",
  power_status: "Power",
  power_source: "Power source",
  water: "Water",
  opened: "Opened",
};
