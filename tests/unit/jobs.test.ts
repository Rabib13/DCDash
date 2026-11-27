import { describe, expect, it } from "vitest";
import { jobSearchUrl, ROLE_SEARCHES } from "@/lib/jobs";

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
