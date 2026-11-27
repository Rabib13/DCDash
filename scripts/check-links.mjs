// Checks that every outbound link on the site still opens. Run with `npm run check-links`.
// Sites that block automated requests (403, 429) are reported as "unknown", not failures,
// because a visitor's browser usually opens them fine. Only 404 and 410 fail the check.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Every link a visitor can click, with where it appears. Each url is listed once. */
export function collectLinks(data) {
  const seen = new Map();
  const add = (url, where) => {
    if (url && !seen.has(url)) seen.set(url, { url, where });
  };
  for (const [key, s] of Object.entries(data.sources ?? {})) add(s.url, `source ${key}`);
  for (const [name, op] of Object.entries(data.operators ?? {})) {
    if (op.careers) add(op.careers.url, `operator ${name} careers`);
    for (const job of op.openings?.items ?? []) add(job.url, `operator ${name} job "${job.title}"`);
  }
  for (const site of data.sites ?? []) for (const doc of site.documents ?? []) add(doc.url, `site ${site.id} document`);
  return [...seen.values()];
}

/** ok: opens. dead: the page is gone. unknown: blocked, rate limited or unreachable from here. */
export function classify(status) {
  if (status >= 200 && status < 400) return "ok";
  if (status === 404 || status === 410) return "dead";
  return "unknown";
}

async function statusOf(url) {
  const headers = { "user-agent": "Mozilla/5.0 (compatible; dc-dash-link-check)" };
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: AbortSignal.timeout(15000) });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { redirect: "follow", headers, signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch {
    return 0;
  }
}

async function main() {
  const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
  const links = collectLinks(data);
  const results = await Promise.all(links.map(async (l) => ({ ...l, status: await statusOf(l.url) })));
  const dead = results.filter((r) => classify(r.status) === "dead");
  const unknown = results.filter((r) => classify(r.status) === "unknown");
  for (const r of unknown) console.warn(`? ${r.status || "no response"} ${r.url} (${r.where})`);
  for (const r of dead) console.error(`✗ ${r.status} ${r.url} (${r.where})`);
  console.log(`Link check: ${results.length - dead.length - unknown.length} ok, ${unknown.length} unknown, ${dead.length} dead.`);
  if (dead.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
