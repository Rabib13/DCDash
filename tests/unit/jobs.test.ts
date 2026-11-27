import { describe, expect, it } from "vitest";
import { isNear, jobSearchUrl, ROLE_SEARCHES, splitByDistance } from "@/lib/jobs";

describe("isNear", () => {
  it("matches the same city", () => expect(isNear("Santa Clara", "Santa Clara, CA")).toBe(true));
  it("matches a neighboring city", () => expect(isNear("Santa Clara", "Mountain View, CA")).toBe(true));
  it("rejects a far city", () => expect(isNear("Santa Clara", "Ashburn, VA")).toBe(false));
  it("rejects anything for a city with no neighbor list except itself", () => {
    expect(isNear("Oakland", "San Jose, CA")).toBe(false);
    expect(isNear("Oakland", "Oakland, CA")).toBe(true);
  });
});

describe("splitByDistance", () => {
  it("puts every job in exactly one group", () => {
    const jobs = [
      { title: "a", location: "Santa Clara, CA", url: "https://x/a" },
      { title: "b", location: "Dallas, TX", url: "https://x/b" },
    ];
    const { near, elsewhere } = splitByDistance("Santa Clara", jobs);
    expect(near.map((j) => j.title)).toEqual(["a"]);
    expect(elsewhere.map((j) => j.title)).toEqual(["b"]);
  });
});

describe("jobSearchUrl", () => {
  it("builds an https Indeed search with query and location", () => {
    const url = new URL(jobSearchUrl("Data center technician", "Santa Clara, CA"));
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.indeed.com");
    expect(url.searchParams.get("q")).toBe("Data center technician");
    expect(url.searchParams.get("l")).toBe("Santa Clara, CA");
  });

  it("leaves out the location for a nationwide search", () => {
    expect(new URL(jobSearchUrl("Electrician", "")).searchParams.has("l")).toBe(false);
  });

  it("has a search for every listed role", () => {
    expect(ROLE_SEARCHES.length).toBeGreaterThan(0);
    for (const r of ROLE_SEARCHES) expect(r.label && r.query).toBeTruthy();
  });
});
