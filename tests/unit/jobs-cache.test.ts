import { describe, expect, it } from "vitest";
import { createJobsCache } from "@/lib/jobs-cache";
import type { JobsSnapshot } from "@/lib/jobfeeds";

const snap = (at: string, n = 0): JobsSnapshot => ({ fetchedAt: at, feeds: [], jobs: Array.from({ length: n }, () => ({}) as never) });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createJobsCache", () => {
  it("serves the same jobs until they are older than the refresh time", async () => {
    let now = 0;
    let loads = 0;
    const cache = createJobsCache({ ttlMs: 1000, waitMs: 1000, now: () => now, load: async () => (loads++, snap(`t${loads}`)) });
    const first = await cache.get();
    now = 999;
    expect(await cache.get()).toBe(first);
    expect(loads).toBe(1);
  });

  it("once stale, answers right away with the old jobs and refreshes in the background", async () => {
    let now = 0;
    const seen: (JobsSnapshot | undefined)[] = [];
    let release!: () => void;
    const cache = createJobsCache({
      ttlMs: 1000,
      waitMs: 1000,
      now: () => now,
      load: async (previous) => {
        seen.push(previous);
        if (seen.length === 2) await new Promise<void>((r) => (release = r));
        return snap(`t${seen.length}`);
      },
    });
    const first = await cache.get();
    now = 5000;
    // The visitor doesn't wait for the slow refresh.
    expect(await cache.get()).toBe(first);
    // The refresh gets the last snapshot, so a failed feed can keep its last good jobs.
    expect(seen[1]).toBe(first);
    release();
    await tick();
    await tick();
    expect((await cache.get()).fetchedAt).toBe("t2");
  });

  it("on the very first visit, waits a short while, then shows whatever has arrived and says it's still gathering", async () => {
    let finish!: () => void;
    const cache = createJobsCache({
      ttlMs: 1000,
      waitMs: 10,
      load: async (_prev, progress) => {
        progress(snap("partial", 2));
        await new Promise<void>((r) => (finish = r));
        return snap("done", 5);
      },
    });
    const early = await cache.get();
    expect(early.jobs).toHaveLength(2);
    expect(early.refreshing).toBe(true);
    finish();
    await tick();
    await tick();
    const later = await cache.get();
    expect(later.jobs).toHaveLength(5);
    expect(later.refreshing).toBeFalsy();
  });

  it("on the very first visit with nothing yet, returns an empty list marked as still gathering", async () => {
    const cache = createJobsCache({ ttlMs: 1000, waitMs: 5, now: () => Date.parse("2026-11-27T00:00:00Z"), load: () => new Promise(() => {}) });
    const s = await cache.get();
    expect(s).toMatchObject({ jobs: [], feeds: [], refreshing: true });
  });

  it("shares one refresh between visitors who arrive at the same time", async () => {
    let loads = 0;
    const cache = createJobsCache({ ttlMs: 1000, waitMs: 1000, now: () => 0, load: async () => (loads++, snap("x")) });
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(loads).toBe(1);
  });

  it("keeps serving the last jobs if a refresh throws, and tries again next time", async () => {
    let now = 0;
    let fail = false;
    let loads = 0;
    const cache = createJobsCache({
      ttlMs: 1000,
      waitMs: 1000,
      now: () => now,
      load: async () => {
        loads++;
        if (fail) throw new Error("network down");
        return snap("ok");
      },
    });
    const first = await cache.get();
    fail = true;
    now = 5000;
    expect(await cache.get()).toBe(first);
    await tick();
    expect(await cache.get()).toBe(first);
    await tick();
    expect(loads).toBe(3);
  });
});
