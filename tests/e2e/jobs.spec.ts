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

test("the jobs page leads with how many jobs are open and how fresh the list is", async ({ page }) => {
  const errors = await stubOutside(page);
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data center jobs in the Bay Area");
  const local = fixture.jobs.filter((j) => !(j as { alsoElsewhere?: boolean }).alsoElsewhere);
  const employers = new Set(local.map((j) => j.employer)).size;
  await expect(page.getByTestId("jobs-headline")).toHaveText(`${local.length} open jobs based in the Bay Area at ${employers} data center companies`);
  // Jobs that list other states too are counted apart, so they can't inflate the headline.
  await expect(page.getByTestId("jobs-multi")).toHaveText("Plus 1 more that can be based here or elsewhere.");
  await expect(page.getByTestId("jobs-freshness")).toHaveText(/^Updated 2 hours ago/);
  await expect(jobLinks(page)).toHaveCount(fixture.jobs.length);
  expect(errors).toEqual([]);
});

test("an employer whose job board failed is called out, never shown as current", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  const notes = page.getByTestId("feed-problems");
  await expect(notes).toContainText(/Vantage Data Centers: couldn't refresh since .+, showing its last 1 job/);
  await expect(notes).toContainText(/CoreSite: couldn't reach its job board/);
});

test("filters narrow the list and stay in the address, so a filtered view can be shared", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  await page.getByRole("button", { name: /^Electrical \(1\)/ }).click();
  await expect(jobLinks(page)).toHaveCount(1);
  await expect(jobLinks(page).first()).toHaveText("Electrician");
  await expect(page).toHaveURL(/role=electrical/);

  await page.getByRole("button", { name: /^All roles/ }).click();
  await page.getByLabel("Employer").selectOption("Equinix");
  await expect(jobLinks(page)).toHaveCount(3);
  await expect(page).toHaveURL(/employer=Equinix/);

  await page.reload();
  await expect(page.getByLabel("Employer")).toHaveValue("Equinix");
  await expect(jobLinks(page)).toHaveCount(3);
});

test("the near filter includes neighboring cities, not just the exact one", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs?near=Santa+Clara");
  const titles = await jobLinks(page).allInnerTexts();
  // San Jose and Sunnyvale are within 10 miles of Santa Clara; Hayward is not.
  expect(titles).toContain("Critical Facilities Engineer");
  expect(titles).toContain("Network Engineer");
  expect(titles).not.toContain("Security Officer");
});

test("a job that also lists other states says so", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  await expect(page.locator(".joblist li", { hasText: "Data Center Capacity Analyst" })).toContainText("Also based outside the Bay Area");
  await expect(page.locator(".joblist li", { hasText: "HVAC Technician" })).not.toContainText("Also based outside");
});

test("a filter that matches nothing says so", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs?employer=Equinix&role=security");
  await expect(jobLinks(page)).toHaveCount(0);
  await expect(page.getByText("No open jobs match these filters.")).toBeVisible();
});

test("every job opens the employer's own posting in a new tab", async ({ page, context }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  for (const link of await jobLinks(page).all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "HVAC Technician" }).click()]);
  expect(popup.url()).toBe("https://careers.equinix.example/job/1");
});

test("the page explains what counts and links each employer's careers page", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  await expect(page.getByText(/public job boards of companies that own, run or build/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Equinix careers" })).toHaveAttribute("href", "https://careers.equinix.example/");
});

test("the page shows the jobs the projects' filings expect, with the filing for each", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
  const withCounts = data.sites.filter((s) => (s.facts as Record<string, unknown>).construction_jobs || (s.facts as Record<string, unknown>).permanent_jobs);
  const section = page.getByTestId("filing-jobs");
  await expect(section.locator("tbody tr")).toHaveCount(withCounts.length);
  await expect(section).toContainText(new RegExp(`from filings for ${withCounts.length} of ${data.sites.length} sites`));
  for (const link of await section.locator("a").all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
  }
});

test("the map links to the jobs page, and the jobs page links back", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Jobs" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the jobs page fits a phone screen without sideways scrolling", async ({ page }) => {
  await stubOutside(page);
  await page.goto("/jobs");
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
  await page.getByRole("link", { name: "See all Digital Realty jobs" }).click();
  await expect(page).toHaveURL(/\/jobs\?employer=Digital\+Realty&near=Santa\+Clara/);
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
  await expect(all).toHaveAttribute("href", "/jobs?near=Santa+Clara");
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
