import { expect, test, type Page } from "@playwright/test";
import data from "../../data/sites.json" with { type: "json" };
import { CITY_CENTER as CENTERS } from "../../lib/sites";

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
  // Many sites share a city, so zoom into the city first, as a visitor would.
  await page.evaluate((c) => (window as unknown as { __dcMap: { jumpTo: (o: object) => void } }).__dcMap.jumpTo({ center: c, zoom: 12 }), whereIs(name));
  await page.getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) }).click();
  await expect(page.getByRole("complementary", { name: `${name} details` })).toBeVisible();
}

test("the map shows one marker per site and a legend", async ({ page }) => {
  const errors = await openMap(page);
  await expect(page.getByText("Operating", { exact: true })).toBeVisible();
  await expect(page.getByText(`${data.sites.length} sites`)).toBeVisible();
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

// Visitors without the Inter font get a wider fallback, which once pushed the last tab off screen.
// Force a wide font to test the worst case, on both desktop and phone.
for (const font of ["Inter", "DejaVu Sans"]) {
  test(`all five tabs stay on screen with the ${font} font`, async ({ page }) => {
    await openMap(page);
    await page.addStyleTag({ content: `.tabs, .tab { font-family: "${font}", sans-serif !important; }` });
    await openSite(page, "SJC37");
    const tabs = page.locator(".tabs");
    expect(await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const box = (await tabs.boundingBox())!;
    for (const tab of await page.getByRole("tab").all()) {
      const t = (await tab.boundingBox())!;
      expect(t.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(t.x + t.width).toBeLessThanOrEqual(box.x + box.width + 1);
      // The label itself must fit inside its tab, not spill into the next one.
      expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await tab.innerText()).toBe(true);
    }
  });
}

test("a big site with no AI source says so instead of guessing", async ({ page }) => {
  await openMap(page);
  await openSite(page, "Walsh Data Center");
  const ai = page.locator(".fact", { hasText: "AI use" });
  await expect(ai).toContainText("Not disclosed yet");
  await expect(page.locator(".fact", { hasText: "Size (MW)" })).toContainText("80");
  await expect(page.getByText("Owned by 651 Walsh Partners, LLC")).toBeVisible();
});

test("a site with no named operator explains why it has no openings", async ({ page }) => {
  await openMap(page);
  await openSite(page, "Walsh Data Center");
  await page.getByRole("tab", { name: "Jobs" }).click();
  await expect(page.getByText(/don't name who runs this site/)).toBeVisible();
  await expect(page.getByRole("link", { name: "near Santa Clara" }).first()).toBeVisible();
});

test("Energy Commission filings show on the Environment tab", async ({ page }) => {
  await openMap(page);
  await openSite(page, "CA3");
  await page.getByRole("tab", { name: "Environment" }).click();
  const cec = page.locator(".fact", { hasText: "Energy Commission" });
  await expect(cec).toContainText("Exemption approved August 2022");
  await expect(cec.getByRole("link", { name: "California Energy Commission" })).toHaveAttribute("href", /energy\.ca\.gov/);
});

test("every marker can be clicked once you zoom in on it", async ({ page }) => {
  test.setTimeout(180_000);
  await openMap(page);
  for (const { name } of data.sites) {
    // Zoom to street level around the site, the way a visitor would.
    await page.evaluate((c) => (window as unknown as { __dcMap: { jumpTo: (o: object) => void } }).__dcMap.jumpTo({ center: c, zoom: 12 }), whereIs(name));
    await page.waitForTimeout(50);
    const marker = page.getByRole("button", { name: new RegExp(`^${escape(name)},`) });
    const box = await marker.boundingBox();
    expect(box, `${name} is on screen`).not.toBeNull();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".marker")?.getAttribute("aria-label") ?? "", [box!.x + box!.width / 2, box!.y + box!.height / 2]);
    expect(hit, `${name} is not covered by another marker`).toMatch(new RegExp(`^${escape(name)},`));
  }
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where a site sits on the map: its pinned address, or its city center. */
function whereIs(name: string): [number, number] {
  const site = data.sites.find((s) => s.name === name)!;
  if (site.location.lat != null && site.location.lon != null) return [site.location.lon, site.location.lat];
  return centerOf(site.city);
}

function centerOf(city: string): [number, number] {
  const site = data.sites.find((s) => s.city === city)!;
  // Sites without an address sit at the city center; read it from the first such site's marker data.
  return CENTERS[city] ?? [site.location.lon ?? -122.2, site.location.lat ?? 37.6];
}

test("a site pinned at its address doesn't say its pin is approximate", async ({ page }) => {
  await openMap(page);
  await openSite(page, "Walsh Data Center");
  await expect(page.getByText(/pin sits at the city center/)).toHaveCount(0);
  await expect(page.locator(".fact", { hasText: "Address" })).toContainText("651 Walsh Avenue");
});

test("a site with AI evidence shows the quote and where it came from", async ({ page }) => {
  await openMap(page);
  await openSite(page, "Pittsburg Data Hub");
  const ai = page.locator(".fact", { hasText: "AI use" });
  await expect(ai).toContainText("including AI, cloud services");
  await expect(ai.getByRole("link", { name: "SFist" })).toBeVisible();
});

test("at the first view, no marker covers another", async ({ page }) => {
  await openMap(page);
  await page.waitForTimeout(500);
  const boxes = await page.locator(".marker").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(Math.hypot(boxes[i][0] - boxes[j][0], boxes[i][1] - boxes[j][1]), `markers ${i} and ${j}`).toBeGreaterThanOrEqual(43);
});
