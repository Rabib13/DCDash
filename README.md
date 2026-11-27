# DC Dash (working name)

A map of large and AI data centers in California, starting with the Bay Area. For each site it shows what is built or planned, where the water and power come from, the public documents, the jobs it creates, and what the community gets back.

**The rule:** every fact on the site links to the source it came from, and carries a confidence label:

- `confirmed` — two independent sources agree
- `reported` — one source
- `not_disclosed` — no public source found

A site appears on the map when a source puts it over 20 MW, or when a source ties it to AI / GPU workloads. Each card says whether a source ties the site to AI, or shows "Not disclosed yet".

## Status

Phase 0: data foundation. Each site card has tabs for Overview, Power & water, Environment, Jobs and Community. Anything without a source shows "Not disclosed yet". Job openings are a dated snapshot from the operator's own job board (or Indeed when the board can't be read), with a link to the live list.

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm run validate   # checks data/sites.json against the sourcing rules
npm run build      # validate + production build
npm test           # unit tests, data check, build, then browser tests
npm run check-links  # opens every source, careers and job link and fails on dead ones
```

## Tests

New code starts with a failing test.

- `tests/unit/` (Vitest): the sourcing rules (`scripts/check-data.mjs`), confidence labels, map positions, tab grouping, job matching and search links, and the link checker. It also runs the rules against the real `data/sites.json`.
- `tests/e2e/` (Playwright, desktop and phone): the map loads, every site's five tabs open without errors, every link is https and opens in a new tab, a job link really opens, and missing facts say "Not disclosed yet". Map tiles and outside pages are stubbed, so the tests never touch the internet.
- GitHub Actions runs `npm test` on every pull request. `npm run check-links` runs on data changes and every Monday, because job postings close.

## Data

- `data/sites.json` is what the map shows. Each fact lists the keys of the sources it came from. The app works out the confidence label from how many different publishers back it.
- `npm run validate` fails if a fact has no source, a source is missing, or a site is neither over 20 MW nor tied to AI by a source.
- Sites with no sourced address are drawn at their city center, and the site card says so.
- Sites come from California Energy Commission filings (backup generator exemptions), state environmental review records, and the Compute Atlas Bay Area list, cross-checked where more than one covers a site.

## Jobs

- `/jobs` lists open Bay Area jobs read live from employers' own public job boards. The employers are listed in `data/job-feeds.json`, and `npm run validate` checks that file too.
- The server keeps the jobs for 6 hours. After that, the next visitor still gets the last list right away while a fresh one loads in the background, because some boards (Workday, Eightfold) only allow slow reads.
- If a board fails, its last jobs stay up for at most 7 days, labeled "couldn't refresh since". Closed postings drop off on the next refresh.
- Jobs that also list places outside the Bay Area are counted separately from jobs based only here.
- Site cards count the operator's openings within 10 miles. Postings name a city, not a building, so no job is tied to one site.
- Construction and permanent job counts come from each site's filing. Each one quotes the filing and names its page.
- Browser tests read jobs from `tests/fixtures/jobs.json`. Parser tests use real job board responses in `tests/fixtures/feeds/`.

The map uses free [OpenFreeMap](https://openfreemap.org) tiles with [MapLibre](https://maplibre.org).
