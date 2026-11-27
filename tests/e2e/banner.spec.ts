import { expect, test, type Page } from "@playwright/test";
import data from "../../data/sites.json" with { type: "json" };
import { about, buildoutSummary } from "../../lib/buildout";
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

test("the banner says plainly when no community benefits are documented, instead of hiding it", async ({ page }) => {
  await openMap(page);
  await expect(banner(page)).toContainText("No community benefit agreements or local grants are documented for these sites yet.");
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
