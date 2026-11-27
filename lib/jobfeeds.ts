/**
 * Open jobs read live from employers' own public job feeds (Greenhouse, Lever, Ashby, SmartRecruiters, Workday).
 * Nothing here guesses which building a job is for: postings name a city, so the app matches by employer and city.
 */
import { CITY_CENTER } from "./sites";

export type FeedKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workday"
  | "oracle"
  | "amazon"
  | "eightfold"
  | "neogov"
  | "jobvite-xml";

export type FeedConfig = {
  /** The name shown to visitors. */
  employer: string;
  kind: FeedKind;
  /** The board's slug, or for Workday the board's full address, like https://x.wd1.myworkdayjobs.com/External. */
  board: string;
  /** The employer's careers page, for visitors who want every opening. */
  careersUrl: string;
  /** Other names the site data uses for this employer, such as an owner's legal name. */
  aliases?: string[];
  /** For employers that hire far beyond data centers: keep only titles matching this pattern (case-insensitive). */
  titleFilter?: string;
  /** NEOGOV only: keep only this department, e.g. a city's electric utility. */
  department?: string;
};

export type Category = "operations" | "facilities" | "electrical" | "mechanical" | "construction" | "network" | "security" | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  operations: "Data center operations",
  facilities: "Facilities engineering",
  electrical: "Electrical",
  mechanical: "Mechanical and cooling",
  construction: "Construction",
  network: "Network and hardware",
  security: "Security",
  other: "Other roles",
};

export type Job = {
  id: string;
  employer: string;
  title: string;
  location: string;
  city: string | null;
  url: string;
  /** Day the job was posted (YYYY-MM-DD), only when the feed gives an exact date. */
  posted?: string;
  category: Category;
  /** The posting also lists places outside the Bay Area, so it may not be based here. */
  alsoElsewhere?: boolean;
};

export type FeedStatus = {
  employer: string;
  /** Other names the site data uses for this employer, copied from its feed config. */
  aliases?: string[];
  careersUrl: string;
  ok: boolean;
  /** Bay Area jobs listed for this employer. */
  count: number;
  /** When this employer's jobs were last read successfully. */
  refreshedAt?: string;
  error?: string;
};

export type JobsSnapshot = {
  fetchedAt: string;
  feeds: FeedStatus[];
  jobs: Job[];
  /** True while the first read of the job boards is still running, so the list is incomplete. */
  refreshing?: boolean;
};

/** Bay Area cities a job can be in. Longest names first so "South San Francisco" wins over "San Francisco". */
const BAY_AREA_CITIES = [
  ...new Set([
    ...Object.keys(CITY_CENTER),
    "South San Francisco",
    "Cupertino",
    "Redwood City",
    "San Mateo",
    "Menlo Park",
    "Los Altos",
    "Union City",
    "San Leandro",
    "Berkeley",
    "Richmond",
    "Concord",
    "Walnut Creek",
    "Pleasanton",
    "Dublin",
    "Morgan Hill",
    "Vallejo",
    "Santa Rosa",
    "Brisbane",
    "Burlingame",
  ]),
].sort((a, b) => b.length - a.length);

/** States that would make a same-named city not ours, like Newark, NJ. */
const OTHER_STATE = /,\s*(?!ca\b|california\b|us\b|usa\b|united states\b)[a-z]{2,}/i;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bmt\.?\s+view\b/g, "mountain view");

/** The Bay Area city in a job's location text, or null when it's elsewhere, remote, or vague ("3 Locations"). */
export function bayAreaCity(location: string): string | null {
  const text = fold(location ?? "");
  // The city named first wins, so "Toronto; Sunnyvale; San Jose" is Sunnyvale.
  let best: { city: string; at: number } | null = null;
  for (const city of BAY_AREA_CITIES) {
    const re = new RegExp(`(^|[^a-z])${fold(city)}(?![a-z])`, "g");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const after = text.slice(m.index + m[0].length);
      if (OTHER_STATE.test(after.split(/[;|]/)[0])) continue;
      if (!best || m.index < best.at) best = { city, at: m.index };
      break;
    }
  }
  return best?.city ?? null;
}

