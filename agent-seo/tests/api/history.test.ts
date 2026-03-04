// tests/api/history.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fixtures ────────────────────────────────────────────────────────────────
const MOCK_AUDITS = [
  {
    id: "audit-1",
    domain: "example.com",
    status: "completed",
    overallScore: 82,
    businessType: "SaaS",
    createdAt: new Date("2026-03-01T10:00:00Z"),
  },
  {
    id: "audit-2",
    domain: "test.io",
    status: "failed",
    overallScore: null,
    businessType: null,
    createdAt: new Date("2026-03-01T09:00:00Z"),
  },
  {
    id: "audit-3",
    domain: "shop.example.com",
    status: "completed",
    overallScore: 65,
    businessType: "E-commerce",
    createdAt: new Date("2026-03-01T08:00:00Z"),
  },
];

// ── Mock DB ────────────────────────────────────────────────────────────────
const limitMock = vi.fn(() => Promise.resolve(MOCK_AUDITS));
const orderByMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ orderBy: orderByMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/db", () => ({
  db: { select: selectMock },
}));

vi.mock("@/lib/schema", () => ({
  audits: {
    id: "id",
    domain: "domain",
    status: "status",
    overallScore: "overall_score",
    businessType: "business_type",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => ({ _desc: col })),
  eq: vi.fn((col, val) => ({ _eq: [col, val] })),
}));

// ── Import route after mocks ─────────────────────────────────────────────
const { GET } = await import("../../app/api/history/route");

// ── Tests ──────────────────────────────────────────────────────────────────
describe("GET /api/history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with a JSON array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns the audits from the DB", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(body[0].id).toBe("audit-1");
    expect(body[0].domain).toBe("example.com");
    expect(body[0].status).toBe("completed");
    expect(body[0].overallScore).toBe(82);
    expect(body[0].businessType).toBe("SaaS");
  });

  it("applies limit of 10", async () => {
    await GET();
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("orders by createdAt descending", async () => {
    const { desc } = await import("drizzle-orm");
    await GET();
    expect(orderByMock).toHaveBeenCalledOnce();
    expect(desc).toHaveBeenCalledOnce();
  });

  it("selects only required columns (no results blob)", async () => {
    await GET();
    // select() is called with a column projection object
    const [[projection]] = selectMock.mock.calls as [[Record<string, unknown>]];
    expect(projection).toHaveProperty("id");
    expect(projection).toHaveProperty("domain");
    expect(projection).toHaveProperty("status");
    expect(projection).toHaveProperty("overallScore");
    expect(projection).toHaveProperty("businessType");
    expect(projection).toHaveProperty("createdAt");
    // The heavy 'results' JSON blob should NOT be in the projection
    expect(projection).not.toHaveProperty("results");
  });

  it("returns empty array when no audits exist", async () => {
    limitMock.mockResolvedValueOnce([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("handles audits with null overallScore", async () => {
    const res = await GET();
    const body = await res.json();
    const failedAudit = body.find((a: { id: string }) => a.id === "audit-2");
    expect(failedAudit.overallScore).toBeNull();
  });

  it("handles audits with null businessType", async () => {
    const res = await GET();
    const body = await res.json();
    const audit = body.find((a: { id: string }) => a.id === "audit-2");
    expect(audit.businessType).toBeNull();
  });

  it("calls db.select exactly once per request", async () => {
    await GET();
    expect(selectMock).toHaveBeenCalledOnce();
  });
});
