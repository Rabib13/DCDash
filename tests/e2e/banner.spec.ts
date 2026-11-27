import { expect, test, type Page } from "@playwright/test";
import data from "../../data/sites.json" with { type: "json" };
import pathways from "../../data/pathways.json" with { type: "json" };
import { about, buildoutSummary, waysInSummary } from "../../lib/buildout";
import type { Pathway } from "../../lib/types";
import type { Site } from "../../lib/types";

const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#f2efe8" } }] };

async function openMap(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(BLANK_STYLE) }));
  await page.context().route(/^https:\/\/(?!tiles\.openfreemap\.org)/, (r) => r.fulfill({ contentType: "text/html", body: "<h1>external page</h1>" }));
  await page.goto("/");
  await expect(page.locator(".marker")).toHaveCount(data.sites.length);
  return errors;
}

const banner = (page: Page) => page.getByTestId("buildout-banner");
const planned = buildoutSummary(null, data.sites as unknown as Site[]).planned;

test("without any click, the map says what the buildout brings: jobs open now, from whom, and jobs planned", async ({ page }) => {
  const errors = await openMap(page);
  await expect(banner(page)).toBeVisible();
  // tests/fixtures/jobs.json: 8 jobs based only here; Digital Realty has 4, Equinix 2, then Microsoft and Vantage 1 each.
  await expect(banner(page)).toContainText("8 jobs open now");
  await expect(banner(page)).toContainText("at Digital Realty, Equinix, Microsoft and 1 more");
  await expect(banner(page)).toContainText("across 7 kinds of work");
  await expect(banner(page)).toContainText(`${about(planned.permanent)} permanent jobs`);
  await expect(banner(page)).toContainText(`${about(planned.construction)} construction workers`);
  await expect(banner(page)).toContainText(`from ${planned.filings} sites' filings`);
  expect(errors).toEqual([]);
});

test("the banner says how many sites have documented community benefits, with an example, and that most have none", async ({ page }) => {
  await openMap(page);
  const s = buildoutSummary(null, data.sites as unknown as Site[]);
  expect(s.benefitSites).toBeGreaterThan(0);
  await expect(banner(page)).toContainText(`${s.benefitSites} of ${data.sites.length} sites have documented community benefits`);
  await expect(banner(page)).toContainText(`${s.benefitExample!.value} at ${s.benefitExample!.site} in ${s.benefitExample!.city}`);
});

test("moving the map shrinks the banner to one line, so it never covers sites; one tap opens it again", async ({ page }) => {
  await openMap(page);
  await page.evaluate(() => (window as unknown as { __dcMap: { jumpTo: (o: object) => void } }).__dcMap.jumpTo({ zoom: 11 }));
  await expect(banner(page)).toHaveCount(0);
  const pill = page.getByRole("button", { name: /jobs open now/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(banner(page)).toBeVisible();
});

test("See open jobs opens the jobs layer on the map", async ({ page }) => {
  await openMap(page);
  await banner(page).getByRole("button", { name: "See open jobs" }).click();
  await expect(page.getByRole("complementary", { name: "Open jobs" })).toBeVisible();
  await expect(page).toHaveURL(/\?jobs=1$/);
  // The banner steps aside while a panel is open.
  await expect(banner(page)).toHaveCount(0);
});

test("the banner can be tucked away, stays tucked after a reload, and comes back with one tap", async ({ page }) => {
  await openMap(page);
  await banner(page).getByRole("button", { name: "Hide summary" }).click();
  await expect(banner(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".marker")).toHaveCount(data.sites.length);
  await expect(banner(page)).toHaveCount(0);
  await page.getByRole("button", { name: "What's in it for me?" }).click();
  await expect(banner(page)).toBeVisible();
});

test("with the banner showing, the map fits a phone screen without sideways scrolling", async ({ page }) => {
  await openMap(page);
  await expect(banner(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the banner names the ways in, and See ways in lists each program with its own page", async ({ page, context }) => {
  await openMap(page);
  const w = waysInSummary(pathways as Pathway[]);
  await expect(banner(page)).toContainText(`${w.apprenticeships} paid apprenticeships`);
  await banner(page).getByRole("button", { name: "See ways in" }).click();
  const panel = page.getByRole("complementary", { name: "Open jobs" });
  await expect(panel.getByRole("tab", { name: "Ways in" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?jobs=1&tab=ways$/);
  // Job circles step aside while the list is about training.
  await expect(page.locator(".jobbubble")).toHaveCount(0);
  const items = panel.locator(".pathways li");
  await expect(items).toHaveCount(pathways.length);
  for (const link of await panel.locator(".pathways a").all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  // Each program shows its own page's words.
  const first = pathways[0];
  await expect(items.filter({ hasText: first.name }).first()).toContainText(first.quote);
  const [popup] = await Promise.all([context.waitForEvent("page"), items.filter({ hasText: first.name }).first().getByRole("link", { name: first.name }).click()]);
  expect(popup.url()).toBe(first.url);
  // Switching back to open jobs keeps the panel open.
  await panel.getByRole("tab", { name: "Open jobs" }).click();
  await expect(page).toHaveURL(/\?jobs=1$/);
  await expect(page.locator(".joblist a").first()).toBeVisible();
  await expect(page.locator(".jobbubble").first()).toBeVisible();
});

test("ways in can be narrowed to apprenticeships, college programs or free training", async ({ page }) => {
  await openMap(page);
  await page.goto("/?jobs=1&tab=ways");
  const panel = page.getByRole("complementary", { name: "Open jobs" });
  const apprenticeships = pathways.filter((p) => p.kind === "apprenticeship").length;
  await panel.getByRole("button", { name: new RegExp(`^Apprenticeships \\(${apprenticeships}\\)`) }).click();
  await expect(panel.locator(".pathways li")).toHaveCount(apprenticeships);
});