const RULES: [Category, RegExp][] = [
  ["construction", /construct|superintendent|foreman|estimator|project engineer|site safety/i],
  ["security", /security (officer|guard|supervisor)|guard\b/i],
  ["electrical", /electric/i],
  ["mechanical", /hvac|mechanic|cooling|chiller|plumb|pipefitter/i],
  ["facilities", /critical facilit|facilit|chief engineer|building engineer|stationary engineer/i],
  ["network", /network|hardware|fiber|cabling|deployment/i],
  ["operations", /data ?cent(er|re)|technician|operations|noc\b|remote hands/i],
];

/** Sorts a job title into a broad role type, so visitors can browse by kind of work. */
export function categorize(title: string): Category {
  return RULES.find(([, re]) => re.test(title))?.[0] ?? "other";
}

const day = (value: unknown): string | undefined => {
  if (value == null || value === "") return undefined;
  const d = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

/** Standing "send us your resume" entries that some boards list as if they were jobs. */
const NOT_A_JOB = /^(open|general) application|talent (community|pool|network)/i;

function job(employer: string, id: unknown, title: unknown, location: unknown, url: unknown, posted?: unknown): Job | null {
  const t = String(title ?? "").trim();
  const u = String(url ?? "");
  if (!t || !u.startsWith("https://") || NOT_A_JOB.test(t)) return null;
  const loc = String(location ?? "").trim();
  const j: Job = { id: `${employer}:${id}`, employer, title: t, location: loc, city: bayAreaCity(loc), url: u, category: categorize(t) };
  if (j.city && loc.split(/;|\|/).some((part) => part.trim() && !bayAreaCity(part))) j.alsoElsewhere = true;
  const p = day(posted);
  if (p) j.posted = p;
  return j;
}

const keep = (jobs: (Job | null)[]) => jobs.filter((j): j is Job => j !== null);

/* eslint-disable @typescript-eslint/no-explicit-any -- feed bodies are untyped JSON */
export function parseGreenhouse(employer: string, body: any): Job[] {
  return keep((body?.jobs ?? []).map((j: any) => job(employer, j.id, j.title, j.location?.name, j.absolute_url, j.first_published ?? j.updated_at)));
}

export function parseLever(employer: string, body: any): Job[] {
  return keep((Array.isArray(body) ? body : []).map((j: any) => job(employer, j.id, j.text, j.categories?.location, j.hostedUrl, j.createdAt)));
}

export function parseAshby(employer: string, body: any): Job[] {
  return keep((body?.jobs ?? []).map((j: any) => job(employer, j.id, j.title, j.location, j.jobUrl, j.publishedAt)));
}

export function parseSmartRecruiters(employer: string, company: string, body: any): Job[] {
  return keep(
    (body?.content ?? []).map((j: any) =>
      job(
        employer,
        j.id,
        j.name,
        [j.location?.city, j.location?.region].filter(Boolean).join(", "),
        `https://jobs.smartrecruiters.com/${company}/${j.id}`,
        j.releasedDate,
      ),
    ),
  );
}

/** Workday lists only relative dates. Returns the day, or nothing for "30+ Days Ago". */
export function parseWorkdayPosted(text: string | undefined, now: Date): string | undefined {
  if (!text) return undefined;
  const days = /today/i.test(text) ? 0 : /yesterday/i.test(text) ? 1 : /(\d+)\s+days?\s+ago/i.exec(text) && !/\+/.test(text) ? Number(/(\d+)/.exec(text)![1]) : null;
  if (days === null) return undefined;
  return new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
}

/** Oracle Recruiting Cloud: every requisition with its primary and secondary locations. */
export function parseOracle(employer: string, board: string, body: any): Job[] {
  const base = board.replace(/\/$/, "");
  const reqs = (body?.items ?? []).flatMap((i: any) => i.requisitionList ?? []);
  return keep(
    reqs.map((r: any) =>
      job(
        employer,
        r.Id,
        r.Title,
        [r.PrimaryLocation, ...(r.secondaryLocations ?? []).map((l: any) => l.Name)].filter(Boolean).join("; "),
        `${base}/job/${r.Id}`,
        r.PostedDate,
      ),
    ),
  );
}
export function parseAmazon(employer: string, body: any): Job[] {
  return keep(
    (body?.jobs ?? []).map((j: any) =>
      job(employer, j.id_icims ?? j.id, j.title, j.normalized_location ?? j.location, j.job_path ? `https://www.amazon.jobs${j.job_path}` : "", j.posted_date),
    ),
  );
}

/** Eightfold career sites (Microsoft, DPR). `origin` is the site's address, like https://apply.careers.microsoft.com. */
export function parseEightfold(employer: string, origin: string, body: any): Job[] {
  return keep(
    (body?.data?.positions ?? []).map((p: any) =>
      job(
        employer,
        p.id,
        p.name,
        (p.standardizedLocations?.length ? p.standardizedLocations : p.locations ?? []).join("; "),
        p.positionUrl ? origin.replace(/\/$/, "") + p.positionUrl : "",
        p.postedTs ? p.postedTs * 1000 : undefined,
      ),
    ),
  );
}

const decodeXml = (s: string) =>
  s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

/** The text of the first <tag> inside an XML fragment, or "". */
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeXml(m[1]) : "";
};
const blocks = (xml: string, name: string) => xml.match(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, "g")) ?? [];

