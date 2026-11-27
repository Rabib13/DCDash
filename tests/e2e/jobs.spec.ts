import { expect, test, type Page } from "@playwright/test";
import fixture from "../fixtures/jobs.json" with { type: "json" };
import data from "../../data/sites.json" with { type: "json" };
import { CITY_CENTER } from "../../lib/sites";

// The test server reads jobs from tests/fixtures/jobs.json (JOBS_FIXTURE), so no test depends on live job boards.
const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#f2efe8" } }] };

async function stubOutside(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(BLANK_STYLE) }));
  await page.context().route(/^https:\/\/(?!tiles\.openfreemap\.org)/, (r) => r.fulfill({ contentType: "text/html", body: "<h1>external page</h1>" }));
  return errors;
}

const jobLinks = (page: Page) => page.locator(".joblist a");
const panel = (page: Page) => page.getByRole("complementary", { name: "Open jobs" });
const bubbles = (page: Page) => page.locator(".jobbubble");

async function openJobs(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.locator(".marker")).toHaveCount(data.sites.length);
  if (!query) await page.getByRole("button", { name: /^Jobs/ }).click();
  await expect(panel(page)).toBeVisible();
}

test("the Jobs button on the map opens the jobs layer: a count, a circle per city, and the list beside the map", async ({ page }) => {
  const errors = await stubOutside(page);
  await page.goto("/");
  const local = fixture.jobs.filter((j) => !(j as { alsoElsewhere?: boolean }).alsoElsewhere);
  // The count shows on the button before anything is opened.
  await expect(page.getByRole("button", { name: `Jobs · ${local.length} open` })).toBeVisible();
  await page.getByRole("button", { name: /^Jobs/ }).click();
  await expect(page.getByRole("button", { name: /^Jobs/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/\?jobs=1$/);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Data center jobs in the Bay Area");
  const employers = new Set(local.map((j) => j.employer)).size;
  await expect(page.getByTestId("jobs-headline")).toHaveText(`${local.length} open jobs based in the Bay Area at ${employers} employers`);
  // Jobs that list other states too are counted apart, so they can't inflate the headline.
  await expect(page.getByTestId("jobs-multi")).toHaveText("Plus 1 more that can be based here or elsewhere.");
  await expect(page.getByTestId("jobs-freshness")).toHaveText(/^Updated 2 hours ago/);
  await expect(jobLinks(page)).toHaveCount(fixture.jobs.length);
  // One circle per city with jobs, labeled with its count, ringed by role type.
  // Like the headline, the number counts jobs based only here; the rest are named apart.
  await expect(bubbles(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "San Jose: 3 open jobs, plus 1 also listed elsewhere" })).toHaveText("3");
  await expect(page.getByRole("button", { name: "Hayward: 1 open job" })).toBeVisible();
  expect(await page.getByRole("button", { name: /^San Jose:/ }).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("conic-gradient");
  // Site markers fade back but stay on the map, and the legend now explains the ring colors.
  await expect(page.locator(".map-wrap--jobs")).toHaveCount(1);
  await expect(page.locator(".legend")).toContainText("Data center operations");
  expect(errors).toEqual([]);
});

test("tapping a city's circle shows that city's jobs, and the whole Bay Area is one tap back", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await page.getByRole("button", { name: /^San Jose:/ }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Jobs in San Jose");
  await expect(jobLinks(page)).toHaveCount(4);
  await expect(page).toHaveURL(/city=San\+Jose/);
  await expect(page.getByRole("button", { name: /^San Jose:/ })).toHaveClass(/jobbubble--selected/);
  // Jobs based only here come first; ones that also list other places follow.
  await expect(jobLinks(page).last()).toHaveText("Data Center Capacity Analyst");
  await page.getByRole("button", { name: `Widen to 10 miles around San Jose` }).click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("Jobs within 10 miles of San Jose");
  await expect(page).toHaveURL(/near=San\+Jose/);
  await page.getByRole("button", { name: "Show the whole Bay Area" }).click();
  await expect(jobLinks(page)).toHaveCount(fixture.jobs.length);
  await expect(page).toHaveURL(/\/\?jobs=1$/);
});

test("a role filter narrows the list and the circles, and stays in the address so the view can be shared", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await page.getByRole("button", { name: /^Electrical \(1\)/ }).click();
  await expect(jobLinks(page)).toHaveCount(1);
  await expect(jobLinks(page).first()).toHaveText("Electrician");
  await expect(bubbles(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Santa Clara: 1 open job" })).toBeVisible();
  await expect(page).toHaveURL(/role=electrical/);
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Electrical \(1\)/ })).toHaveAttribute("aria-pressed", "true");
  await expect(jobLinks(page)).toHaveCount(1);
});

