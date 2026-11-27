import { describe, expect, it } from "vitest";
import { createJobsCache } from "@/lib/jobs-cache";
import type { JobsSnapshot } from "@/lib/jobfeeds";

const snap = (at: string): JobsSnapshot => ({ fetchedAt: at, feeds: [], jobs: [] });

describe("createJobsCache", () => {
  it("fetches once, then serves the same jobs until they are older than the refresh time", async () => {
    let now = Date.parse("2026-11-27T12:00:00Z");
    const calls: (JobsSnapshot | undefined)[] = [];
    const cache = createJobsCache({
      ttlMs: 6 * 3600_000,
      now: () => now,
      load: async (previous) => {
        calls.push(previous);
        return snap(new Date(now).toISOString());
      },
    });
    const first = await cache.get();
    now += 5 * 3600_000;
    expect(await cache.get()).toBe(first);
    expect(calls).toHaveLength(1);
    now += 2 * 3600_000;
    const second = await cache.get();
    expect(second).not.toBe(first);
    // The refresh gets the last snapshot, so a failed feed can keep its last good jobs.
    expect(calls[1]).toBe(first);
  });

  it("shares one refresh between visitors who arrive at the same time", async () => {
    let loads = 0;
    const cache = createJobsCache({ ttlMs: 1000, now: () => 0, load: async () => (loads++, snap("2026-11-27T00:00:00Z")) });
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(loads).toBe(1);
  });

  it("keeps serving the last jobs if a refresh throws", async () => {
    let now = 0;
    let fail = false;
    const cache = createJobsCache({
      ttlMs: 1000,
      now: () => now,
      load: async () => {
        if (fail) throw new Error("network down");
        return snap("2026-11-27T00:00:00Z");
      },
    });
    const first = await cache.get();
    fail = true;
    now = 5000;
    expect(await cache.get()).toBe(first);
  });
});
