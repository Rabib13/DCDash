// Checks that every outbound link on the site still opens. Run with `npm run check-links`.
// Sites that block automated requests (403, 429) are reported as "unknown", not failures,
// because a visitor's browser usually opens them fine. Only 404 and 410 fail the check.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Every link a visitor can click, with where it appears. Each url is listed once. */
export function collectLinks(data, feeds = [], pathways = []) {
  const seen = new Map();
  const add = (url, where) => {
    if (url && !seen.has(url)) seen.set(url, { url, where });
  };
  for (const [key, s] of Object.entries(data.sources ?? {})) add(s.url, `source ${key}`);
  for (const [name, op] of Object.entries(data.operators ?? {})) {
    if (op.careers) add(op.careers.url, `operator ${name} careers`);
  }
  for (const f of feeds) add(f.careersUrl, `job feed ${f.employer} careers`);
  for (const site of data.sites ?? []) for (const doc of site.documents ?? []) add(doc.url, `site ${site.id} document`);
  for (const p of pathways) {
    add(p.url, `pathway ${p.id}`);
    for (const m of p.more ?? []) add(m.url, `pathway ${p.id} link`);
  }
  return [...seen.values()];
}

/** ok: opens. dead: the page is gone. unknown: blocked, rate limited or unreachable from here. */
export function classify(status) {
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  return "unknown";
}

/** HTTP status for a url, or 0 if unreachable. Falls back to GET when HEAD is refused or answered 404. */
export async function statusOf(url, fetchImpl = fetch) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
    accept: "text/html,application/xhtml+xml,*/*",
  };
  const opts = (method) => ({ method, redirect: "follow", headers, signal: AbortSignal.timeout(15000) });
  try {
    const head = await fetchImpl(url, opts("HEAD"));
    if (![403, 404, 405].includes(head.status)) return head.status;
    return (await fetchImpl(url, opts("GET"))).status;
  } catch {
    return 0;
  }
}

async function main() {
  const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
  const feeds = JSON.parse(readFileSync(new URL("../data/job-feeds.json", import.meta.url), "utf8"));
  const pathways = JSON.parse(readFileSync(new URL("../data/pathways.json", import.meta.url), "utf8"));
  const local = JSON.parse(readFileSync(new URL("../data/local-benefits.json", import.meta.url), "utf8"));
  const links = collectLinks(data, feeds, [...pathways, ...local]);
  const results = await Promise.all(links.map(async (l) => ({ ...l, status: await statusOf(l.url) })));
  const dead = results.filter((r) => classify(r.status) === "dead");
  const unknown = results.filter((r) => classify(r.status) === "unknown");
  for (const r of unknown) console.warn(`? ${r.status || "no response"} ${r.url} (${r.where})`);
  for (const r of dead) console.error(`✗ ${r.status} ${r.url} (${r.where})`);
  console.log(`Link check: ${results.length - dead.length - unknown.length} ok, ${unknown.length} unknown, ${dead.length} dead.`);
  if (dead.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