/** NEOGOV / GovernmentJobs RSS, used by many cities, such as Santa Clara for Silicon Valley Power. */
export function parseNeogov(employer: string, xml: string, department?: string): Job[] {
  return keep(
    blocks(xml.replace(/^\uFEFF/, ""), "item")
      .filter((item) => !department || tag(item, "joblisting:department") === department)
      .map((item) => job(employer, tag(item, "joblisting:jobId") || tag(item, "link"), tag(item, "title"), tag(item, "joblisting:location"), tag(item, "link"), tag(item, "pubDate"))),
  );
}

/** Jobvite's XML feed. A posting's copies for other cities share its parentId, so they merge into one job. */
export function parseJobviteXml(employer: string, site: string, xml: string): Job[] {
  const groups = new Map<string, { title: string; date: string; locations: string[] }>();
  for (const j of blocks(xml, "job")) {
    const id = tag(j, "parentId") || tag(j, "id");
    const g = groups.get(id) ?? { title: tag(j, "title"), date: tag(j, "date"), locations: [] };
    const loc = tag(j, "location");
    if (loc && !g.locations.includes(loc)) g.locations.push(loc);
    groups.set(id, g);
  }
  return keep(
    [...groups].map(([id, g]) => {
      const [m, d, y] = g.date.split("/");
      return job(employer, id, g.title, g.locations.join("; "), `https://jobs.jobvite.com/${site}/job/${id}`, y ? `${y}-${m}-${d}` : undefined);
    }),
  );
}

/* eslint-enable @typescript-eslint/no-explicit-any */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type Ctx = { fetchImpl: FetchLike; sleep: (ms: number) => Promise<void>; now: Date };

const RETRIES = 3;

