import type { JobsSnapshot } from "./jobfeeds";

/**
 * Keeps the latest jobs in memory. Once they are older than `ttlMs`, the next visitor gets them right away
 * and a refresh starts in the background, because some job boards take minutes to read.
 * On the very first visit there is nothing to show yet, so it waits up to `waitMs` and then returns
 * whatever has arrived so far, marked `refreshing`.
 */
export function createJobsCache({
  load,
  ttlMs,
  waitMs,
  now = Date.now,
}: {
  load: (previous: JobsSnapshot | undefined, progress: (partial: JobsSnapshot) => void) => Promise<JobsSnapshot>;
  ttlMs: number;
  waitMs: number;
  now?: () => number;
}) {
  let current: { snap: JobsSnapshot; at: number } | undefined;
  let partial: JobsSnapshot | undefined;
  let pending: Promise<void> | undefined;

  const refresh = () =>
    (pending ??= load(current?.snap, (p) => (partial = p))
      .then((snap) => {
        current = { snap, at: now() };
      })
      .catch(() => {
        // Keep the last jobs; the next visit tries again.
      })
      .finally(() => {
        pending = undefined;
        partial = undefined;
      }));

  return {
    async get(): Promise<JobsSnapshot> {
      if (current && now() - current.at < ttlMs) return current.snap;
      const running = refresh();
      if (current) return current.snap;
      await Promise.race([running, new Promise((r) => setTimeout(r, waitMs))]);
      const done = current as { snap: JobsSnapshot } | undefined;
      if (done) return done.snap;
      return { ...(partial ?? { fetchedAt: new Date(now()).toISOString(), feeds: [], jobs: [] }), refreshing: true };
    },
  };
}
