import { expect, test, type Page } from "@playwright/test";
import data from "../../data/sites.json" with { type: "json" };

// Map tiles come from a third-party server. Serve a blank style so tests don't depend on it.
const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#f2efe8" } }] };
const TABS = ["Overview", "Power & water", "Environment", "Jobs", "Community"];

async function openMap(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(BLANK_STYLE) }));
  // Never leave the test machine: answer every outbound link with a stub page.
  await page.context().route(/^https:\/\/(?!tiles\.openfreemap\.org)/, (r) => r.fulfill({ contentType: "text/html", body: "<h1>external page</h1>" }));
  await page.goto("/");
  await expect(page.locator(".marker")).toHaveCount(data.sites.length);
  return errors;
}

async function openSite(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) }).click();
  await expect(page.getByRole("complementary", { name: `${name} details` })).toBeVisible();
}

test("the map shows one marker per site and a legend", async ({ page }) => {
  const errors = await openMap(page);
  await expect(page.getByText("Operating", { exact: true })).toBeVisible();
  await expect(page.getByText(`${data.sites.length} AI sites`)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const site of data.sites) {
  test(`${site.name}: every tab opens and every link is safe and opens in a new tab`, async ({ page }) => {
    const errors = await openMap(page);
    await openSite(page, site.name);
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).not.toBeEmpty();
      const links = page.locator(".panel a");
      for (const link of await links.all()) {
        await expect(link).toHaveAttribute("href", /^https:\/\//);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
        await expect(link).toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  });
}

test("clicking a job link opens the job in a new tab", async ({ page, context }) => {
  await openMap(page);
  await openSite(page, "SJC37");
  await page.getByRole("tab", { name: "Jobs" }).click();
  const job = page.getByRole("link", { name: "Manager Engineering Operations" });
  const [popup] = await Promise.all([context.waitForEvent("page"), job.click()]);
  expect(popup.url()).toBe("https://www.indeed.com/viewjob?jk=0f5d217fcce4fb91");
  await expect(page.getByRole("complementary", { name: "SJC37 details" })).toBeVisible();
});

test("an operator whose job board is down shows why, with no broken links", async ({ page }) => {
  await openMap(page);
  await openSite(page, "MV-1");
  await page.getByRole("tab", { name: "Jobs" }).click();
  await expect(page.getByText(/ECL's public job board .* returned "not found"/)).toBeVisible();
  await expect(page.locator('.panel a[href*="lever.co"]')).toHaveCount(0);
  // The general data center job searches still work.
  await expect(page.getByRole("link", { name: "near Mountain View" }).first()).toBeVisible();
});

test("missing facts say Not disclosed yet instead of guessing", async ({ page }) => {
  await openMap(page);
  await openSite(page, "SJC37");
  await page.getByRole("tab", { name: "Community" }).click();
  await expect(page.getByText("Not disclosed yet")).toBeVisible();
});

test("facts show their confidence and link to each publisher", async ({ page }) => {
  await openMap(page);
  await openSite(page, "SVY02A");
  await page.getByRole("tab", { name: "Power & water" }).click();
  const utility = page.locator(".fact", { hasText: "Electric utility" });
  await expect(utility).toContainText("Silicon Valley Power");
  await expect(utility).toContainText("Confirmed in 2+ sources");
  await expect(utility.getByRole("link", { name: "Tom's Hardware" })).toBeVisible();
});

test("the panel resets to Overview when another site is picked, and closes", async ({ page }) => {
  await openMap(page);
  await openSite(page, "SJC37");
  await page.getByRole("tab", { name: "Jobs" }).click();
  await page.getByRole("button", { name: "Close site details" }).click();
  await expect(page.locator(".panel")).toHaveCount(0);
  await openSite(page, "SVY02A");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});

test("all five tabs fit without scrolling on this screen size", async ({ page }) => {
  await openMap(page);
  await openSite(page, "SJC37");
  const fits = await page.locator(".tabs").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  test.skip(!fits && (page.viewportSize()?.width ?? 0) < 500, "Tabs scroll sideways on phones by design");
  expect(fits).toBe(true);
});
