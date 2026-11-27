"use client";

import { useEffect, useState } from "react";
import type { JobsSnapshot } from "./jobfeeds";

let request: Promise<JobsSnapshot | null> | undefined;

/** The jobs snapshot, fetched once per page load and shared by the map, the jobs panel and every site card.
 * undefined while loading, null if it couldn't load. */
export function useJobs() {
  const [snap, setSnap] = useState<JobsSnapshot | null | undefined>(undefined);
  useEffect(() => {
    request ??= fetch("/api/jobs")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let live = true;
    request.then((s) => live && setSnap(s));
    return () => {
      live = false;
    };
  }, []);
  return snap;
}
