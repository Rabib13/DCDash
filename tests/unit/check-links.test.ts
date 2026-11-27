import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the link check script
import { classify, collectLinks } from "../../scripts/check-links.mjs";

const data = {
  sources: { a: { url: "https://source.example", title: "A", publisher: "P", accessed: "2026-11-27" } },
  operators: {
    Op: {
      careers: { url: "https://careers.example", sources: ["a"] },
      openings: { checked: "2026-11-27", sources: ["a"], items: [{ title: "Tech", location: "X", url: "https://job.example/1" }] },
    },
  },
  sites: [{ id: "s", documents: [{ url: "https://doc.example", sources: ["a"] }] }],
};

describe("collectLinks", () => {
  it("collects every outbound link a visitor can click, once each", () => {
    const urls = collectLinks(data).map((l: { url: string }) => l.url);
    expect(urls.sort()).toEqual(["https://careers.example", "https://doc.example", "https://job.example/1", "https://source.example"]);
  });
  it("says where each link appears", () => {
    const job = collectLinks(data).find((l: { url: string }) => l.url === "https://job.example/1");
    expect(job.where).toMatch(/Op/);
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
    const { statusOf } = await import("../../scripts/check-links.mjs");
    const f = fakeFetch({ HEAD: 404, GET: 200 });
    expect(await statusOf("https://x", f.impl)).toBe(200);
    expect(f.calls).toEqual(["HEAD", "GET"]);
  });

  it("reports 404 when GET also says not found", async () => {
    const { statusOf } = await import("../../scripts/check-links.mjs");
    expect(await statusOf("https://x", fakeFetch({ HEAD: 404, GET: 404 }).impl)).toBe(404);
  });

  it("doesn't retry when HEAD works", async () => {
    const { statusOf } = await import("../../scripts/check-links.mjs");
    const f = fakeFetch({ HEAD: 200, GET: 500 });
    expect(await statusOf("https://x", f.impl)).toBe(200);
    expect(f.calls).toEqual(["HEAD"]);
  });

  it("returns 0 when the network fails", async () => {
    const { statusOf } = await import("../../scripts/check-links.mjs");
    expect(await statusOf("https://x", async () => { throw new Error("down"); })).toBe(0);
  });
});
