// Checks data/sites.json against the project's sourcing rules. Exits non-zero on any violation.
import { readFileSync } from "node:fs";

const STAGES = new Set(["announced", "proposed", "in_review", "approved", "under_construction", "built_not_energized", "operating"]);
const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
const errors = [];

for (const [key, s] of Object.entries(data.sources)) {
  if (!s.url?.startsWith("https://")) errors.push(`source ${key}: url must be https`);
  if (!s.title || !s.publisher || !s.accessed) errors.push(`source ${key}: needs title, publisher and accessed date`);
}

const ids = new Set();
for (const site of data.sites) {
  const where = `site ${site.id ?? "(no id)"}`;
  if (ids.has(site.id)) errors.push(`${where}: duplicate id`);
  ids.add(site.id);
  if (!STAGES.has(site.stage)) errors.push(`${where}: unknown stage "${site.stage}"`);
  if (!site.facts?.ai_use) errors.push(`${where}: no ai_use fact. Only sites a source ties to AI belong on the map`);
  for (const [name, fact] of Object.entries(site.facts ?? {})) {
    if (!Array.isArray(fact.sources) || fact.sources.length === 0) errors.push(`${where}.${name}: no source`);
    for (const ref of fact.sources ?? []) if (!data.sources[ref]) errors.push(`${where}.${name}: unknown source "${ref}"`);
  }
  const { lat, lon, precision } = site.location ?? {};
  if ((lat == null) !== (lon == null)) errors.push(`${where}: lat and lon must both be set or both be null`);
  if (lat != null && precision !== "address") errors.push(`${where}: exact coordinates need precision "address"`);
}

if (errors.length) {
  console.error(`Data check failed (${errors.length}):\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`Data check passed: ${data.sites.length} sites, ${Object.keys(data.sources).length} sources.`);
