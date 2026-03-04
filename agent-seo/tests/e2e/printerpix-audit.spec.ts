// tests/e2e/printerpix-audit.spec.ts
// Full E2E audit of printerpix.co.uk through the AgentSEO web UI.
// Captures console errors, scores, content/E-E-A-T card, sitemap logs, and visual issues.
import { test, expect } from "@playwright/test";
import * as path from "path";

const TEST_DOMAIN = "https://printerpix.co.uk";
const AUDIT_TIMEOUT = 480_000; // 8 minutes max for the full audit
const POLL_INTERVAL = 15_000; // poll every 15 seconds

// Use absolute path for screenshots to guarantee persistence
const SCREENSHOTS_DIR = path.resolve(__dirname, "report", "printerpix");

// Collect browser console errors
const consoleErrors: string[] = [];
const consoleWarnings: string[] = [];

test.use({
  viewport: { width: 1600, height: 900 }, // Wide viewport to see sidebar (lg breakpoint)
});

test.describe("Printerpix.co.uk Full Audit", () => {
  test("run full audit, capture results, and report findings", async ({ page, request }) => {
    test.setTimeout(AUDIT_TIMEOUT);

    // ── 1. Collect browser console errors ──────────────────────────────────
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      } else if (msg.type() === "warning") {
        consoleWarnings.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    });

    // Ensure screenshot dir exists
    const fs = require("fs");
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    // ── 2. Navigate to homepage and take screenshot ────────────────────────
    console.log("STEP 1: Navigating to http://localhost:3000");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01-homepage.png"), fullPage: true });
    console.log("  Homepage loaded. Screenshot saved.");

    await expect(page.locator("h1")).toContainText("See how AI sees your website");

    // ── 3. Use PUT endpoint to create audit record, then navigate directly ─
    console.log("STEP 2: Creating audit via PUT /api/audit, then navigating to audit page");
    const putRes = await request.put("/api/audit", {
      data: { domain: TEST_DOMAIN },
      headers: { "Content-Type": "application/json" },
    });
    expect(putRes.ok()).toBeTruthy();
    const { auditId } = (await putRes.json()) as { auditId: string };
    console.log(`  Audit ID: ${auditId}`);

    const auditUrl = `/audit/${auditId}?domain=${encodeURIComponent(TEST_DOMAIN)}`;
    console.log(`  Navigating to: ${auditUrl}`);
    await page.goto(auditUrl, { waitUntil: "commit", timeout: 30_000 });
    await page.waitForTimeout(3000); // Let React hydrate and SSE connect

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02-audit-page-initial.png"), fullPage: true });

    await expect(page.locator("header").first()).toBeVisible({ timeout: 15_000 });
    console.log("  Audit dashboard loaded.");

    // ── 4. Wait for Crawler agent to start ─────────────────────────────────
    console.log("STEP 3: Waiting for Crawler agent to start...");
    try {
      await expect(page.getByText("Crawler")).toBeVisible({ timeout: 30_000 });
      console.log("  Crawler agent visible in timeline.");
    } catch {
      console.log("  WARNING: Crawler text not visible in timeline after 30s");
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03-crawler-started.png"), fullPage: true });

    // ── 5. Poll for audit completion ───────────────────────────────────────
    console.log("STEP 4: Polling for audit completion (up to 6 minutes)...");
    const startTime = Date.now();
    let auditComplete = false;
    let pollCount = 0;

    while (Date.now() - startTime < 360_000) {
      pollCount++;
      await page.waitForTimeout(POLL_INTERVAL);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  Poll #${pollCount} (${elapsed}s elapsed)...`);

      if (pollCount % 4 === 0) {
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `04-progress-${elapsed}s.png`),
          fullPage: true,
        });
      }

      const techVisible = await page.locator("text=Technical SEO").first().isVisible().catch(() => false);
      const contentVisible = await page.locator("text=Content Quality").first().isVisible().catch(() => false);
      const schemaVisible = await page.locator("text=Schema Markup").first().isVisible().catch(() => false);
      const geoVisible = await page.locator("text=AI Visibility (GEO)").first().isVisible().catch(() => false);

      const visibleCards = [techVisible, contentVisible, schemaVisible, geoVisible].filter(Boolean).length;
      console.log(`    Visible result cards: ${visibleCards}/4 (T:${techVisible} C:${contentVisible} S:${schemaVisible} G:${geoVisible})`);

      const strategistDone = await page.locator("text=Prioritized Actions").isVisible().catch(() => false);
      if (strategistDone) {
        console.log("  Strategist results visible - audit complete!");
        auditComplete = true;
        break;
      }

      if (visibleCards === 4) {
        console.log("  All 4 result cards visible. Waiting 30s more for strategist...");
        await page.waitForTimeout(30_000);
        const strategistNow = await page.locator("text=Prioritized Actions").isVisible().catch(() => false);
        auditComplete = true;
        if (strategistNow) console.log("  Strategist also completed.");
        else console.log("  Strategist not yet visible, but all 4 cards are done.");
        break;
      }

      const isStillLive = await page.locator("text=LIVE").first().isVisible().catch(() => false);
      if (!isStillLive && visibleCards >= 2) {
        console.log("  LIVE indicator gone and some results visible. Waiting 15s more...");
        await page.waitForTimeout(15_000);
        auditComplete = true;
        break;
      }

      const failedMsg = await page.locator("text=The audit failed").isVisible().catch(() => false);
      if (failedMsg) {
        console.log("  AUDIT FAILED - failure message visible!");
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "FAILED-audit.png"), fullPage: true });
        break;
      }
    }

    if (!auditComplete) {
      console.log("  WARNING: Audit did not fully complete within timeout. Capturing current state.");
    }

    // ── 6. Final dashboard screenshot ──────────────────────────────────────
    console.log("STEP 5: Capturing final dashboard state");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05-final-dashboard-top.png"), fullPage: true });

    // ── 7. Sidebar scores ──────────────────────────────────────────────────
    console.log("STEP 6: Capturing sidebar scores");
    const sidebar = page.locator("aside").first();
    if (await sidebar.isVisible().catch(() => false)) {
      await sidebar.screenshot({ path: path.join(SCREENSHOTS_DIR, "06-sidebar-scores.png") });
      console.log("  Sidebar screenshot saved.");

      const overallScoreText = await page
        .locator('svg[role="img"] text')
        .first()
        .textContent()
        .catch(() => null);
      console.log(`  OVERALL SCORE (SVG): ${overallScoreText}`);

      const subScoreElements = page.locator("aside .grid.grid-cols-2 > div");
      const subScoreCount = await subScoreElements.count();
      for (let i = 0; i < subScoreCount; i++) {
        const label = await subScoreElements.nth(i).locator("span").first().textContent().catch(() => "?");
        const value = await subScoreElements.nth(i).locator("span.font-mono").textContent().catch(() => "?");
        console.log(`    ${label}: ${value}`);
      }
    } else {
      console.log("  WARNING: Sidebar not visible");
    }

    // ── 8. Individual result cards ─────────────────────────────────────────
    console.log("STEP 7: Capturing individual result cards");

    // Technical Card
    if (await page.locator("text=Technical SEO").first().isVisible().catch(() => false)) {
      await page.locator("text=Technical SEO").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "07-technical-card.png") });

      // Extract score from the card header
      const techScoreEl = page.locator("text=Technical SEO").first().locator("..").locator("span.font-mono");
      const techScore = await techScoreEl.textContent().catch(() => "N/A");
      const cwvVisible = await page.locator("text=Core Web Vitals").isVisible().catch(() => false);
      const issuesSection = await page.locator("text=/Issues \\(/").isVisible().catch(() => false);
      console.log(`  TECHNICAL CARD - Score: ${techScore}, CWV: ${cwvVisible}, Issues: ${issuesSection}`);
    } else {
      console.log("  WARNING: Technical Card NOT visible");
    }

    // Content Card (E-E-A-T)
    if (await page.locator("text=Content Quality").first().isVisible().catch(() => false)) {
      await page.locator("text=Content Quality").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "08-content-card.png") });

      const contentScoreEl = page.locator("text=Content Quality").first().locator("..").locator("span.font-mono");
      const contentScore = await contentScoreEl.textContent().catch(() => "N/A");
      const eeatVisible = await page.locator("text=E-E-A-T Signals").isVisible().catch(() => false);
      console.log(`  CONTENT CARD - Score: ${contentScore}, E-E-A-T visible: ${eeatVisible}`);

      for (const dim of ["Experience", "Expertise", "Authority", "Trust"]) {
        const dimEl = page.locator(`text=${dim}`).first();
        const dimVisible = await dimEl.isVisible().catch(() => false);
        const parent = dimEl.locator("..");
        const dimScore = await parent.locator("span.font-mono").textContent().catch(() => "N/A");
        console.log(`    ${dim}: visible=${dimVisible}, score=${dimScore}`);
      }

      const thinPagesVisible = await page.locator("text=Thin Pages").isVisible().catch(() => false);
      const recsVisible = await page.locator("text=Recommendations").first().isVisible().catch(() => false);
      console.log(`  Thin Pages: ${thinPagesVisible}, Recommendations: ${recsVisible}`);
    } else {
      console.log("  WARNING: Content Card NOT visible");
    }

    // Schema Card
    if (await page.locator("text=Schema Markup").first().isVisible().catch(() => false)) {
      await page.locator("text=Schema Markup").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "09-schema-card.png") });

      // Read the schema card score
      const schemaScoreEl = page.locator("text=Schema Markup").first().locator("..").locator("span.font-mono");
      const schemaScore = await schemaScoreEl.textContent().catch(() => "N/A");
      console.log(`  SCHEMA CARD - Score: ${schemaScore}`);
    } else {
      console.log("  WARNING: Schema Card NOT visible");
    }

    // GEO Card
    if (await page.locator("text=AI Visibility (GEO)").first().isVisible().catch(() => false)) {
      await page.locator("text=AI Visibility (GEO)").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "10-geo-card.png") });

      const geoScoreEl = page.locator("text=AI Visibility (GEO)").first().locator("..").locator("span.font-mono");
      const geoScore = await geoScoreEl.textContent().catch(() => "N/A");
      const citeVisible = await page.locator("text=CITE Framework").isVisible().catch(() => false);
      const engineVis = await page.locator("text=AI Engine Visibility").isVisible().catch(() => false);
      console.log(`  GEO CARD - Score: ${geoScore}, CITE: ${citeVisible}, Engines: ${engineVis}`);
    } else {
      console.log("  WARNING: GEO Card NOT visible");
    }

    // Strategist results
    if (await page.locator("text=Prioritized Actions").isVisible().catch(() => false)) {
      await page.locator("text=Prioritized Actions").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "11-strategist-actions.png") });
      console.log("  STRATEGIST ACTIONS - visible and captured.");
    }

    if (await page.locator("text=Content Briefs").isVisible().catch(() => false)) {
      await page.locator("text=Content Briefs").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "12-content-briefs.png") });
      console.log("  CONTENT BRIEFS - visible and captured.");
    }

    // ── 9. Logs tab - sitemap check ────────────────────────────────────────
    console.log("STEP 8: Checking Logs tab for sitemap-related entries");

    const logsTab = page.locator("button").filter({ hasText: "Logs" });
    if (await logsTab.isVisible().catch(() => false)) {
      await logsTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "13-logs-tab.png"), fullPage: true });

      const logEntries = await page.locator(".break-all").allTextContents().catch(() => []);
      console.log(`  Total log entries visible: ${logEntries.length}`);

      const sitemapLogs = logEntries.filter((entry) => entry.toLowerCase().includes("sitemap"));
      const robotsLogs = logEntries.filter((entry) => entry.toLowerCase().includes("robots"));

      console.log(`  Sitemap-related log entries: ${sitemapLogs.length}`);
      for (const log of sitemapLogs.slice(0, 10)) {
        console.log(`    SITEMAP: ${log.slice(0, 250)}`);
      }

      console.log(`  Robots.txt-related log entries: ${robotsLogs.length}`);
      for (const log of robotsLogs.slice(0, 5)) {
        console.log(`    ROBOTS: ${log.slice(0, 250)}`);
      }

      // Also dump all log entries for full context
      console.log(`  ALL LOG ENTRIES (first 50):`);
      for (const log of logEntries.slice(0, 50)) {
        console.log(`    > ${log.slice(0, 300)}`);
      }
    } else {
      console.log("  WARNING: Logs tab not visible");
    }

    // ── 10. Check for NaN, null, undefined in visible UI ───────────────────
    console.log("STEP 9: Checking for NaN, null, or empty data issues");

    const snapshotsTab = page.locator("button").filter({ hasText: "Snapshots" });
    if (await snapshotsTab.isVisible().catch(() => false)) {
      await snapshotsTab.click();
      await page.waitForTimeout(500);
    }

    const fullPageText = await page.locator("body").textContent().catch(() => "");

    const nanOccurrences = (fullPageText.match(/\bNaN\b/g) || []).length;
    // Only count "null" that appears as standalone text, not in URLs or code
    const nullInText = (fullPageText.match(/(?<![a-zA-Z])null(?![a-zA-Z])/g) || []).length;
    const undefinedInText = (fullPageText.match(/(?<![a-zA-Z])undefined(?![a-zA-Z])/g) || []).length;

    console.log(`  NaN in UI: ${nanOccurrences}`);
    console.log(`  null-like in UI: ${nullInText}`);
    console.log(`  undefined-like in UI: ${undefinedInText}`);

    // ── 11. Final comprehensive report ─────────────────────────────────────
    console.log("\n");
    console.log("================================================================");
    console.log("      E2E AUDIT REPORT: printerpix.co.uk");
    console.log("================================================================");

    console.log(`\n1. BROWSER CONSOLE ERRORS (${consoleErrors.length}):`);
    if (consoleErrors.length === 0) {
      console.log("   None detected.");
    } else {
      for (const err of consoleErrors.slice(0, 25)) {
        console.log(`   ${err.slice(0, 350)}`);
      }
      if (consoleErrors.length > 25) {
        console.log(`   ... and ${consoleErrors.length - 25} more`);
      }
    }

    console.log(`\n2. BROWSER CONSOLE WARNINGS (${consoleWarnings.length}):`);
    if (consoleWarnings.length === 0) {
      console.log("   None detected.");
    } else {
      for (const w of consoleWarnings.slice(0, 10)) {
        console.log(`   ${w.slice(0, 300)}`);
      }
    }

    console.log("\n3. VISUAL / DATA ISSUES:");
    console.log(`   NaN displayed: ${nanOccurrences}`);
    console.log(`   null displayed: ${nullInText}`);
    console.log(`   undefined displayed: ${undefinedInText}`);
    console.log(`   Audit completed within timeout: ${auditComplete}`);

    console.log("\n4. SCREENSHOTS SAVED:");
    console.log(`   Directory: ${SCREENSHOTS_DIR}`);

    console.log("\n================================================================\n");

    // Final full-page screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "14-final-complete.png"), fullPage: true });

    // ── Assertions ─────────────────────────────────────────────────────────
    expect(nanOccurrences, "NaN values found in UI").toBe(0);
  });
});
