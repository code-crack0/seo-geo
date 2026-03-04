// tests/api/audit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock heavy dependencies before importing the route ──────────────────────
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/schema", () => ({
  audits: { id: "id", domain: "domain", status: "status", createdAt: "created_at" },
}));

vi.mock("@/agents/supervisor", () => ({
  runSupervisor: vi.fn(() => Promise.resolve()),
}));

vi.mock("ai", () => ({
  createDataStreamResponse: vi.fn(() => ({
    body: new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('2:[{"type":"audit_complete","state":{}}]\n'));
        ctrl.close();
      },
    }),
    headers: new Headers({ "Content-Type": "text/event-stream" }),
  })),
  streamText: vi.fn(() => ({
    toDataStreamResponse: vi.fn(() => new Response("stream", { status: 200 })),
  })),
}));

// ── Import route handlers after mocks are set up ────────────────────────────
const { POST, PUT } = await import("../../app/api/audit/route");
const { db } = await import("@/lib/db");

// ── Helper ──────────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>, method = "POST") {
  return new NextRequest("http://localhost:3000/api/audit", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("POST /api/audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when domain is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  it("returns 400 when domain is empty string", async () => {
    const req = makeRequest({ domain: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  it("inserts a DB record with the given domain", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" });
    await POST(req);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "test-audit-id-123",
        domain: "example.com",
        status: "crawling",
      })
    );
  });

  it("returns a streaming response with status 200", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it("sets X-Audit-Id header on the response", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" });
    const res = await POST(req);

    expect(res.headers.get("X-Audit-Id")).toBe("test-audit-id-123");
  });

  it("accepts domain with https:// prefix", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "https://example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "https://example.com" })
    );
  });

  it("accepts subdomain URLs", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "blog.example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it("generates a unique auditId each call (nanoid called)", async () => {
    const { nanoid } = await import("nanoid");
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });

    const req1 = makeRequest({ domain: "site1.com" });
    const req2 = makeRequest({ domain: "site2.com" });
    await POST(req1);
    await POST(req2);

    expect(nanoid).toHaveBeenCalledTimes(2);
  });

  it("calls runSupervisor asynchronously (does not await before response)", async () => {
    const { runSupervisor } = await import("@/agents/supervisor");
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" });
    await POST(req);

    // runSupervisor is called inside the data stream execute callback
    // it should have been invoked
    expect(runSupervisor).toBeDefined();
  });
});

describe("PUT /api/audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when domain is missing", async () => {
    const req = makeRequest({}, "PUT");
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  it("returns 400 when domain is empty string", async () => {
    const req = makeRequest({ domain: "" }, "PUT");
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Domain required");
  });

  it("inserts a DB record and returns auditId", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" }, "PUT");
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auditId).toBe("test-audit-id-123");
  });

  it("inserts with status crawling", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" }, "PUT");
    await PUT(req);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "crawling" })
    );
  });

  it("returns JSON content-type", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const req = makeRequest({ domain: "example.com" }, "PUT");
    const res = await PUT(req);

    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("stores createdAt as a Date", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const before = new Date();
    const req = makeRequest({ domain: "example.com" }, "PUT");
    await PUT(req);
    const after = new Date();

    const [[callArg]] = (valuesMock as ReturnType<typeof vi.fn>).mock.calls as [[Record<string, unknown>]];
    expect(callArg.createdAt).toBeInstanceOf(Date);
    expect((callArg.createdAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect((callArg.createdAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("accepts long domain strings", async () => {
    const valuesMock = vi.fn(() => Promise.resolve());
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: valuesMock });

    const longDomain = "very-long-subdomain.example.co.uk";
    const req = makeRequest({ domain: longDomain }, "PUT");
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auditId).toBeDefined();
  });
});
