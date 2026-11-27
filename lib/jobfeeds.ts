/**
 * Open jobs read live from employers' own public job feeds (Greenhouse, Lever, Ashby, SmartRecruiters, Workday).
 * Nothing here guesses which building a job is for: postings name a city, so the app matches by employer and city.
 */
import { CITY_CENTER } from "./sites";

export type FeedKind = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workday";

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
  for (const city of BAY_AREA_CITIES) {
    const re = new RegExp(`(^|[^a-z])${fold(city)}(?![a-z])`);
    const m = re.exec(text);
    if (!m) continue;
    const after = text.slice(m.index + m[0].length);
    if (OTHER_STATE.test(after.split(/[;|]/)[0])) continue;
    return city;
  }
  return null;
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

function job(employer: string, id: unknown, title: unknown, location: unknown, url: unknown, posted?: unknown): Job | null {
  const t = String(title ?? "").trim();
  const u = String(url ?? "");
  if (!t || !u.startsWith("https://")) return null;
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

/** Workday gives only relative dates ("Posted 3 Days Ago"), so jobs from it have no posted date. */
export function parseWorkday(employer: string, board: string, body: any): Job[] {
  const base = board.replace(/\/$/, "");
  return keep((body?.jobPostings ?? []).map((j: any) => job(employer, j.externalPath, j.title, j.locationsText, j.externalPath ? base + j.externalPath : "")));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetchImpl: FetchLike, url: string, init?: RequestInit) {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** The most Workday jobs read per employer, to keep one huge board from slowing the page. */
const WORKDAY_MAX = 1000;

async function readFeed(feed: FeedConfig, fetchImpl: FetchLike): Promise<Job[]> {
  switch (feed.kind) {
    case "greenhouse":
      return parseGreenhouse(feed.employer, await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${feed.board}/jobs`));
    case "lever":
      return parseLever(feed.employer, await getJson(fetchImpl, `https://api.lever.co/v0/postings/${feed.board}?mode=json`));
    case "ashby":
      return parseAshby(feed.employer, await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${feed.board}`));
    case "smartrecruiters":
      return parseSmartRecruiters(
        feed.employer,
        feed.board,
        await getJson(fetchImpl, `https://api.smartrecruiters.com/v1/companies/${feed.board}/postings?limit=100`),
      );
    case "workday": {
      const u = new URL(feed.board);
      const tenant = u.hostname.split(".")[0];
      const site = u.pathname.split("/").filter(Boolean).pop();
      const api = `${u.origin}/wday/cxs/${tenant}/${site}/jobs`;
      const out: Job[] = [];
      for (let offset = 0; offset < WORKDAY_MAX; offset += 20) {
        const body = await getJson(fetchImpl, api, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ limit: 20, offset, searchText: "" }),
        });
        out.push(...parseWorkday(feed.employer, feed.board, body));
        if (!body?.jobPostings?.length || offset + 20 >= (body.total ?? 0)) break;
      }
      return out;
    }
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
  }: { fetchImpl?: FetchLike; now?: Date; previous?: JobsSnapshot; onProgress?: (partial: JobsSnapshot) => void } = {},
): Promise<JobsSnapshot> {
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
        const jobs = (await readFeed(feed, fetchImpl)).filter((j) => j.city !== null);
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
