import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bayAreaCity,
  categorize,
  citiesWithin,
  fetchFeeds,
  freshnessLabel,
  openingsNear,
  parseAshby,
  parseGreenhouse,
  parseLever,
  parseSmartRecruiters,
  parseAmazon,
  parseEightfold,
  parseJobviteXml,
  parseNeogov,
  parseOracle,
  parseWorkdayPosted,
  summarize,
  type FeedConfig,
  type JobsSnapshot,
} from "@/lib/jobfeeds";

const NOW = new Date("2026-11-27T18:00:00Z");

describe("bayAreaCity", () => {
  it("reads the city from the common location formats", () => {
    expect(bayAreaCity("Santa Clara, CA")).toBe("Santa Clara");
    expect(bayAreaCity("San Jose, California, United States")).toBe("San Jose");
    expect(bayAreaCity("US-CA-Hayward")).toBe("Hayward");
    expect(bayAreaCity("Sunnyvale")).toBe("Sunnyvale");
    expect(bayAreaCity("san josé, ca")).toBe("San Jose");
  });

  it("returns null outside the Bay Area or when the place is vague", () => {
    expect(bayAreaCity("Remote")).toBeNull();
    expect(bayAreaCity("Ashburn, VA")).toBeNull();
    expect(bayAreaCity("3 Locations")).toBeNull();
    expect(bayAreaCity("")).toBeNull();
  });

  it("doesn't mistake a longer place name for a Bay Area city", () => {
    expect(bayAreaCity("Santa Clarita, CA")).toBeNull();
    expect(bayAreaCity("Newark, NJ")).toBeNull();
  });
});

describe("categorize", () => {
  it.each([
    ["Data Center Technician II", "operations"],
    ["Critical Facilities Engineer", "facilities"],
    ["Facilities Manager", "facilities"],
    ["Journeyman Electrician", "electrical"],
    ["Electrical Commissioning Agent", "electrical"],
    ["HVAC Mechanic", "mechanical"],
    ["Mechanical Engineer, Cooling", "mechanical"],
    ["Construction Project Manager", "construction"],
    ["General Superintendent", "construction"],
    ["Security Officer", "security"],
    ["Network Engineer", "network"],
    ["Hardware Deployment Technician", "network"],
    ["Senior Accountant", "other"],
  ])("%s is %s", (title, category) => {
    expect(categorize(title)).toBe(category);
  });
});

describe("feed parsers", () => {
  const employer = "Example Co";

  it("reads Greenhouse jobs", () => {
    const jobs = parseGreenhouse(employer, {
      jobs: [
        {
          id: 11,
          title: "Data Center Technician",
          absolute_url: "https://job-boards.greenhouse.io/example/jobs/11",
          location: { name: "Santa Clara, CA" },
          first_published: "2026-11-20T10:00:00-08:00",
        },
      ],
    });
    expect(jobs).toEqual([
      {
        id: "Example Co:11",
        employer,
        title: "Data Center Technician",
        location: "Santa Clara, CA",
        city: "Santa Clara",
        url: "https://job-boards.greenhouse.io/example/jobs/11",
        posted: "2026-11-20",
        category: "operations",
      },
    ]);
  });

  it("reads Lever jobs", () => {
    const [job] = parseLever(employer, [
      { id: "ab-1", text: "Electrician", hostedUrl: "https://jobs.lever.co/example/ab-1", categories: { location: "San Jose, CA" }, createdAt: Date.parse("2026-11-01T00:00:00Z") },
    ]);
    expect(job).toMatchObject({ title: "Electrician", city: "San Jose", url: "https://jobs.lever.co/example/ab-1", posted: "2026-11-01", category: "electrical" });
  });

  it("reads Ashby jobs", () => {
    const [job] = parseAshby(employer, {
      jobs: [{ id: "x", title: "Security Officer", jobUrl: "https://jobs.ashbyhq.com/example/x", location: "Fremont, CA", publishedAt: "2026-10-05T12:00:00Z" }],
    });
    expect(job).toMatchObject({ city: "Fremont", posted: "2026-10-05", category: "security" });
  });

  it("reads SmartRecruiters jobs", () => {
    const [job] = parseSmartRecruiters(employer, "example", {
      content: [{ id: "77", name: "HVAC Technician", location: { city: "Hayward", region: "CA" }, releasedDate: "2026-11-11T00:00:00Z" }],
    });
    expect(job).toMatchObject({ city: "Hayward", url: "https://jobs.smartrecruiters.com/example/77", category: "mechanical" });
  });

  it("skips entries without a title or an https link", () => {
    expect(parseGreenhouse(employer, { jobs: [{ id: 1, title: "", absolute_url: "https://x.example/1", location: { name: "San Jose" } }] })).toEqual([]);
    expect(parseLever(employer, [{ id: "1", text: "Tech", hostedUrl: "http://x.example/1", categories: { location: "San Jose" } }])).toEqual([]);
  });
});

