// tests/api/chat.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fixtures ────────────────────────────────────────────────────────────────
const MOCK_AUDIT = {
  id: "audit-123",
  domain: "example.com",
  status: "completed",
  results: JSON.stringify({ technical: { score: 85 }, strategy: { overallScore: 78 } }),
};

// ── Mocks ────────────────────────────────────────────────────────────────────
const whereMock = vi.fn(() => Promise.resolve([MOCK_AUDIT]));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/db", () => ({
  db: { select: selectMock },
  getPageByUrl: vi.fn(() => null),
}));

vi.mock("@/lib/schema", () => ({
  audits: { id: "id", results: "results" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ _eq: [col, val] })),
  desc: vi.fn((col) => ({ _desc: col })),
}));

const streamTextMock = vi.fn(() => ({
  toDataStreamResponse: vi.fn(
    () => new Response('2:[{"type":"text","text":"Here is your analysis"}]\n', { status: 200 })
  ),
}));

vi.mock("ai", () => ({
  streamText: streamTextMock,
  createDataStreamResponse: vi.fn(),
  tool: vi.fn((t) => t),
}));

vi.mock("@/lib/embeddings", () => ({
  searchChunks: vi.fn().mockResolvedValue([
    { chunkType: "overview", content: "Domain: example.com | Overall score: 75", metadata: {}, score: 0.9 },
    { chunkType: "technical_issues", content: "Critical issues: missing meta tags", metadata: {}, score: 0.8 },
  ]),
}));

vi.mock("@/lib/ai", () => ({
  defaultModel: { modelId: "claude-sonnet-4-6" },
}));

// ── Import route after mocks ─────────────────────────────────────────────
const { POST } = await import("../../app/api/chat/route");

// ── Helper ──────────────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("POST /api/chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a streaming response", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "What are my SEO issues?" }],
      auditId: "audit-123",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("calls streamText with the user messages", async () => {
    const messages = [{ role: "user", content: "Explain my GEO score" }];
    const req = makeRequest({ messages, auditId: "audit-123" });
    await POST(req);

    expect(streamTextMock).toHaveBeenCalledOnce();
    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    expect(callArgs.messages).toEqual(messages);
  });

  it("uses the defaultModel", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "Hello" }],
    });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    expect(callArgs.model).toEqual({ modelId: "claude-sonnet-4-6" });
  });

  it("fetches audit context from DB when auditId is provided", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "Analyse my results" }],
      auditId: "audit-123",
    });
    await POST(req);

    expect(selectMock).toHaveBeenCalledOnce();
    expect(whereMock).toHaveBeenCalledOnce();
  });

  it("includes audit results in system prompt when audit found", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "Analyse" }],
      auditId: "audit-123",
    });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    const systemPrompt = callArgs.system as string;
    expect(systemPrompt).toContain("AUDIT OVERVIEW:");
    expect(systemPrompt).toContain("RELEVANT AUDIT DATA:");
  });

  it("works without auditId (generic chat mode)", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "What is SEO?" }],
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    // DB should not be queried without auditId
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("does not include audit context in system prompt when no auditId", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "What is GEO?" }],
    });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    const systemPrompt = callArgs.system as string;
    expect(systemPrompt).not.toContain("AUDIT OVERVIEW:");
  });

  it("does not include audit context when audit not found in DB", async () => {
    whereMock.mockResolvedValueOnce([]); // Empty result — audit not found

    const req = makeRequest({
      messages: [{ role: "user", content: "Help" }],
      auditId: "nonexistent-id",
    });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    const systemPrompt = callArgs.system as string;
    expect(systemPrompt).not.toContain("AUDIT OVERVIEW:");
  });

  it("handles multi-turn conversation messages", async () => {
    const messages = [
      { role: "user", content: "What is my score?" },
      { role: "assistant", content: "Your score is 78." },
      { role: "user", content: "How can I improve it?" },
    ];
    const req = makeRequest({ messages, auditId: "audit-123" });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    expect(callArgs.messages).toHaveLength(3);
  });

  it("includes SEO & GEO expert context in system prompt", async () => {
    const req = makeRequest({
      messages: [{ role: "user", content: "Help" }],
    });
    await POST(req);

    const callArgs = (streamTextMock.mock.calls as unknown as unknown[][])[0]![0] as Record<string, unknown>;
    const systemPrompt = callArgs.system as string;
    expect(systemPrompt).toContain("SEO");
    expect(systemPrompt).toContain("GEO");
  });
});
