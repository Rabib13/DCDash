// Checks data/sites.json against the project's sourcing rules. Exits non-zero on any violation.
import { readFileSync } from "node:fs";
import { checkData, checkFeeds, checkLocalBenefits, checkPathways } from "./check-data.mjs";

const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
const feeds = JSON.parse(readFileSync(new URL("../data/job-feeds.json", import.meta.url), "utf8"));
const pathways = JSON.parse(readFileSync(new URL("../data/pathways.json", import.meta.url), "utf8"));
const local = JSON.parse(readFileSync(new URL("../data/local-benefits.json", import.meta.url), "utf8"));
const errors = [...checkData(data), ...checkFeeds(feeds), ...checkPathways(pathways), ...checkLocalBenefits(local)];

if (errors.length) {
  console.error(`Data check failed (${errors.length}):\n- ` + errors.join("\n- "));
  process.exit(1);
}
console.log(`Data check passed: ${data.sites.length} sites, ${Object.keys(data.sources).length} sources, ${feeds.length} job feeds, ${pathways.length} ways in, ${local.length} local benefits.`);
