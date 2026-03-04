// tests/e2e/landing-page.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays the AgentSEO logo", async ({ page }) => {
    await expect(page.getByText("AgentSEO")).toBeVisible();
  });

  test("displays the main headline", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /see how ai sees your website/i })).toBeVisible();
  });

  test("displays the subtitle description", async ({ page }) => {
    await expect(page.getByText(/multi-agent seo/i)).toBeVisible();
  });

  test("shows all feature pills", async ({ page }) => {
    // Use exact match to avoid matching partial text in the description
    await expect(page.getByText("Technical SEO", { exact: true })).toBeVisible();
    await expect(page.getByText("E-E-A-T Analysis", { exact: true })).toBeVisible();
    await expect(page.getByText("Schema Validation", { exact: true })).toBeVisible();
    await expect(page.getByText("AI Visibility (GEO)", { exact: true })).toBeVisible();
  });

  test("shows the agent pipeline", async ({ page }) => {
    // Use exact: true to avoid matching partial text in subtitle or pills
    await expect(page.getByText("Crawler", { exact: true })).toBeVisible();
    await expect(page.getByText("Technical", { exact: true })).toBeVisible();
    await expect(page.getByText("Content", { exact: true })).toBeVisible();
    await expect(page.getByText("Schema", { exact: true })).toBeVisible();
    await expect(page.getByText("GEO", { exact: true })).toBeVisible();
    await expect(page.getByText("Strategist", { exact: true })).toBeVisible();
  });

  test("renders the audit input form", async ({ page }) => {
    const input = page.getByPlaceholder(/enter your domain/i);
    await expect(input).toBeVisible();
  });

  test("audit input shows submit button", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /audit|analyze|start/i });
    await expect(submitBtn).toBeVisible();
  });

  test("shows footer", async ({ page }) => {
    await expect(page.getByText(/vercel ai sdk/i)).toBeVisible();
  });

  test("page title is set", async ({ page }) => {
    // Should have a non-empty title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("shows Recent Audits section (even if empty)", async ({ page }) => {
    // Section exists regardless of data
    const recentSection = page.getByText(/recent audits/i);
    await expect(recentSection).toBeVisible();
  });

  test("empty state message shown when no audits exist", async ({ page }) => {
    // Either shows audits OR the no-audits message
    const emptyState = page.getByText(/no audits yet/i);
    const auditRows = page.locator("a[href*='/audit/']");
    const count = await auditRows.count();
    if (count === 0) {
      await expect(emptyState).toBeVisible();
    }
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Filter out known dev-mode transient warnings (favicon 404s, Next.js HMR
    // reconnect messages, React hydration warnings from Fast Refresh full-reloads)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("hasn't mounted yet") &&
        !e.includes("Fast Refresh") &&
        !e.includes("[HMR]")
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe("Audit Form Submission", () => {
  test("entering a domain and submitting redirects to audit page", async ({ page }) => {
    // Set up route interception before navigation to ensure no race condition
    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ auditId: "test-e2e-audit-id" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");

    const input = page.getByPlaceholder(/enter your domain/i);
    await input.fill("example.com");

    const submitBtn = page.getByRole("button", { name: /audit|analyze|start/i });
    await submitBtn.click();

    // Should navigate to /audit/test-e2e-audit-id?domain=https://example.com
    await expect(page).toHaveURL(/\/audit\/test-e2e-audit-id/, { timeout: 10000 });
  });

  test("submit button shows loading state during submission", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder(/enter your domain/i);
    await input.fill("example.com");

    // Delay the response to observe loading state
    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "PUT") {
        await new Promise((r) => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ auditId: "loading-test-id" }),
        });
      } else {
        await route.continue();
      }
    });

    const submitBtn = page.getByRole("button", { name: /audit|analyze|start/i });
    await submitBtn.click();

    // Button should be disabled during loading
    await expect(submitBtn).toBeDisabled({ timeout: 300 });
  });

  test("empty domain shows validation error or does nothing", async ({ page }) => {
    await page.goto("/");
    // Button should be disabled when input is empty
    const submitBtn = page.getByRole("button", { name: /audit|analyze|start/i });
    await expect(submitBtn).toBeDisabled();
    // Should remain on landing page
    await expect(page).toHaveURL("/");
  });

  test("prepends https:// to bare domain before submission", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder(/enter your domain/i);
    await input.fill("example.com");

    let capturedBody = "";
    await page.route("**/api/audit", async (route) => {
      capturedBody = route.request().postData() ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ auditId: "https-test-id" }),
      });
    });

    await page.getByRole("button", { name: /audit|analyze|start/i }).click();
    await page.waitForURL(/\/audit\//);

    const body = JSON.parse(capturedBody);
    expect(body.domain).toBe("https://example.com");
  });
});