/** A fake fetch that answers from a table of url -> JSON body, and fails for anything else. */
function fakeFetch(table: Record<string, unknown>, calls: string[] = []) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const key = String(url) + (init?.body ? ` ${init.body}` : "");
    calls.push(key);
    const hit = Object.entries(table).find(([k]) => k === key || k === String(url));
    if (!hit) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const GH: FeedConfig = { employer: "Green Co", kind: "greenhouse", board: "greenco", careersUrl: "https://green.example/careers" };
const LV: FeedConfig = { employer: "Lever Co", kind: "lever", board: "leverco", careersUrl: "https://lever.example/careers" };

describe("fetchFeeds", () => {
  it("keeps only Bay Area jobs and stamps the fetch time", async () => {
    const fetchImpl = fakeFetch({
      "https://boards-api.greenhouse.io/v1/boards/greenco/jobs": {
        jobs: [
          { id: 1, title: "Data Center Technician", absolute_url: "https://g.example/1", location: { name: "Santa Clara, CA" } },
          { id: 2, title: "Data Center Technician", absolute_url: "https://g.example/2", location: { name: "Ashburn, VA" } },
        ],
      },
    });
    const snap = await fetchFeeds([GH], { fetchImpl, now: NOW });
    expect(snap.fetchedAt).toBe(NOW.toISOString());
    expect(snap.jobs.map((j) => j.url)).toEqual(["https://g.example/1"]);
    expect(snap.feeds).toEqual([{ employer: "Green Co", careersUrl: "https://green.example/careers", ok: true, count: 1, refreshedAt: NOW.toISOString() }]);
  });

  it("marks a failed feed and keeps its last good jobs, labeled with when they were last refreshed", async () => {
    const previous: JobsSnapshot = {
      fetchedAt: "2026-11-26T18:00:00Z",
      feeds: [{ employer: "Lever Co", careersUrl: LV.careersUrl, ok: true, count: 1, refreshedAt: "2026-11-26T18:00:00Z" }],
      jobs: [{ id: "Lever Co:1", employer: "Lever Co", title: "Electrician", location: "San Jose, CA", city: "San Jose", url: "https://l.example/1", category: "electrical" }],
    };
    const snap = await fetchFeeds([LV], { fetchImpl: fakeFetch({}), now: NOW, previous });
    expect(snap.feeds[0]).toMatchObject({ employer: "Lever Co", ok: false, count: 1, refreshedAt: "2026-11-26T18:00:00Z" });
    expect(snap.feeds[0].error).toBeTruthy();
    expect(snap.jobs).toHaveLength(1);
  });

  it("drops jobs that have closed since the last fetch", async () => {
    const previous: JobsSnapshot = {
      fetchedAt: "2026-11-26T18:00:00Z",
      feeds: [],
      jobs: [{ id: "Green Co:9", employer: "Green Co", title: "Old job", location: "San Jose, CA", city: "San Jose", url: "https://g.example/9", category: "other" }],
    };
    const fetchImpl = fakeFetch({ "https://boards-api.greenhouse.io/v1/boards/greenco/jobs": { jobs: [] } });
    const snap = await fetchFeeds([GH], { fetchImpl, now: NOW, previous });
    expect(snap.jobs).toEqual([]);
  });

  it("drops a failed feed's old jobs once they are more than 7 days old", async () => {
    const previous: JobsSnapshot = {
      fetchedAt: "2026-11-10T18:00:00Z",
      feeds: [{ employer: "Lever Co", careersUrl: LV.careersUrl, ok: true, count: 1, refreshedAt: "2026-11-10T18:00:00Z" }],
      jobs: [{ id: "Lever Co:1", employer: "Lever Co", title: "Electrician", location: "San Jose, CA", city: "San Jose", url: "https://l.example/1", category: "electrical" }],
    };
    const snap = await fetchFeeds([LV], { fetchImpl: fakeFetch({}), now: NOW, previous });
    expect(snap.jobs).toEqual([]);
    expect(snap.feeds[0]).toMatchObject({ ok: false, count: 0 });
  });

  it("lists the same posting once even if a feed repeats it", async () => {
    const job = { id: 1, title: "Tech", absolute_url: "https://g.example/1", location: { name: "San Jose, CA" } };
    const fetchImpl = fakeFetch({ "https://boards-api.greenhouse.io/v1/boards/greenco/jobs": { jobs: [job, job] } });
    expect((await fetchFeeds([GH], { fetchImpl, now: NOW })).jobs).toHaveLength(1);
  });
});

