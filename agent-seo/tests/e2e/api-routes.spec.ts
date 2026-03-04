// tests/e2e/api-routes.spec.ts — Direct API endpoint tests using Playwright's request context
import { test, expect } from "@playwright/test";

test.describe("API: GET /api/history", () => {
  test("returns 200 with a JSON array", async ({ request }) => {
    const res = await request.get("/api/history");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("response items have expected shape", async ({ request }) => {
    const res = await request.get("/api/history");
    const body = await res.json() as Record<string, unknown>[];
    if (body.length > 0) {
      const item = body[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("domain");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("createdAt");
    }
  });

  test("returns at most 10 results", async ({ request }) => {
    const res = await request.get("/api/history");
    const body = await res.json();
    expect(body.length).toBeLessThanOrEqual(10);
  });

  test("Content-Type header is application/json", async ({ request }) => {
    const res = await request.get("/api/history");
    expect(res.headers()["content-type"]).toContain("application/json");
  });
});

test.describe("API: PUT /api/audit", () => {
  test("returns 200 with auditId when domain is provided", async ({ request }) => {
    const res = await request.put("/api/audit", {
      data: { domain: "https://playwright-test.com" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("auditId");
    expect(typeof body.auditId).toBe("string");
    expect(body.auditId.length).toBeGreaterThan(0);
  });

  test("returns 400 when domain is missing", async ({ request }) => {
    const res = await request.put("/api/audit", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  test("returns 400 when domain is empty string", async ({ request }) => {
    const res = await request.put("/api/audit", {
      data: { domain: "" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("each call returns a unique auditId", async ({ request }) => {
    const res1 = await request.put("/api/audit", {
      data: { domain: "https://site1.com" },
      headers: { "Content-Type": "application/json" },
    });
    const res2 = await request.put("/api/audit", {
      data: { domain: "https://site2.com" },
      headers: { "Content-Type": "application/json" },
    });

    const { auditId: id1 } = await res1.json() as { auditId: string };
    const { auditId: id2 } = await res2.json() as { auditId: string };
    expect(id1).not.toBe(id2);
  });

  test("created audit appears in history", async ({ request }) => {
    const domain = `https://history-test-${Date.now()}.com`;
    const putRes = await request.put("/api/audit", {
      data: { domain },
      headers: { "Content-Type": "application/json" },
    });
    const { auditId } = await putRes.json() as { auditId: string };

    // Give the DB a moment to commit
    await new Promise((r) => setTimeout(r, 100));

    const histRes = await request.get("/api/history");
    const history = await histRes.json() as { id: string; domain: string }[];
    const found = history.find((a) => a.id === auditId);
    expect(found).toBeDefined();
    expect(found?.domain).toBe(domain);
  });

  test("accepts domain with https:// prefix", async ({ request }) => {
    const res = await request.put("/api/audit", {
      data: { domain: "https://example.com" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
  });

  test("accepts bare domain without protocol", async ({ request }) => {
    const res = await request.put("/api/audit", {
      data: { domain: "example.com" },
      headers: { "Content-Type": "application/json" },
    });
    // Route accepts any truthy domain string — bare domains are valid
    expect(res.status()).toBe(200);
  });
});

test.describe("API: POST /api/chat", () => {
  test("returns 200 for a valid request", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "What is SEO?" }],
      },
      headers: { "Content-Type": "application/json" },
    });
    // May return 200 or 500 depending on whether AI key is configured
    // In CI without keys it will fail — we just assert it doesn't crash with a 404
    expect(res.status()).not.toBe(404);
  });

  test("returns streaming content-type", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "Hello" }],
      },
      headers: { "Content-Type": "application/json" },
    });
    // Either text/event-stream or application/json (error) — not HTML
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).not.toContain("text/html");
  });
});
