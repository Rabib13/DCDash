# DC Dash (working name)

A map of AI data centers in California, starting with the Bay Area. For each site it shows what is built or planned, where the water and power come from, the public documents, the jobs it creates, and what the community gets back.

**The rule:** every fact on the site links to the source it came from, and carries a confidence label:

- `confirmed` — two independent sources agree
- `reported` — one source
- `not_disclosed` — no public source found

Only sites where a source says the facility runs or is built for AI / GPU workloads appear on the map.

## Status

Phase 0: data foundation. See `data/` and `scripts/validate-data.mjs`.
