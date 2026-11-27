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
  parseWorkday,
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

  it("reads Workday jobs and builds the link from the board address", () => {
    const [job] = parseWorkday(employer, "https://example.wd1.myworkdayjobs.com/External", {
      total: 1,
      jobPostings: [{ title: "Critical Facilities Engineer", externalPath: "/job/Santa-Clara/CFE_R1", locationsText: "Santa Clara, CA", postedOn: "Posted 3 Days Ago" }],
    });
    expect(job).toMatchObject({ url: "https://example.wd1.myworkdayjobs.com/External/job/Santa-Clara/CFE_R1", city: "Santa Clara", category: "facilities" });
    // Workday only gives a relative date, so we don't invent an exact one.
    expect(job.posted).toBeUndefined();
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

  it("pages through Workday until it has every job", async () => {
    const board = "https://ex.wd5.myworkdayjobs.com/Careers";
    const api = "https://ex.wd5.myworkdayjobs.com/wday/cxs/ex/Careers/jobs";
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({ title: `Tech ${offset + i}`, externalPath: `/job/x/${offset + i}`, locationsText: "Santa Clara, CA" }));
    const calls: string[] = [];
    const fetchImpl = fakeFetch(
      {
        [`${api} {"limit":20,"offset":0,"searchText":""}`]: { total: 25, jobPostings: page(20, 0) },
        [`${api} {"limit":20,"offset":20,"searchText":""}`]: { total: 25, jobPostings: page(5, 20) },
      },
      calls,
    );
    const snap = await fetchFeeds([{ employer: "WD Co", kind: "workday", board, careersUrl: board }], { fetchImpl, now: NOW });
    expect(snap.jobs).toHaveLength(25);
    expect(calls).toHaveLength(2);
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
