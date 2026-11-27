import { redirect } from "next/navigation";

/** Jobs live on the map now. Old /jobs links open the map's jobs layer with the same filters. */
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = new URLSearchParams({ jobs: "1" });
  for (const k of ["role", "employer", "city", "near"]) {
    const v = params[k];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) q.set(k, one);
  }
  redirect(`/?${q}`);
}
