// The project's sourcing rules as a pure function, so they can be unit tested.
// scripts/validate-data.mjs runs this against data/sites.json before every build.

export const STAGES = new Set([
  "announced",
  "proposed",
  "in_review",
  "approved",
  "under_construction",
  "built_not_energized",
  "operating",
]);

const TRACKING_HOSTS = new Set(["to.indeed.com"]);
const TRACKING_PARAMS = ["from", "utm_source", "utm_medium", "utm_campaign", "tk"];

export function isTrackingLink(url) {
  try {
    const u = new URL(url);
    return TRACKING_HOSTS.has(u.hostname) || TRACKING_PARAMS.some((p) => u.searchParams.has(p));
  } catch {
    return false;
  }
}

/** Returns a list of human-readable rule violations. An empty list means the data is valid. */
export function checkData(data) {
  const errors = [];
  const sources = data.sources ?? {};

  const checkRefs = (where, refs) => {
    if (!Array.isArray(refs) || refs.length === 0) errors.push(`${where}: no source`);
    for (const ref of refs ?? []) if (!sources[ref]) errors.push(`${where}: unknown source "${ref}"`);
  };
  const checkUrl = (where, url) => {
    if (typeof url !== "string" || !url.startsWith("https://")) errors.push(`${where}: url must be https`);
  };
  // Links visitors click to apply must not be short-lived tracking redirects, which stop working.
  const checkJobUrl = (where, url) => {
    checkUrl(where, url);
    if (typeof url === "string" && isTrackingLink(url)) errors.push(`${where}: tracking link, use the plain job page url`);
  };

  for (const [key, s] of Object.entries(sources)) {
    checkUrl(`source ${key}`, s.url);
    if (!s.title || !s.publisher || !s.accessed) errors.push(`source ${key}: needs title, publisher and accessed date`);
  }

  const ids = new Set();
  for (const site of data.sites ?? []) {
    const where = `site ${site.id ?? "(no id)"}`;
    if (!site.id) errors.push(`${where}: needs an id`);
    if (ids.has(site.id)) errors.push(`${where}: duplicate id`);
    ids.add(site.id);
    if (!site.name || !site.city) errors.push(`${where}: needs a name and city`);
    if (!STAGES.has(site.stage)) errors.push(`${where}: unknown stage "${site.stage}"`);
    if (!site.facts?.ai_use) errors.push(`${where}: no ai_use fact. Only sites a source ties to AI belong on the map`);
    for (const [name, fact] of Object.entries(site.facts ?? {})) {
      if (fact.value === undefined || fact.value === null || fact.value === "") errors.push(`${where}.${name}: empty value`);
      checkRefs(`${where}.${name}`, fact.sources);
    }
    const { lat, lon, precision } = site.location ?? {};
    if ((lat == null) !== (lon == null)) errors.push(`${where}: lat and lon must both be set or both be null`);
    if (lat != null && precision !== "address") errors.push(`${where}: exact coordinates need precision "address"`);
    for (const [i, doc] of (site.documents ?? []).entries()) {
      checkUrl(`${where}.documents[${i}]`, doc.url);
      checkRefs(`${where}.documents[${i}]`, doc.sources);
    }
  }

  for (const [name, op] of Object.entries(data.operators ?? {})) {
    if (op.careers) {
      checkJobUrl(`operator ${name}.careers`, op.careers.url);
      checkRefs(`operator ${name}.careers`, op.careers.sources);
    }
    if (op.openings) {
      checkRefs(`operator ${name}.openings`, op.openings.sources);
      if (!op.openings.checked) errors.push(`operator ${name}.openings: needs a checked date`);
      for (const job of op.openings.items ?? []) {
        checkJobUrl(`operator ${name}: job "${job.title}"`, job.url);
        if (!job.title || !job.location) errors.push(`operator ${name}: every job needs a title and location`);
      }
    }
  }

  return errors;
}
