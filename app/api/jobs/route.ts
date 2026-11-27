import { getJobs } from "@/lib/jobs-server";

export const dynamic = "force-dynamic";

/** The current Bay Area job snapshot, for site cards on the map. */
export async function GET() {
  return Response.json(await getJobs(), { headers: { "cache-control": "public, max-age=300" } });
}