/** GET or POST for JSON. Waits and retries when a board says it's busy (429 or 503). */
async function getJson(ctx: Ctx, url: string, init?: RequestInit) {
  for (let attempt = 0; ; attempt++) {
    const res = await ctx.fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      const after = Number(res.headers.get("retry-after"));
      await ctx.sleep(after > 0 ? after * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

/** Eightfold sites (Microsoft, DPR) allow only a few quick requests, 10 jobs at a time. */
const EIGHTFOLD_PAUSE_MS = 2500;
const EIGHTFOLD_MAX = 600;

async function getText(ctx: Ctx, url: string) {
  const res = await ctx.fetchImpl(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Mozilla/5.0 (compatible; DCDash job reader)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Pause between requests to boards that limit how fast they can be read. */
const WORKDAY_PAUSE_MS = 1500;
/** The most Workday Bay Area jobs read per employer. */
const WORKDAY_MAX = 500;

async function readWorkday(feed: FeedConfig, ctx: Ctx): Promise<Job[]> {
  const u = new URL(feed.board);
  const tenant = u.hostname.split(".")[0];
  const site = u.pathname.split("/").filter(Boolean).pop();
  const cxs = `${u.origin}/wday/cxs/${tenant}/${site}`;
  const post = async (offset: number, ids: string[]) => {
    await ctx.sleep(WORKDAY_PAUSE_MS);
    return getJson(ctx, `${cxs}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ appliedFacets: ids.length ? { locations: ids } : {}, limit: 20, offset, searchText: "" }),
    });
  };
  // The first page lists every location id. Several ids can share a city name, so keep them all.
  const first = await post(0, []);
  const facets = (first?.facets ?? []).flatMap((f: any) => (f.facetParameter === "locations" ? [f] : (f.values ?? []).filter((v: any) => v.facetParameter === "locations")));
  const ids: string[] = facets.flatMap((f: any) => f.values ?? []).filter((v: any) => bayAreaCity(v.descriptor)).map((v: any) => v.id);
  if (ids.length === 0) return [];
  const postings: any[] = [];
  for (let offset = 0; offset < WORKDAY_MAX; offset += 20) {
    const page = await post(offset, ids);
    postings.push(...(page?.jobPostings ?? []));
    if (!page?.jobPostings?.length || offset + 20 >= (page.total ?? 0)) break;
  }
  const base = feed.board.replace(/\/$/, "");
  const out: Job[] = [];
  for (const p of postings) {
    let location = p.locationsText;
    let posted = parseWorkdayPosted(p.postedOn, ctx.now);
    // "7 Locations" hides where the job is, so read its detail page.
    if (!bayAreaCity(location ?? "") && p.externalPath) {
      await ctx.sleep(WORKDAY_PAUSE_MS);
      const info = (await getJson(ctx, `${cxs}${p.externalPath}`, { headers: { accept: "application/json" } }))?.jobPostingInfo ?? {};
      location = [...new Set([info.location, ...(info.additionalLocations ?? [])].filter(Boolean))].join("; ");
      posted = day(info.startDate) ?? posted;
    }
    const j = job(feed.employer, p.externalPath, p.title, location, p.externalPath ? base + p.externalPath : "", posted);
    if (j) out.push(j);
  }
  return out;
}

async function readOracle(feed: FeedConfig, ctx: Ctx): Promise<Job[]> {
  const u = new URL(feed.board);
  const site = u.pathname.split("/").filter(Boolean).pop();
  const out: Job[] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const body = await getJson(
      ctx,
      `${u.origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${site},limit=200,offset=${offset},sortBy=POSTING_DATES_DESC`,
    );
    out.push(...parseOracle(feed.employer, feed.board, body));
    if (offset + 200 >= (body?.items?.[0]?.TotalJobsCount ?? 0)) break;
  }
  return out;
}

async function readFeed(feed: FeedConfig, ctx: Ctx): Promise<Job[]> {
  switch (feed.kind) {
    case "greenhouse":
      return parseGreenhouse(feed.employer, await getJson(ctx, `https://boards-api.greenhouse.io/v1/boards/${feed.board}/jobs`));
    case "lever":
      return parseLever(feed.employer, await getJson(ctx, `https://api.lever.co/v0/postings/${feed.board}?mode=json`));
    case "ashby":
      return parseAshby(feed.employer, await getJson(ctx, `https://api.ashbyhq.com/posting-api/job-board/${feed.board}`));
    case "smartrecruiters": {
      const out: Job[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const body = await getJson(ctx, `https://api.smartrecruiters.com/v1/companies/${feed.board}/postings?limit=100&offset=${offset}`);
        out.push(...parseSmartRecruiters(feed.employer, feed.board, body));
        if (offset + 100 >= (body?.totalFound ?? 0)) break;
      }
      return out;
    }
    case "amazon": {
      const out: Job[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const q = new URLSearchParams({ base_query: feed.board, "normalized_state_name[]": "California", result_limit: "100", offset: String(offset) });
        const body = await getJson(ctx, `https://www.amazon.jobs/en/search.json?${q}`);
        out.push(...parseAmazon(feed.employer, body));
        if (offset + 100 >= (body?.hits ?? 0)) break;
      }
      return out;
    }
    case "eightfold": {
      const origin = new URL(feed.board).origin;
      const out: Job[] = [];
      for (let start = 0; start < EIGHTFOLD_MAX; start += 10) {
        await ctx.sleep(EIGHTFOLD_PAUSE_MS);
        const body = await getJson(ctx, `${feed.board}&start=${start}`);
        out.push(...parseEightfold(feed.employer, origin, body));
        if (!body?.data?.positions?.length || start + 10 >= (body?.data?.count ?? 0)) break;
      }
      return out;
    }
    case "neogov":
      return parseNeogov(feed.employer, await getText(ctx, `https://www.governmentjobs.com/SearchEngine/JobsFeed?agency=${feed.board}`), feed.department);
    case "jobvite-xml": {
      const [site, company] = feed.board.split(":");
      return parseJobviteXml(feed.employer, site, await getText(ctx, `https://app.jobvite.com/CompanyJobs/Xml.aspx?c=${company}`));
    }
    case "workday":
      return readWorkday(feed, ctx);
    case "oracle":
      return readOracle(feed, ctx);
  }
}

/** A failed feed's last good jobs are shown for at most this long, then dropped. */
export const KEEP_FAILED_MS = 7 * 24 * 3600_000;

/** Reads every feed. A feed that fails keeps its previous jobs, marked with when they were last refreshed. */
export async function fetchFeeds(
  feeds: FeedConfig[],
  {
    fetchImpl = fetch as FetchLike,
    now = new Date(),
    previous,
    onProgress,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  }: {
    fetchImpl?: FetchLike;
    now?: Date;
    previous?: JobsSnapshot;
    onProgress?: (partial: JobsSnapshot) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<JobsSnapshot> {
  const ctx: Ctx = { fetchImpl, sleep, now };
  const done: { status: FeedStatus; jobs: Job[] }[] = [];
  const results = await Promise.all(
    feeds.map(async (feed) => {
      const r = await readOne(feed);
      done.push(r);
      onProgress?.(combine(done.map((x) => ({ status: { ...x.status }, jobs: x.jobs }))));
      return r;
    }),
  );
  return combine(results);

  function combine(rs: { status: FeedStatus; jobs: Job[] }[]): JobsSnapshot {
    const seen = new Set<string>();
    const jobs: Job[] = [];
    for (const r of rs) {
      r.status.count = 0;
      for (const j of r.jobs) {
        if (seen.has(j.url)) continue;
        seen.add(j.url);
        jobs.push(j);
        r.status.count++;
      }
    }
    return { fetchedAt: now.toISOString(), feeds: rs.map((r) => r.status), jobs };
  }

  async function readOne(feed: FeedConfig): Promise<{ status: FeedStatus; jobs: Job[] }> {
      try {
        const only = feed.titleFilter ? new RegExp(feed.titleFilter, "i") : null;
        const jobs = (await readFeed(feed, ctx)).filter((j) => j.city !== null && (!only || only.test(j.title)));
        const status: FeedStatus = { employer: feed.employer, careersUrl: feed.careersUrl, ok: true, count: 0, refreshedAt: now.toISOString() };
        if (feed.aliases?.length) status.aliases = feed.aliases;
        return { status, jobs };
      } catch (e) {
        const before = previous?.feeds.find((f) => f.employer === feed.employer);
        const fresh = before?.refreshedAt && now.getTime() - Date.parse(before.refreshedAt) <= KEEP_FAILED_MS;
        const jobs = fresh ? (previous?.jobs ?? []).filter((j) => j.employer === feed.employer) : [];
        const status: FeedStatus = { employer: feed.employer, careersUrl: feed.careersUrl, ok: false, count: 0, error: (e as Error).message };
        if (feed.aliases?.length) status.aliases = feed.aliases;
        if (fresh) status.refreshedAt = before?.refreshedAt;
        return { status, jobs };
      }
  }
}

type Count<K> = { key: K; count: number };
const countBy = <K extends string>(jobs: Job[], key: (j: Job) => K): Count<K>[] => {
  const m = new Map<K, number>();
  for (const j of jobs) m.set(key(j), (m.get(key(j)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

export function summarize(jobs: Job[]) {
  return { total: jobs.length, byCategory: countBy(jobs, (j) => j.category), byEmployer: countBy(jobs, (j) => j.employer) };
}

const MILES_PER_DEG_LAT = 69;

function miles(a: [number, number], b: [number, number]) {
  const dx = (a[0] - b[0]) * MILES_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dy = (a[1] - b[1]) * MILES_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Cities we know the center of within `distance` miles of `city`, including the city itself. */
export function citiesWithin(city: string, distance: number): string[] {
  const c = CITY_CENTER[city];
  if (!c) return [city];
  return Object.entries(CITY_CENTER)
    .filter(([, p]) => miles(c, p) <= distance)
    .map(([name]) => name);
}

export function openingsNear(jobs: Job[], employer: string, city: string, distance: number): Job[] {
  const near = new Set(citiesWithin(city, distance));
  return jobs.filter((j) => j.employer === employer && j.city !== null && near.has(j.city));
}

export function freshnessLabel(iso: string, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "Updated just now";
  const plural = (n: number, unit: string) => `Updated ${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (mins < 60) return plural(mins, "minute");
  if (mins < 48 * 60) return plural(Math.floor(mins / 60), "hour");
  return plural(Math.floor(mins / 1440), "day");
}
