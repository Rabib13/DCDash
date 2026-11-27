import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the link check script
import { classify, collectLinks, statusOf } from "../../scripts/check-links.mjs";

const data = {
  sources: { a: { url: "https://source.example", title: "A", publisher: "P", accessed: "2026-11-27" } },
  operators: {
    Op: {
      careers: { url: "https://careers.example", sources: ["a"] },
    },
  },
  sites: [{ id: "s", documents: [{ url: "https://doc.example", sources: ["a"] }] }],
};

const FEEDS = [{ employer: "Feed Co", kind: "lever", board: "feedco", careersUrl: "https://feed-careers.example" }];

describe("collectLinks", () => {
  it("collects every outbound link a visitor can click, once each", () => {
    const urls = collectLinks(data, FEEDS).map((l: { url: string }) => l.url);
    expect(urls.sort()).toEqual(["https://careers.example", "https://doc.example", "https://feed-careers.example", "https://source.example"]);
  });
  it("says where each link appears", () => {
    const link = collectLinks(data, FEEDS).find((l: { url: string }) => l.url === "https://feed-careers.example");
    expect(link.where).toMatch(/Feed Co/);
  });
});

describe("collectLinks with ways in", () => {
  it("checks each program's page and its extra links", () => {
    const ways = [{ id: "w", url: "https://way.example", more: [{ label: "More", url: "https://way-more.example" }] }];
    const links = collectLinks(data, FEEDS, ways);
    expect(links.map((l: { url: string }) => l.url)).toEqual(expect.arrayContaining(["https://way.example", "https://way-more.example"]));
    expect(links.find((l: { url: string }) => l.url === "https://way.example").where).toMatch(/pathway w/);
  });
});

describe("classify", () => {
  it("treats 2xx and 3xx as working", () => {
    expect(classify(200)).toBe("ok");
    expect(classify(301)).toBe("ok");
  });
  it("treats 404 and 410 as dead links", () => {
    expect(classify(404)).toBe("dead");
    expect(classify(410)).toBe("dead");
  });
  it("treats bot blocks and rate limits as unknown, since a real browser may still open them", () => {
    expect(classify(403)).toBe("unknown");
    expect(classify(429)).toBe("unknown");
    expect(classify(999)).toBe("unknown");
  });
  it("treats a network failure as unknown", () => expect(classify(0)).toBe("unknown"));
  it("treats server errors as unknown", () => expect(classify(503)).toBe("unknown"));
});

describe("statusOf", () => {
  const fakeFetch = (byMethod: Record<string, number>) => {
    const calls: string[] = [];
    const impl = async (_url: string, init?: { method?: string }) => {
      const m = init?.method ?? "GET";
      calls.push(m);
      return { status: byMethod[m] };
    };
    return { impl, calls };
  };

  it("retries with GET when a server answers HEAD with 404, as some government sites do", async () => {
    const f = fakeFetch({ HEAD: 404, GET: 200 });
    expect(await statusOf("https://x", f.impl)).toBe(200);
    expect(f.calls).toEqual(["HEAD", "GET"]);
  });

  it("reports 404 when GET also says not found", async () => {
    expect(await statusOf("https://x", fakeFetch({ HEAD: 404, GET: 404 }).impl)).toBe(404);
  });

  it("doesn't retry when HEAD works", async () => {
    const f = fakeFetch({ HEAD: 200, GET: 500 });
    expect(await statusOf("https://x", f.impl)).toBe(200);
    expect(f.calls).toEqual(["HEAD"]);
  });

  it("returns 0 when the network fails", async () => {
    expect(await statusOf("https://x", async () => { throw new Error("down"); })).toBe(0);
  });
});