const SNAP: JobsSnapshot = {
  fetchedAt: NOW.toISOString(),
  feeds: [],
  jobs: [
    { id: "a", employer: "Digital Realty", title: "Data Center Technician", location: "Santa Clara, CA", city: "Santa Clara", url: "https://x.example/a", category: "operations" },
    { id: "b", employer: "Digital Realty", title: "Electrician", location: "San Jose, CA", city: "San Jose", url: "https://x.example/b", category: "electrical" },
    { id: "c", employer: "Digital Realty", title: "Electrician", location: "Hayward, CA", city: "Hayward", url: "https://x.example/c", category: "electrical" },
    { id: "d", employer: "Equinix", title: "Security Officer", location: "San Jose, CA", city: "San Jose", url: "https://x.example/d", category: "security" },
  ],
};

describe("summarize", () => {
  it("counts jobs by role type and by employer, biggest first", () => {
    const s = summarize(SNAP.jobs);
    expect(s.total).toBe(4);
    expect(s.byCategory[0]).toEqual({ key: "electrical", count: 2 });
    expect(s.byEmployer).toEqual([
      { key: "Digital Realty", count: 3 },
      { key: "Equinix", count: 1 },
    ]);
  });
});

describe("citiesWithin and openingsNear", () => {
  it("counts a city's neighbors within the distance, including itself", () => {
    const near = citiesWithin("Santa Clara", 10);
    expect(near).toContain("Santa Clara");
    expect(near).toContain("San Jose");
    expect(near).not.toContain("Hayward");
  });

  it("finds an employer's openings in and near a site's city", () => {
    expect(openingsNear(SNAP.jobs, "Digital Realty", "Santa Clara", 10).map((j) => j.id)).toEqual(["a", "b"]);
    expect(openingsNear(SNAP.jobs, "Equinix", "Santa Clara", 10).map((j) => j.id)).toEqual(["d"]);
    expect(openingsNear(SNAP.jobs, "Nobody", "Santa Clara", 10)).toEqual([]);
  });
});

describe("freshnessLabel", () => {
  it("says how long ago the jobs were refreshed", () => {
    expect(freshnessLabel("2026-11-27T17:59:30Z", NOW)).toBe("Updated just now");
    expect(freshnessLabel("2026-11-27T17:15:00Z", NOW)).toBe("Updated 45 minutes ago");
    expect(freshnessLabel("2026-11-27T17:00:00Z", NOW)).toBe("Updated 1 hour ago");
    expect(freshnessLabel("2026-11-27T12:00:00Z", NOW)).toBe("Updated 6 hours ago");
    expect(freshnessLabel("2026-11-25T18:00:00Z", NOW)).toBe("Updated 2 days ago");
  });
});