test("the employer filter works the same way", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await panel(page).getByLabel("Employer").selectOption("Equinix");
  await expect(jobLinks(page)).toHaveCount(3);
  await expect(page).toHaveURL(/employer=Equinix/);
  await expect(bubbles(page)).toHaveCount(2);
  await page.reload();
  await expect(panel(page).getByLabel("Employer")).toHaveValue("Equinix");
  await expect(jobLinks(page)).toHaveCount(3);
});

test("the near filter includes neighboring cities, not just the exact one", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page, "?jobs=1&near=Santa+Clara");
  await expect(panel(page).getByLabel("Place")).toHaveValue("near:Santa Clara");
  const titles = await jobLinks(page).allInnerTexts();
  // San Jose and Sunnyvale are within 10 miles of Santa Clara; Hayward is not.
  expect(titles).toContain("Critical Facilities Engineer");
  expect(titles).toContain("Network Engineer");
  expect(titles).not.toContain("Security Officer");
});

test("an employer whose job board failed is called out, never shown as current", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  const notes = page.getByTestId("feed-problems");
  await expect(notes).toContainText(/Vantage Data Centers: couldn't refresh since .+, showing its last 1 job/);
  await expect(notes).toContainText(/CoreSite: couldn't reach its job board/);
});

test("employers whose job boards turn away automated readers are linked, not counted", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  const note = page.getByTestId("link-only");
  await expect(note).toContainText("don't allow automated reading");
  await expect(note.getByRole("link", { name: "Prologis" })).toHaveAttribute("href", "https://careers.prologis.example/");
  await expect(page.getByTestId("feed-problems")).not.toContainText("Prologis");
});

test("a site run by such an employer links to its careers page instead of a count", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "STEM Park");
  const box = page.getByTestId("site-openings");
  await expect(box).toContainText("Prologis's job board doesn't allow automated reading");
  await expect(box.getByRole("link", { name: "See Prologis jobs on its own site" })).toHaveAttribute("href", "https://careers.prologis.example/");
});

test("the jobs list is never cached while the server is still reading job boards", async ({ request }) => {
  const res = await request.get("/api/jobs");
  expect(res.headers()["cache-control"]).toBe("public, max-age=300");
});

test("a job that also lists other states says so", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await expect(page.locator(".joblist li", { hasText: "Data Center Capacity Analyst" })).toContainText("Also based outside the Bay Area");
  await expect(page.locator(".joblist li", { hasText: "HVAC Technician" })).not.toContainText("Also based outside");
});

test("a filter that matches nothing says so", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page, "?jobs=1&employer=Equinix&role=security");
  await expect(jobLinks(page)).toHaveCount(0);
  await expect(page.getByText("No open jobs match these filters.")).toBeVisible();
  await expect(bubbles(page)).toHaveCount(0);
});

test("every job opens the employer's own posting in a new tab", async ({ page, context }) => {
  await stubOutside(page);
  await openJobs(page);
  for (const link of await jobLinks(page).all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "HVAC Technician" }).click()]);
  expect(popup.url()).toBe("https://careers.equinix.example/job/1");
});

test("the panel explains what counts and links each employer's careers page", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await page.getByText("What counts here").click();
  await expect(page.getByText(/public job boards of companies that own, run, build or power/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Equinix careers" })).toHaveAttribute("href", "https://careers.equinix.example/");
});

test("the panel shows the jobs the projects' filings expect, with the filing for each", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  const withCounts = data.sites.filter((s) => (s.facts as Record<string, unknown>).construction_jobs || (s.facts as Record<string, unknown>).permanent_jobs);
  const section = page.getByTestId("filing-jobs");
  // The totals are visible up front; the table opens on request.
  await expect(section).toContainText(/about [\d,]+ permanent jobs/);
  await expect(section).toContainText(new RegExp(`from filings for ${withCounts.length} of ${data.sites.length} sites`));
  await section.getByText("See each site's filing").click();
  await expect(section.locator("tbody tr")).toHaveCount(withCounts.length);
  for (const link of await section.locator("a").all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
  }
});

