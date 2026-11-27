import { readFileSync } from "node:fs";
import feeds from "@/data/job-feeds.json";
import { fetchFeeds, type FeedConfig, type JobsSnapshot } from "./jobfeeds";
import { createJobsCache } from "./jobs-cache";

/** How long the server keeps jobs before reading the job boards again. */
export const REFRESH_HOURS = 6;

/**
 * Browser tests set JOBS_FIXTURE to a snapshot file so they never depend on live job boards.
 * Its times are moved so the snapshot looks two hours old, which keeps "Updated … ago" predictable.
 */
function loadFixture(path: string): JobsSnapshot {
  const snap = JSON.parse(readFileSync(path, "utf8")) as JobsSnapshot;
  const shift = Date.now() - 2 * 3600_000 - Date.parse(snap.fetchedAt);
  const move = (iso?: string) => (iso ? new Date(Date.parse(iso) + shift).toISOString() : iso);
  return { ...snap, fetchedAt: move(snap.fetchedAt)!, feeds: snap.feeds.map((f) => ({ ...f, refreshedAt: move(f.refreshedAt) })) };
}

const cache = createJobsCache({
  ttlMs: REFRESH_HOURS * 3600_000,
  // On a fresh start, wait this long for job boards before showing what has arrived so far.
  waitMs: 8000,
  load: async (previous, onProgress) =>
    process.env.JOBS_FIXTURE ? loadFixture(process.env.JOBS_FIXTURE) : fetchFeeds(feeds as FeedConfig[], { previous, onProgress }),
});

export const getJobs = () => cache.get();