describe("jobs listed in several places", () => {
  it("flags a job that can also be based outside the Bay Area", () => {
    const [multi, local] = parseGreenhouse("Co", {
      jobs: [
        { id: 1, title: "Paralegal", absolute_url: "https://g.example/1", location: { name: "Dallas, TX, United States; San Francisco, CA, United States" } },
        { id: 2, title: "Technician", absolute_url: "https://g.example/2", location: { name: "Santa Clara, CA" } },
      ],
    });
    expect(multi).toMatchObject({ city: "San Francisco", alsoElsewhere: true });
    expect(local.alsoElsewhere).toBeUndefined();
  });

  it("reads Mt. View as Mountain View", () => {
    expect(bayAreaCity("Mt. View California")).toBe("Mountain View");
  });
});

describe("fetchFeeds progress", () => {
  it("reports partial results as each employer's feed finishes", async () => {
    const fetchImpl = fakeFetch({
      "https://boards-api.greenhouse.io/v1/boards/greenco/jobs": {
        jobs: [{ id: 1, title: "Tech", absolute_url: "https://g.example/1", location: { name: "San Jose, CA" } }],
      },
    });
    const partials: number[] = [];
    await fetchFeeds([GH, LV], { fetchImpl, now: NOW, onProgress: (p) => partials.push(p.feeds.length) });
    expect(partials.sort()).toEqual([1, 2]);
  });
});

const sample = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), "utf8"));
const noWait = async () => {};

