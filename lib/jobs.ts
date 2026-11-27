import type { JobOpening } from "./types";

/** Cities close enough to count as "near" each other for job listings. */
export const NEARBY: Record<string, string[]> = {
  "Santa Clara": ["San Jose", "Sunnyvale", "Mountain View", "Milpitas", "Cupertino"],
  "Mountain View": ["Sunnyvale", "Palo Alto", "Santa Clara", "Los Altos"],
};

/** True when a job's location is in the site's city or a neighboring one. */
export function isNear(city: string, location: string): boolean {
  return [city, ...(NEARBY[city] ?? [])].some((c) => location.startsWith(c));
}

export function splitByDistance(city: string, jobs: JobOpening[]) {
  const near = jobs.filter((j) => isNear(city, j.location));
  return { near, elsewhere: jobs.filter((j) => !near.includes(j)) };
}

/** A live Indeed search. An empty location searches the whole US. */
export function jobSearchUrl(query: string, location: string): string {
  const params = new URLSearchParams({ q: query });
  if (location) params.set("l", location);
  return `https://www.indeed.com/jobs?${params.toString()}`;
}

/** Common data center roles, with the search phrase used for each. */
export const ROLE_SEARCHES: { label: string; query: string }[] = [
  { label: "Data center technician", query: "Data center technician" },
  { label: "Critical facilities engineer", query: "Critical facilities engineer" },
  { label: "Electrician", query: "Data center electrician" },
  { label: "HVAC and cooling technician", query: "Data center HVAC" },
  { label: "Construction", query: "Data center construction" },
];
