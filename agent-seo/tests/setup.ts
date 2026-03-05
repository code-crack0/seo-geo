// tests/setup.ts
// Vitest global setup

// Mock environment variables
process.env.GEMINI_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";
// NODE_ENV is read-only in TypeScript strict mode; it's already "test" in Vitest

// Mock better-sqlite3 so tests don't need a real DB file
import { vi } from "vitest";

vi.mock("better-sqlite3", () => {
  const mockDb = {
    pragma: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
    exec: vi.fn(),
    close: vi.fn(),
  };
  return { default: vi.fn(() => mockDb) };
});

// Mock nanoid to return predictable IDs in tests
vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-audit-id-123"),
}));