describe("Workday, against a real Equinix response", () => {
  const board = "https://equinix.wd1.myworkdayjobs.com/External";
  const api = "https://equinix.wd1.myworkdayjobs.com/wday/cxs/equinix/External/jobs";
  const BAY_IDS = [
    "9bde94053fcb01597f627996bc6b59ec",
    "9bde94053fcb01e6ddf3c595bc6baaeb",
    "e43054a53e4a4468aa4a3b07c1715434",
    "9bde94053fcb0162e1bdb996bc6b9aec",
    "f5798eeaf8091053b3f73abbe644ab0f",
    "9bde94053fcb012caf85be96bc6b9fec",
    "a8af691c612f41f5b53dc656ae9d34c3",
    "3bf629e1d3b046138fb96f388828a0d5",
    "9960a0f991804b7590f94fdcad161032",
  ];
  const body = (offset: number, ids: string[] = []) =>
    JSON.stringify({ appliedFacets: ids.length ? { locations: ids } : {}, limit: 20, offset, searchText: "" });
  const feed: FeedConfig = { employer: "Equinix", kind: "workday", board, careersUrl: board };

  it("asks only for Bay Area locations, using every id for each city, then reads multi-location jobs one by one", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch(
      {
        [`${api} ${body(0)}`]: sample("workday-equinix-list.json"),
        [`${api} ${body(0, BAY_IDS)}`]: sample("workday-equinix-list-bay.json"),
        "https://equinix.wd1.myworkdayjobs.com/wday/cxs/equinix/External/job/Toronto/Treasury-Manager--Capital-Markets_JR-163838":
          sample("workday-equinix-detail.json"),
      },
      calls,
    );
    const snap = await fetchFeeds([feed], { fetchImpl, now: NOW, sleep: noWait });
    expect(snap.feeds[0]).toMatchObject({ ok: true, count: 3 });
    const byTitle = Object.fromEntries(snap.jobs.map((j) => [j.title, j]));
    expect(byTitle["Data Center Critical Facilities Engineer"]).toMatchObject({
      city: "Palo Alto",
      url: `${board}/job/Palo-Alto/Data-Center-Critical-Facilities-Engineer_JR-164061`,
      category: "facilities",
    });
    // "30+ days ago" has no exact day, so none is shown.
    expect(byTitle["Data Center Critical Facilities Engineer"].posted).toBeUndefined();
    expect(byTitle["Technical Deployment Analyst"].posted).toBe("2026-11-03");
    // The multi-location job's places come from its detail page, with duplicates removed.
    expect(byTitle["Treasury Manager, Capital Markets"]).toMatchObject({
      city: "Sunnyvale",
      location: "Toronto; Sunnyvale; San Jose; San Francisco; Redwood City; Santa Clara",
      posted: "2026-11-11",
      alsoElsewhere: true,
    });
    expect(calls).toHaveLength(3);
  });

  it("returns no jobs, without paging, when an employer has no Bay Area locations", async () => {
    const list = sample("workday-equinix-list.json");
    list.facets = list.facets.filter((f: { facetParameter: string }) => f.facetParameter !== "locationMainGroup");
    const calls: string[] = [];
    const snap = await fetchFeeds([feed], { fetchImpl: fakeFetch({ [`${api} ${body(0)}`]: list }, calls), now: NOW, sleep: noWait });
    expect(snap.feeds[0]).toMatchObject({ ok: true, count: 0 });
    expect(calls).toHaveLength(1);
  });

  it("pages through Bay Area results 20 at a time", async () => {
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({ title: `Tech ${offset + i}`, externalPath: `/job/San-Jose/T_${offset + i}`, locationsText: "San Jose" }));
    const calls: string[] = [];
    const fetchImpl = fakeFetch(
      {
        [`${api} ${body(0)}`]: sample("workday-equinix-list.json"),
        [`${api} ${body(0, BAY_IDS)}`]: { total: 25, jobPostings: page(20, 0) },
        [`${api} ${body(20, BAY_IDS)}`]: { total: 25, jobPostings: page(5, 20) },
      },
      calls,
    );
    const snap = await fetchFeeds([feed], { fetchImpl, now: NOW, sleep: noWait });
    expect(snap.jobs).toHaveLength(25);
    expect(calls).toHaveLength(3);
  });

  it("waits and retries when the board says it's getting too many requests", async () => {
    let n = 0;
    const waits: number[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      n++;
      if (n === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "3" } });
      if (n === 2) return new Response("slow down", { status: 429 });
      return fakeFetch({ [`${api} ${body(0)}`]: { total: 0, jobPostings: [], facets: [] } })(url, init);
    };
    const snap = await fetchFeeds([feed], { fetchImpl, now: NOW, sleep: async (ms) => void waits.push(ms) });
    expect(snap.feeds[0].ok).toBe(true);
    // Honors Retry-After (3 s), then backs off from 2 s when there's no header.
    expect(waits.filter((w) => w >= 2000)).toEqual([3000, 4000]);
  });
});

describe("parseWorkdayPosted", () => {
  it("turns Workday's relative dates into a day, and gives up on 30+", () => {
    expect(parseWorkdayPosted("Posted Today", NOW)).toBe("2026-11-27");
    expect(parseWorkdayPosted("Posted Yesterday", NOW)).toBe("2026-11-26");
    expect(parseWorkdayPosted("Posted 24 Days Ago", NOW)).toBe("2026-11-03");
    expect(parseWorkdayPosted("Posted 30 Days Ago", NOW)).toBe("2026-10-28");
    expect(parseWorkdayPosted("Posted 30+ Days Ago", NOW)).toBeUndefined();
    expect(parseWorkdayPosted(undefined, NOW)).toBeUndefined();
  });
});

