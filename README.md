# DC Dash (working name)

A map of AI data centers in California, starting with the Bay Area. For each site it shows what is built or planned, where the water and power come from, the public documents, the jobs it creates, and what the community gets back.

**The rule:** every fact on the site links to the source it came from, and carries a confidence label:

- `confirmed` — two independent sources agree
- `reported` — one source
- `not_disclosed` — no public source found

Only sites where a source says the facility runs or is built for AI / GPU workloads appear on the map.

## Status

Phase 0: data foundation. Each site card has tabs for Overview, Power & water, Environment, Jobs and Community. Anything without a source shows "Not disclosed yet". Job openings are a dated snapshot from the operator's own job board (or Indeed when the board can't be read), with a link to the live list.

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm run validate   # checks data/sites.json against the sourcing rules
npm run build      # validate + production build
```

## Data

- `data/sites.json` is what the map shows. Each fact lists the keys of the sources it came from. The app works out the confidence label from how many different publishers back it.
- `npm run validate` fails if a fact has no source, a source is missing, or a site has no `ai_use` fact.
- Sites with no sourced address are drawn at their city center, and the site card says so.
- `data/candidates/` holds sites found in public filings that have no source yet tying them to AI. They stay off the map until one turns up.

The map uses free [OpenFreeMap](https://openfreemap.org) tiles with [MapLibre](https://maplibre.org).
