import { describe, expect, it } from "vitest";
import { cacheControl, cityBubbles, CATEGORY_COLOR, jobsHref, matchesView, parseJobsView, ringGradient, viewQuery, type JobsView } from "@/lib/jobs-view";
import { CATEGORY_LABEL, bayAreaCity, citiesWithin, type Job } from "@/lib/jobfeeds";
import { CITY_CENTER } from "@/lib/sites";

const j = (id: string, city: string | null, category: Job["category"] = "operations", employer = "Acme"): Job => ({
  id,
  employer,
  title: id,
  location: city ?? "Remote",
  city,
  url: `https://x.example/${id}`,
  category,
});

const ALL: JobsView = { role: "", employer: "", city: "", near: "" };

describe("parseJobsView and viewQuery", () => {
  it("reads nothing when the jobs layer isn't open", () => {
    expect(parseJobsView("")).toBeNull();
    expect(parseJobsView("?role=electrical")).toBeNull();
  });

  it("reads the open layer and its filters from the address", () => {
    expect(parseJobsView("?jobs=1&role=electrical&employer=Digital+Realty&near=Santa+Clara")).toEqual({
      role: "electrical",
      employer: "Digital Realty",
      city: "",
      near: "Santa Clara",
    });
    expect(parseJobsView("?jobs=1&city=San+Jose")).toEqual({ ...ALL, city: "San Jose" });
  });

  it("ignores a role type it doesn't know", () => {
    expect(parseJobsView("?jobs=1&role=wizard")?.role).toBe("");
  });

  it("keeps one place: an exact city wins over near", () => {
    expect(parseJobsView("?jobs=1&city=San+Jose&near=Santa+Clara")).toEqual({ ...ALL, city: "San Jose" });
  });

  it("writes the view back into a shareable address, and round-trips", () => {
    const v = { ...ALL, role: "network", near: "Santa Clara" };
    expect(viewQuery(v)).toBe("?jobs=1&role=network&near=Santa+Clara");
    expect(parseJobsView(viewQuery(v))).toEqual(v);
    expect(viewQuery(null)).toBe("");
    expect(jobsHref({ employer: "Equinix", near: "San Jose" })).toBe("/?jobs=1&employer=Equinix&near=San+Jose");
  });
});

describe("matchesView", () => {
  it("filters by role, employer, exact city and nearby cities", () => {
    const sj = j("a", "San Jose", "electrical", "Equinix");
    expect(matchesView(sj, ALL)).toBe(true);
    expect(matchesView(sj, { ...ALL, role: "network" })).toBe(false);
    expect(matchesView(sj, { ...ALL, employer: "Equinix" })).toBe(true);
    expect(matchesView(sj, { ...ALL, city: "Santa Clara" })).toBe(false);
    expect(matchesView(sj, { ...ALL, near: "Santa Clara" })).toBe(true);
    expect(matchesView(sj, { ...ALL, near: "Hayward" })).toBe(false);
  });
});

describe("cityBubbles", () => {
  it("counts jobs per city, biggest first, with each role type's share", () => {
    const jobs = [j("1", "San Jose", "electrical"), j("2", "San Jose"), j("3", "San Jose"), j("4", "Hayward", "security")];
    const b = cityBubbles(jobs);
    expect(b.map((x) => [x.city, x.count])).toEqual([
      ["San Jose", 3],
      ["Hayward", 1],
    ]);
    expect(b[0].lngLat).toEqual(CITY_CENTER["San Jose"]);
    expect(b[0].roles).toEqual([
      { role: "operations", count: 2 },
      { role: "electrical", count: 1 },
    ]);
  });

  it("counts jobs based only in the Bay Area apart from jobs that also list other places, so circles match the headline", () => {
    const elsewhere = { ...j("2", "Santa Clara"), alsoElsewhere: true };
    const [b] = cityBubbles([j("1", "Santa Clara", "electrical"), elsewhere, { ...elsewhere, id: "3" }]);
    expect(b).toMatchObject({ city: "Santa Clara", count: 1, elsewhere: 2 });
    // The ring shows the jobs counted in the circle.
    expect(b.roles).toEqual([{ role: "electrical", count: 1 }]);
  });

  it("still shows a city whose only jobs also list other places, with a count of 0", () => {
    const [b] = cityBubbles([{ ...j("1", "Gilroy", "network"), alsoElsewhere: true }]);
    expect(b).toMatchObject({ city: "Gilroy", count: 0, elsewhere: 1, roles: [{ role: "network", count: 1 }] });
  });

  it("leaves out jobs without a Bay Area city", () => {
    expect(cityBubbles([j("1", null)])).toEqual([]);
  });
});

describe("ringGradient", () => {
  it("draws each role type as a slice of the ring, in proportion", () => {
    expect(
      ringGradient([
        { role: "operations", count: 3 },
        { role: "electrical", count: 1 },
      ]),
    ).toBe(`conic-gradient(${CATEGORY_COLOR.operations} 0% 75%, ${CATEGORY_COLOR.electrical} 75% 100%)`);
  });

  it("gives every role type its own color", () => {
    const colors = Object.keys(CATEGORY_LABEL).map((c) => CATEGORY_COLOR[c as Job["category"]]);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("city coverage", () => {
  it("knows where every city a job can be in sits, so each gets a circle on the map", () => {
    for (const city of ["Cupertino", "Redwood City", "Pleasanton", "South San Francisco", "Berkeley"]) {
      expect(bayAreaCity(`${city}, CA`)).toBe(city);
      expect(CITY_CENTER[city], city).toBeDefined();
    }
  });

  it("counts nearby cities without centers of their own before, like Cupertino near Santa Clara", () => {
    expect(citiesWithin("Santa Clara", 10)).toContain("Cupertino");
  });
});

describe("cacheControl", () => {
  it("never lets a browser keep a half-read list, so reloading shows jobs as they arrive", () => {
    expect(cacheControl({ fetchedAt: "x", feeds: [], jobs: [], refreshing: true })).toBe("no-store");
  });

  it("lets browsers keep a complete list for 5 minutes", () => {
    expect(cacheControl({ fetchedAt: "x", feeds: [], jobs: [] })).toBe("public, max-age=300");
  });
});
