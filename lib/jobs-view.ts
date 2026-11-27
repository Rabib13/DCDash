/**
 * The jobs layer on the map: what's filtered, how it reads from and writes to the address,
 * and the per-city circles drawn on the map.
 */
import { CATEGORY_LABEL, citiesWithin, type Category, type Job, type JobsSnapshot } from "./jobfeeds";
import { CITY_CENTER } from "./sites";

/** How long the server keeps jobs before reading the job boards again. */
export const REFRESH_HOURS = 6;

/** How far "near" reaches, in miles. The site cards use the same distance. */
export const NEAR_MILES = 10;

/** At most one of `city` (that city only) and `near` (within NEAR_MILES of it) is set. */
export type JobsView = { role: string; employer: string; city: string; near: string; tab: "" | "ways" };

export const EMPTY_VIEW: JobsView = { role: "", employer: "", city: "", near: "", tab: "" };

/** One color per role type, used for the rings on the map and the dots by each filter. */
export const CATEGORY_COLOR: Record<Category, string> = {
  operations: "#2f6fdf",
  facilities: "#16a3a3",
  electrical: "#e0a100",
  mechanical: "#d4572a",
  construction: "#8a5a2b",
  network: "#7b4fd6",
  planning: "#c2408f",
  systems: "#1f8a5b",
  security: "#55606e",
  other: "#9aa0a6",
};

/** The jobs view in an address's query string, or null when the jobs layer isn't open. */
export function parseJobsView(search: string): JobsView | null {
  const q = new URLSearchParams(search);
  if (q.get("jobs") !== "1") return null;
  const role = q.get("role") ?? "";
  const city = q.get("city") ?? "";
  return {
    role: role in CATEGORY_LABEL ? role : "",
    employer: q.get("employer") ?? "",
    city,
    near: city ? "" : q.get("near") ?? "",
    tab: q.get("tab") === "ways" ? "ways" : "",
  };
}

/** The query string for a jobs view: "" when the layer is closed. */
export function viewQuery(view: JobsView | null): string {
  if (!view) return "";
  const q = new URLSearchParams({ jobs: "1" });
  for (const k of ["role", "employer", "city", "near", "tab"] as const) if (view[k]) q.set(k, view[k]);
  return `?${q}`;
}

/** A link that opens the map's jobs layer with these filters. */
export const jobsHref = (view: Partial<JobsView>) => `/${viewQuery({ ...EMPTY_VIEW, ...view })}`;

export function matchesView(job: Job, view: JobsView, nearCities = view.near ? new Set(citiesWithin(view.near, NEAR_MILES)) : null): boolean {
  if (view.role && job.category !== view.role) return false;
  if (view.employer && job.employer !== view.employer) return false;
  if (view.city && job.city !== view.city) return false;
  if (view.near && (job.city === null || !nearCities?.has(job.city))) return false;
  return true;
}

/** `count` is jobs based only in the Bay Area, like the headline; `elsewhere` is jobs that also list other places. */
export type CityBubble = { city: string; lngLat: [number, number]; count: number; elsewhere: number; roles: { role: Category; count: number }[] };

/** One circle per city with jobs, biggest first, with how many of each role type its count holds. */
export function cityBubbles(jobs: Job[]): CityBubble[] {
  const by = new Map<string, Job[]>();
  for (const j of jobs) {
    if (!j.city || !CITY_CENTER[j.city]) continue;
    by.set(j.city, [...(by.get(j.city) ?? []), j]);
  }
  return [...by]
    .map(([city, all]) => {
      const local = all.filter((j) => !j.alsoElsewhere);
      const roles = new Map<Category, number>();
      for (const j of local.length ? local : all) roles.set(j.category, (roles.get(j.category) ?? 0) + 1);
      return {
        city,
        lngLat: CITY_CENTER[city],
        count: local.length,
        elsewhere: all.length - local.length,
        roles: [...roles].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role)),
      };
    })
    .sort((a, b) => b.count - a.count || b.elsewhere - a.elsewhere || a.city.localeCompare(b.city));
}

/** Browsers may keep a complete list for 5 minutes, but never one the server is still filling in. */
export const cacheControl = (snap: JobsSnapshot) => (snap.refreshing ? "no-store" : "public, max-age=300");

/** A ring split into one slice per role type, sized by its share of the city's jobs. */
export function ringGradient(roles: { role: Category; count: number }[]): string {
  const total = roles.reduce((a, r) => a + r.count, 0);
  let at = 0;
  const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
  const stops = roles.map((r) => {
    const from = at;
    at += (r.count / total) * 100;
    return `${CATEGORY_COLOR[r.role]} ${pct(from)} ${pct(at)}`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/** Circle diameter in pixels: grows with the square root of the count, so area tracks jobs. */
export const bubbleSize = (count: number) => Math.round(Math.min(72, 30 + 7 * Math.sqrt(count)));

/** The number inside a circle: jobs based only here, or "+N" when every job there also lists other places. */
export const bubbleText = (b: CityBubble) => (b.count === 0 && b.elsewhere > 0 ? `+${b.elsewhere}` : String(b.count));