describe("Oracle, against a real Digital Realty response", () => {
  const board = "https://hdep.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX";

  it("reads every location and links to the job page", () => {
    const jobs = parseOracle("Digital Realty", board, sample("oracle-digitalrealty.json"));
    expect(jobs).toHaveLength(4);
    const sc = jobs.find((j) => j.id === "Digital Realty:9132")!;
    expect(sc).toMatchObject({ title: "Manager Engineering Operations", city: "Santa Clara", url: `${board}/job/9132`, posted: "2026-11-20" });
    expect(sc.alsoElsewhere).toBeUndefined();
    // Same title in Texas is a different job, and isn't in the Bay Area.
    expect(jobs.find((j) => j.id === "Digital Realty:9136")!.city).toBeNull();
    expect(jobs.find((j) => j.id === "Digital Realty:9107")).toMatchObject({ city: "Santa Clara", alsoElsewhere: true });
  });

  it("is read through fetchFeeds from the board address", async () => {
    const api =
      "https://hdep.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=CX,limit=200,offset=0,sortBy=POSTING_DATES_DESC";
    const snap = await fetchFeeds([{ employer: "Digital Realty", kind: "oracle", board, careersUrl: board }], {
      fetchImpl: fakeFetch({ [api]: sample("oracle-digitalrealty.json") }),
      now: NOW,
      sleep: noWait,
    });
    expect(snap.jobs.map((j) => j.id).sort()).toEqual(["Digital Realty:9107", "Digital Realty:9132"]);
  });
});

describe("Greenhouse, against a real Goodman response", () => {
  it("reads a city with no state, and skips the open application that isn't a job", () => {
    const jobs = parseGreenhouse("Goodman", sample("greenhouse-goodmanau.json"));
    expect(jobs.map((j) => j.title)).toEqual(["Electrical Engineer, Data Centres"]);
    expect(jobs[0]).toMatchObject({ city: "San Jose", posted: "2026-05-04" });
  });
});

const text = (name: string) => readFileSync(new URL(`../fixtures/feeds/${name}`, import.meta.url), "utf8");
/** Like fakeFetch, but answers with raw text, for XML feeds. */
const textFetch = (table: Record<string, string>) => async (url: string) =>
  table[url] != null ? new Response(table[url], { status: 200 }) : new Response("nope", { status: 500 });

describe("Amazon, against a real amazon.jobs response", () => {
  it("uses the cleaned-up location, links to the job page, and reads the posted day", () => {
    const jobs = parseAmazon("Amazon Web Services", sample("amazon-search.json"));
    expect(jobs[0]).toMatchObject({ location: "Glendale, California, USA", city: null });
    expect(jobs[1]).toMatchObject({
      title: "Data Center Program Manager",
      city: "Santa Clara",
      url: "https://www.amazon.jobs/en/jobs/10536885/data-center-program-manager",
      posted: "2026-09-10",
    });
  });

  it("searches California for the feed's query and pages by 100", async () => {
    const url = "https://www.amazon.jobs/en/search.json?base_query=data+center&normalized_state_name%5B%5D=California&result_limit=100&offset=0";
    const snap = await fetchFeeds([{ employer: "Amazon Web Services", kind: "amazon", board: "data center", careersUrl: "https://www.amazon.jobs/" }], {
      fetchImpl: fakeFetch({ [url]: sample("amazon-search.json") }),
      now: NOW,
      sleep: noWait,
    });
    expect(snap.jobs.map((j) => j.title)).toEqual(["Data Center Program Manager"]);
  });
});