test("closing the jobs layer brings the map back as it was", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  await page.getByRole("button", { name: "Close jobs" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(bubbles(page)).toHaveCount(0);
  await expect(page.locator(".map-wrap--jobs")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("with jobs open, tapping a site opens its card in place of the jobs list", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  const site = data.sites.find((s) => s.name === "SJC37")!;
  await page.evaluate((c) => (window as unknown as { __dcMap: { jumpTo: (o: object) => void } }).__dcMap.jumpTo({ center: c, zoom: 12 }), CITY_CENTER[site.city]);
  await page.getByRole("button", { name: /^SJC37,/ }).click();
  await expect(page.getByRole("complementary", { name: "SJC37 details" })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("the old jobs page address opens the jobs layer on the map, keeping its filters", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs?employer=Equinix");
  await expect(page).toHaveURL(/\/\?jobs=1&employer=Equinix$/);
  await expect(panel(page)).toBeVisible();
  await expect(jobLinks(page)).toHaveCount(3);
});

test("with jobs open, the map fits a phone screen without sideways scrolling", async ({ page }) => {
  await stubOutside(page);
  await openJobs(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

async function openSiteJobs(page: Page, name: string) {
  await page.goto("/");
  await expect(page.locator(".marker")).toHaveCount(data.sites.length);
  const site = data.sites.find((s) => s.name === name)!;
  const center = site.location.lat != null ? [site.location.lon, site.location.lat] : CITY_CENTER[site.city];
  await page.evaluate((c) => (window as unknown as { __dcMap: { jumpTo: (o: object) => void } }).__dcMap.jumpTo({ center: c, zoom: 12 }), center);
  await page.getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) }).click();
  await page.getByRole("tab", { name: "Jobs" }).click();
}

test("a site's Jobs tab counts its operator's openings nearby and opens the filtered jobs page", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "SJC37");
  // Digital Realty has 3 openings in Santa Clara and San Jose, and 1 in Hayward, which is too far.
  await expect(page.getByTestId("site-openings")).toContainText("3 openings at Digital Realty within 10 miles of Santa Clara");
  await expect(page.getByTestId("site-openings").locator("li")).toHaveCount(3);
  // The link opens the jobs layer right here on the map, filtered to this operator and area.
  await page.getByRole("link", { name: "See all Digital Realty jobs" }).click();
  await expect(page).toHaveURL(/\/\?jobs=1&employer=Digital\+Realty&near=Santa\+Clara$/);
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "SJC37 details" })).toHaveCount(0);
  await expect(jobLinks(page)).toHaveCount(3);
});

test("a site owned by an employer under its legal name still finds that employer's jobs", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "San Jose Data Center");
  await expect(page.getByTestId("site-openings")).toContainText("1 opening at Microsoft within 10 miles of San Jose");
});

test("a site with no named operator still points to every data center job nearby", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "Walsh Data Center");
  await expect(page.getByText(/don't name who runs this site/)).toBeVisible();
  const all = page.getByRole("link", { name: /^All data center jobs near Santa Clara \(\d+\)$/ });
  await expect(all).toHaveAttribute("href", "/?jobs=1&near=Santa+Clara");
});

test("job counts on a site card say they're a plan from a dated filing, with the filing's words", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "Walsh Data Center");
  const row = page.locator(".fact", { hasText: "Construction jobs" });
  await expect(row).toContainText("175");
  await expect(row).toContainText("Plan in a 2020 filing");
  await expect(row).toContainText("peak workforce of 175");
});

test("a range in a filing shows as a range", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "CA3");
  await expect(page.locator(".fact", { hasText: "Permanent jobs" })).toContainText("19 to 21");
});

test("a site whose filings give no clear count says Not disclosed yet", async ({ page }) => {
  await stubOutside(page);
  await openSiteJobs(page, "NorthTown Data Center");
  await expect(page.locator(".fact", { hasText: "Permanent jobs" })).toContainText("Not disclosed yet");
});
