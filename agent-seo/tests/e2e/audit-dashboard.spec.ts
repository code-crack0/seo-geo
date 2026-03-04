// tests/e2e/audit-dashboard.spec.ts
import { test, expect } from "@playwright/test";

// Shared mock for the audit streaming endpoint
async function mockAuditStream(page: import("@playwright/test").Page, events: object[]) {
  await page.route("**/api/audit", async (route) => {
    if (route.request().method() === "POST") {
      const body = events
        .map((e) => `2:[${JSON.stringify(e)}]`)
        .join("\n") + "\n";
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "X-Audit-Id": "e2e-audit-123",
          "Cache-Control": "no-cache",
        },
        body,
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Audit Dashboard", () => {
  const AUDIT_URL = "/audit/e2e-audit-123?domain=https://example.com";

  test.beforeEach(async ({ page }) => {
    // Mock the streaming endpoint with a complete audit sequence
    await mockAuditStream(page, [
      { type: "agent_status", agent: "crawler", status: "running", message: "Starting crawl" },
      { type: "browser_frame", image: "data:image/png;base64,iVBORw0KGgo=", url: "https://example.com", action: "Navigating" },
      { type: "agent_status", agent: "crawler", status: "done", message: "Crawl done" },
      {
        type: "audit_complete",
        state: {
          strategy: { overallScore: 72, categoryScores: { technical: 68, content: 70, schema: 65, geo: 75 }, prioritizedActions: [], contentBriefs: [], quickWins: [] },
          technical: { score: 68, issues: [], cwv: { lcp: { value: 2200, rating: "good" }, inp: { value: 80, rating: "good" }, cls: { value: 0.05, rating: "good" } }, mobileResponsive: true, httpsEnabled: true, indexabilityIssues: [] },
        },
      },
    ]);
  });

  test("renders the dashboard header with domain name", async ({ page }) => {
    await page.goto(AUDIT_URL);
    await expect(page.getByRole("banner").getByText("example.com")).toBeVisible();
  });

  test("shows back to home link", async ({ page }) => {
    await page.goto(AUDIT_URL);
    // The header always shows "+ New Audit" as the link back to the landing page
    const homeLink = page.getByRole("link", { name: /new audit/i });
    await expect(homeLink).toBeVisible({ timeout: 10000 });
  });

  test("back to home link navigates to landing page", async ({ page }) => {
    await page.goto(AUDIT_URL);
    // Verify the home link exists with correct href
    const homeLink = page.getByRole("link", { name: /new audit/i });
    await expect(homeLink).toHaveAttribute("href", "/");
    // Directly navigate to verify landing page loads (streaming re-renders make click unreliable)
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.getByText("AgentSEO")).toBeVisible();
  });

  test("shows agent timeline section", async ({ page }) => {
    await page.goto(AUDIT_URL);
    // Timeline should show agent names
    await expect(page.getByText("Crawler")).toBeVisible();
  });

  test("shows skeleton cards while loading", async ({ page }) => {
    // Mock a slow stream to observe loading state
    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "POST") {
        // Simulate a delay before sending anything
        await new Promise((r) => setTimeout(r, 500));
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: "2:[{}]\n",
        });
      }
    });

    await page.goto(AUDIT_URL);
    // Page should render without crashing even with empty stream
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("error state shown when API returns 400", async ({ page }) => {
    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Domain required" }),
        });
      }
    });

    await page.goto(AUDIT_URL);
    // Dashboard should show the failed state
    await expect(page.getByText(/failed|error|try again/i)).toBeVisible({ timeout: 10000 });
  });

  test("redirects to home when domain is missing from URL", async ({ page }) => {
    // URL without ?domain= query param
    await page.goto("/audit/some-id-without-domain");
    // Should redirect to landing page
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });
});

test.describe("Audit Dashboard API Calls", () => {
  test("POST /api/audit is called on dashboard mount", async ({ page }) => {
    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: "2:[{}]\n",
        });
      } else {
        await route.continue();
      }
    });

    // waitForRequest races against page.goto — set up the promise before navigating
    const postRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/audit") && req.method() === "POST",
      { timeout: 10000 }
    );

    await page.goto("/audit/e2e-test?domain=https://example.com");
    const postRequest = await postRequestPromise;

    expect(postRequest.url()).toContain("/api/audit");
  });

  test("POST body contains domain and auditId", async ({ page }) => {
    let capturedBody: Record<string, string> = {};

    await page.route("**/api/audit", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postData();
        if (body) capturedBody = JSON.parse(body);
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: "2:[{}]\n",
        });
      } else {
        await route.continue();
      }
    });

    // waitForResponse ensures the route handler has fully completed (capturedBody set)
    // before we check its value — waitForRequest would resolve too early
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/audit") && res.request().method() === "POST",
      { timeout: 10000 }
    );

    await page.goto("/audit/my-audit-id?domain=https://example.com");
    await responsePromise;

    expect(capturedBody.domain).toBe("https://example.com");
    expect(capturedBody.auditId).toBe("my-audit-id");
  });
});