describe("Eightfold, against a real Microsoft response", () => {
  it("reads every standardized location and links to the job page", () => {
    const jobs = parseEightfold("Microsoft", "https://apply.careers.microsoft.com", sample("eightfold-microsoft.json"));
    expect(jobs[0].city).toBeNull();
    expect(jobs[1]).toMatchObject({ city: "Santa Clara", url: "https://apply.careers.microsoft.com/careers/job/1970393557051495", category: "construction" });
    expect(jobs[2]).toMatchObject({ city: "Mountain View", alsoElsewhere: true, posted: "2026-11-13" });
  });

  it("pages 10 at a time from the feed's search address, waiting between pages", async () => {
    const board = "https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=datacenter&location=";
    const one = sample("eightfold-microsoft.json");
    one.data.count = 13;
    const waits: number[] = [];
    const snap = await fetchFeeds([{ employer: "Microsoft", kind: "eightfold", board, careersUrl: "https://careers.microsoft.com/" }], {
      fetchImpl: fakeFetch({ [`${board}&start=0`]: one, [`${board}&start=10`]: { data: { positions: [], count: 13 } } }),
      now: NOW,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(snap.jobs).toHaveLength(2);
    expect(waits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SmartRecruiters, against a real LLNL response", () => {
  it("reads the city and links to the public job page, not the API", () => {
    const [job] = parseSmartRecruiters("LLNL", "LLNL", sample("smartrecruiters-llnl.json"));
    expect(job).toMatchObject({ city: "Livermore", url: "https://jobs.smartrecruiters.com/LLNL/3743990017078946", posted: "2026-11-25" });
  });

  it("keeps only titles matching the feed's role filter, for employers that hire far beyond data centers", async () => {
    const snap = await fetchFeeds([{ employer: "LLNL", kind: "smartrecruiters", board: "LLNL", careersUrl: "https://www.llnl.gov/", titleFilter: "program enablement" }], {
      fetchImpl: fakeFetch({ "https://api.smartrecruiters.com/v1/companies/LLNL/postings?limit=100&offset=0": sample("smartrecruiters-llnl.json") }),
      now: NOW,
      sleep: noWait,
    });
    expect(snap.jobs.map((j) => j.title)).toEqual(["Associate Deputy Director for Program Enablement – Active Security Clearance Required"]);
  });
});

describe("NEOGOV, against a real City of Santa Clara feed", () => {
  it("reads the RSS items, keeping only the feed's department", () => {
    const jobs = parseNeogov("Silicon Valley Power", text("neogov-svp.xml"), "Electric Utility");
    expect(jobs.map((j) => j.title)).toEqual(["Senior Electric Crew Foreperson", "Staff Aide II"]);
    expect(jobs[0]).toMatchObject({
      city: "Santa Clara",
      url: "https://www.governmentjobs.com/careers/cityofsantaclaraca/jobs/5543290-0",
      posted: "2026-11-25",
      category: "electrical",
    });
  });

  it("is read through fetchFeeds", async () => {
    const snap = await fetchFeeds(
      [{ employer: "Silicon Valley Power", kind: "neogov", board: "cityofsantaclaraca", department: "Electric Utility", careersUrl: "https://www.governmentjobs.com/careers/cityofsantaclaraca" }],
      { fetchImpl: textFetch({ "https://www.governmentjobs.com/SearchEngine/JobsFeed?agency=cityofsantaclaraca": text("neogov-svp.xml") }), now: NOW, sleep: noWait },
    );
    expect(snap.jobs).toHaveLength(2);
  });
});

describe("Jobvite XML, against a real Cupertino Electric feed", () => {
  it("merges a posting's copies for other cities into one job with every location, on an https link", () => {
    const jobs = parseJobviteXml("Cupertino Electric", "cei", text("jobvite-cei.xml"));
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: "Executive Assistant - Modular - Data Center",
      location: "Salt Lake City, UT, United States; San Jose, CA, United States",
      city: "San Jose",
      alsoElsewhere: true,
      url: "https://jobs.jobvite.com/cei/job/o6U0Afwk",
      posted: "2026-10-28",
    });
    expect(jobs[1]).toMatchObject({ title: "Senior Estimator II - Substation & High Voltage", url: "https://jobs.jobvite.com/cei/job/oF0EAfwD" });
  });
});

describe("employers whose job boards turn away automated readers", () => {
  it("are listed with their careers page but never fetched", async () => {
    const calls: string[] = [];
    const snap = await fetchFeeds([{ employer: "Link Co", kind: "link", board: "", careersUrl: "https://link.example/careers" }], {
      fetchImpl: fakeFetch({}, calls),
      now: NOW,
      sleep: noWait,
    });
    expect(calls).toEqual([]);
    expect(snap.feeds).toEqual([{ employer: "Link Co", careersUrl: "https://link.example/careers", ok: true, count: 0, linkOnly: true }]);
  });
});
