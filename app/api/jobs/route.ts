import { getJobs } from "@/lib/jobs-server";
import { cacheControl } from "@/lib/jobs-view";

export const dynamic = "force-dynamic";

/** The current Bay Area job snapshot, for the map's jobs layer and site cards. */
export async function GET() {
  const snap = await getJobs();
  return Response.json(snap, { headers: { "cache-control": cacheControl(snap) } });
}
