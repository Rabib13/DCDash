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
/** Facts that must quote a dated source: job plans and community benefits. */
const QUOTED_FACTS = new Set([...JOB_COUNT_FACTS, "community_benefits"]);

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

const PATHWAY_KINDS = new Set(["apprenticeship", "college", "training"]);

/** Ways into data center work, in data/pathways.json: each from the program's own page, quoted and dated. */
export function checkPathways(list) {
  const errors = [];
  const ids = new Set();
  for (const [i, p] of (Array.isArray(list) ? list : []).entries()) {
    const where = `pathway ${p.id || `#${i}`}`;
    if (!p.id) errors.push(`${where}: needs an id`);
    if (ids.has(p.id)) errors.push(`${where}: listed twice`);
    ids.add(p.id);
    if (!p.name) errors.push(`${where}: needs a name`);
    if (!p.provider) errors.push(`${where}: needs a provider`);
    if (!p.city) errors.push(`${where}: needs a city`);
    if (!PATHWAY_KINDS.has(p.kind)) errors.push(`${where}: unknown kind "${p.kind}"`);
    if (typeof p.url !== "string" || !p.url.startsWith("https://")) errors.push(`${where}: url must be https`);
    if (!p.quote || typeof p.quote !== "string") errors.push(`${where}: needs a quote from its page`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.checked ?? "")) errors.push(`${where}: checked must be a date (YYYY-MM-DD)`);
    if ((p.more ?? []).some((m) => typeof m?.url !== "string" || !m.url.startsWith("https://"))) errors.push(`${where}: more links must be https`);
  }
  if (!Array.isArray(list)) errors.push("pathways must be a list");
  return errors;
}

/** Citywide money and rules tied to data centers, in data/local-benefits.json: each quoted from a named source. */
export function checkLocalBenefits(list) {
  const errors = [];
  const ids = new Set();
  for (const [i, b] of (Array.isArray(list) ? list : []).entries()) {
    const where = `local benefit ${b.id || `#${i}`}`;
    if (!b.id) errors.push(`${where}: needs an id`);
    if (ids.has(b.id)) errors.push(`${where}: listed twice`);
    ids.add(b.id);
    if (!b.place) errors.push(`${where}: needs a place`);
    if (!b.value) errors.push(`${where}: needs a value`);
    if (!b.quote) errors.push(`${where}: needs a quote from its source`);
    if (!b.publisher) errors.push(`${where}: needs a publisher`);
    if (typeof b.url !== "string" || !b.url.startsWith("https://")) errors.push(`${where}: url must be https`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.checked ?? "")) errors.push(`${where}: checked must be a date (YYYY-MM-DD)`);
  }
  if (!Array.isArray(list)) errors.push("local benefits must be a list");
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
      if (JOB_COUNT_FACTS.has(name) && typeof fact.value !== "number") errors.push(`${where}.${name}: must be a number`);
      if (QUOTED_FACTS.has(name)) {
        if (!fact.quote) errors.push(`${where}.${name}: needs a quote from the ${JOB_COUNT_FACTS.has(name) ? "filing" : "source"}`);
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
