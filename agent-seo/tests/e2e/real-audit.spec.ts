// tests/e2e/real-audit.spec.ts
// Tests the POST /api/audit pipeline with a real domain (no mocking).
// Requires a valid GEMINI_API_KEY in .env.local for AI agents to succeed.
import { test, expect } from "@playwright/test";

const TEST_DOMAIN = "https://example.com";
const STREAM_TIMEOUT = 90_000; // 90s for real network + AI calls

test.describe("Real Audit POST /api/audit (no mock)", () => {
  test("streams at least one event from the pipeline", async ({ page }) => {
    test.setTimeout(120_000);

    // Navigate to root to establish a page context (needed for fetch streaming)
    await page.goto("/");

    // Use the browser's Fetch Streaming API to read chunks incrementally.
    // We cancel the reader as soon as we get the first event — no need to
    // wait for the full pipeline to complete (which can take 2+ minutes).
    const result = await page.evaluate(async (domain) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45_000);

      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
          signal: controller.signal,
        });

        const status = res.status;
        const auditId = res.headers.get("x-audit-id");

        if (!res.body) {
          clearTimeout(timeoutId);
          return { status, auditId, events: [], error: "no body" };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const events: Record<string, unknown>[] = [];

        // Read chunks until we get at least one parsed event
        while (events.length === 0) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n").filter((l) => l.startsWith("2:"))) {
            try {
              const arr = JSON.parse(line.slice(2));
              if (Array.isArray(arr)) events.push(...(arr as Record<string, unknown>[]));
            } catch { /* partial line */ }
          }
        }

        // Abort the controller to close the connection server-side (stops the pipeline)
        reader.cancel();
        controller.abort();
        clearTimeout(timeoutId);
        return { status, auditId, events };
      } catch (e) {
        clearTimeout(timeoutId);
        return { status: 0, auditId: null, events: [], error: String(e) };
      }
    }, TEST_DOMAIN);

    console.log("  status:", result.status, "auditId:", result.auditId);
    console.log(`  received ${result.events.length} event(s):`);
    for (const ev of result.events) {
      console.log("   ", JSON.stringify(ev).slice(0, 120));
    }
    if ((result as { error?: string }).error) {
      console.log("  error:", (result as { error?: string }).error);
    }

    expect(result.status).toBe(200);
    expect(result.auditId).toBeTruthy();
    expect(result.events.length).toBeGreaterThan(0);

    const agentEvents = result.events.filter((e) => (e as { type?: string }).type === "agent_status");
    expect(agentEvents.length).toBeGreaterThan(0);
  });

  test("audit page renders streaming data for real domain", async ({ page }) => {
    // First PUT to get an auditId without starting the stream
    const putRes = await page.request.put("/api/audit", {
      data: { domain: TEST_DOMAIN },
      headers: { "Content-Type": "application/json" },
    });
    const { auditId } = await putRes.json() as { auditId: string };
    console.log("  auditId from PUT:", auditId);

    // Navigate to the audit dashboard (this will POST and start the real stream)
    await page.goto(`/audit/${auditId}?domain=${encodeURIComponent(TEST_DOMAIN)}`);

    // Page should load and show the domain
    await expect(page.getByText("example.com")).toBeVisible({ timeout: 10000 });

    // The crawler agent_status event should appear in the timeline
    await expect(page.getByText("Crawler")).toBeVisible({ timeout: 15000 });

    // Take a screenshot of the live dashboard state
    await page.screenshot({ path: "tests/e2e/report/real-audit-screenshot.png", fullPage: true });
    console.log("  screenshot saved to tests/e2e/report/real-audit-screenshot.png");
  });

  test("POST returns 400 for truly empty domain", async ({ request }) => {
    const res = await request.post("/api/audit", {
      data: { domain: "" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  test("POST returns 400 when body is missing domain key", async ({ request }) => {
    const res = await request.post("/api/audit", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});
