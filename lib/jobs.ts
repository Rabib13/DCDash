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
