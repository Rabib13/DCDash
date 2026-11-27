// The project's sourcing rules as a pure function, so they can be unit tested.
// scripts/validate-data.mjs runs this against data/sites.json before every build.

export const STAGES = new Set([
  "announced",
  "proposed",
  "in_review",
  "approved",
  "under_construction",
  "built_not_energized",
  "built",
  "operating",
]);

/** Sites larger than this go on the map even without AI evidence (Rabib, 2026-11-27). */
export const MIN_MW = 20;

/** Facts holding job counts stated in a site's filings. */
export const JOB_COUNT_FACTS = new Set(["construction_jobs", "permanent_jobs"]);

export const FEED_KINDS = new Set(["greenhouse", "lever", "ashby", "smartrecruiters", "workday", "oracle", "amazon", "eightfold", "neogov", "jobvite-xml", "link"]);

/** Rules for data/job-feeds.json, the employers whose public job feeds the jobs page reads. */
export function checkFeeds(feeds) {
  const errors = [];
  const names = new Set();
  for (const [i, f] of (Array.isArray(feeds) ? feeds : []).entries()) {
    const where = `feed ${f.employer || `#${i}`}`;
    if (!f.employer) errors.push(`${where}: needs an employer`);
    if (names.has(f.employer)) errors.push(`${where}: listed twice`);
    names.add(f.employer);
    if (!FEED_KINDS.has(f.kind)) errors.push(`${where}: unknown kind "${f.kind}"`);
    if (!f.board && f.kind !== "link") errors.push(`${where}: needs a board`);
    else if (f.kind === "workday" && !/^https:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[^/]+/i.test(f.board))
      errors.push(`${where}: Workday board must be like https://name.wd1.myworkdayjobs.com/Site`);
    for (const k of ["titleFilter", "titleExclude"]) {
      if (f[k] === undefined) continue;
      try {
        new RegExp(f[k], "i");
      } catch {
        errors.push(`${where}: ${k} is not a valid pattern`);
      }
    }
    if (typeof f.careersUrl !== "string" || !f.careersUrl.startsWith("https://")) errors.push(`${where}: careersUrl must be https`);
    else if (isTrackingLink(f.careersUrl)) errors.push(`${where}: careersUrl is a tracking link`);
  }
  if (!Array.isArray(feeds)) errors.push("job feeds must be a list");
  return errors;
}

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
    const mw = site.facts?.capacity_mw?.value;
    if (site.facts?.capacity_mw && typeof mw !== "number") errors.push(`${where}: capacity_mw must be a number`);
    if (!site.facts?.ai_use && !(typeof mw === "number" && mw > MIN_MW))
      errors.push(`${where}: only sites over ${MIN_MW} MW, or tied to AI by a source, belong on the map`);
    for (const [name, fact] of Object.entries(site.facts ?? {})) {
      if (fact.value === undefined || fact.value === null || fact.value === "") errors.push(`${where}.${name}: empty value`);
      checkRefs(`${where}.${name}`, fact.sources);
      if ("upTo" in fact && !(typeof fact.upTo === "number" && typeof fact.value === "number" && fact.upTo > fact.value))
        errors.push(`${where}.${name}: upTo must be a number above value`);
      // Job counts are plans in a filing: a number, in the filing's own words, from a dated document.
      if (JOB_COUNT_FACTS.has(name)) {
        if (typeof fact.value !== "number") errors.push(`${where}.${name}: must be a number`);
        if (!fact.quote) errors.push(`${where}.${name}: needs a quote from the filing`);
        for (const ref of fact.sources ?? [])
          if (sources[ref] && !sources[ref].published) errors.push(`${where}.${name}: source "${ref}" needs a published date`);
      }
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
    // Openings are read live from job feeds (data/job-feeds.json), never copied into the data.
    if (op.openings) errors.push(`operator ${name}: openings go stale, list the employer in data/job-feeds.json instead`);
  }

  return errors;
}
