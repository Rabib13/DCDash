import type { JobsSnapshot } from "./jobfeeds";

/**
 * Keeps the latest jobs in memory and refreshes them once they are older than `ttlMs`.
 * Visitors arriving during a refresh share it, and a refresh that throws keeps the last jobs.
 */
export function createJobsCache({
  load,
  ttlMs,
  now = Date.now,
}: {
  load: (previous: JobsSnapshot | undefined) => Promise<JobsSnapshot>;
  ttlMs: number;
  now?: () => number;
}) {
  let current: { snap: JobsSnapshot; at: number } | undefined;
  let pending: Promise<JobsSnapshot> | undefined;
  return {
    async get(): Promise<JobsSnapshot> {
      if (current && now() - current.at < ttlMs) return current.snap;
      pending ??= load(current?.snap)
        .then((snap) => {
          current = { snap, at: now() };
          return snap;
        })
        .catch((e) => {
          if (current) return current.snap;
          throw e;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
