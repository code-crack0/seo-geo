// tests/unit/utils.test.ts
import { describe, it, expect } from "vitest";
import { scoreToColor, scoreToLabel, formatDomain, ensureHttps, cn } from "@/lib/utils";

// ── scoreToColor ────────────────────────────────────────────────────────────
describe("scoreToColor", () => {
  it("returns score-critical for score < 30", () => {
    expect(scoreToColor(0)).toBe("var(--score-critical)");
    expect(scoreToColor(10)).toBe("var(--score-critical)");
    expect(scoreToColor(29)).toBe("var(--score-critical)");
  });

  it("returns score-poor for 30 ≤ score < 50", () => {
    expect(scoreToColor(30)).toBe("var(--score-poor)");
    expect(scoreToColor(40)).toBe("var(--score-poor)");
    expect(scoreToColor(49)).toBe("var(--score-poor)");
  });

  it("returns score-warning for 50 ≤ score < 70", () => {
    expect(scoreToColor(50)).toBe("var(--score-warning)");
    expect(scoreToColor(60)).toBe("var(--score-warning)");
    expect(scoreToColor(69)).toBe("var(--score-warning)");
  });

  it("returns score-good for 70 ≤ score < 90", () => {
    expect(scoreToColor(70)).toBe("var(--score-good)");
    expect(scoreToColor(80)).toBe("var(--score-good)");
    expect(scoreToColor(89)).toBe("var(--score-good)");
  });

  it("returns score-excellent for score ≥ 90", () => {
    expect(scoreToColor(90)).toBe("var(--score-excellent)");
    expect(scoreToColor(95)).toBe("var(--score-excellent)");
    expect(scoreToColor(100)).toBe("var(--score-excellent)");
  });

  it("handles boundary values exactly", () => {
    expect(scoreToColor(29)).toBe("var(--score-critical)");
    expect(scoreToColor(30)).toBe("var(--score-poor)");
    expect(scoreToColor(49)).toBe("var(--score-poor)");
    expect(scoreToColor(50)).toBe("var(--score-warning)");
    expect(scoreToColor(69)).toBe("var(--score-warning)");
    expect(scoreToColor(70)).toBe("var(--score-good)");
    expect(scoreToColor(89)).toBe("var(--score-good)");
    expect(scoreToColor(90)).toBe("var(--score-excellent)");
  });
});

// ── scoreToLabel ────────────────────────────────────────────────────────────
describe("scoreToLabel", () => {
  it("returns CRITICAL for score < 30", () => {
    expect(scoreToLabel(0)).toBe("CRITICAL");
    expect(scoreToLabel(29)).toBe("CRITICAL");
  });

  it("returns POOR for 30 ≤ score < 50", () => {
    expect(scoreToLabel(30)).toBe("POOR");
    expect(scoreToLabel(49)).toBe("POOR");
  });

  it("returns NEEDS WORK for 50 ≤ score < 70", () => {
    expect(scoreToLabel(50)).toBe("NEEDS WORK");
    expect(scoreToLabel(69)).toBe("NEEDS WORK");
  });

  it("returns GOOD for 70 ≤ score < 90", () => {
    expect(scoreToLabel(70)).toBe("GOOD");
    expect(scoreToLabel(89)).toBe("GOOD");
  });

  it("returns EXCELLENT for score ≥ 90", () => {
    expect(scoreToLabel(90)).toBe("EXCELLENT");
    expect(scoreToLabel(100)).toBe("EXCELLENT");
  });
});

// ── formatDomain ────────────────────────────────────────────────────────────
describe("formatDomain", () => {
  it("extracts hostname from a full URL", () => {
    expect(formatDomain("https://example.com/path?q=1")).toBe("example.com");
  });

  it("handles http:// URLs", () => {
    expect(formatDomain("http://example.com")).toBe("example.com");
  });

  it("handles bare domains (no protocol)", () => {
    expect(formatDomain("example.com")).toBe("example.com");
  });

  it("handles subdomains", () => {
    expect(formatDomain("https://blog.example.com")).toBe("blog.example.com");
  });

  it("strips trailing paths and query strings", () => {
    expect(formatDomain("https://example.com/page?foo=bar#section")).toBe("example.com");
  });

  it("returns original string when URL is unparseable", () => {
    expect(formatDomain("not a url at all ///")).toBe("not a url at all ///");
  });

  it("handles internationalized domains (returns punycode)", () => {
    // Node's URL API converts IDNs to punycode — this is correct behavior
    const result = formatDomain("https://münchen.de");
    // Either the original unicode or punycode form is acceptable
    expect(result === "münchen.de" || result === "xn--mnchen-3ya.de").toBe(true);
  });
});

// ── ensureHttps ─────────────────────────────────────────────────────────────
describe("ensureHttps", () => {
  it("returns unchanged HTTPS URLs", () => {
    expect(ensureHttps("https://example.com")).toBe("https://example.com");
  });

  it("upgrades http:// to https://", () => {
    expect(ensureHttps("http://example.com")).toBe("https://example.com");
  });

  it("prepends https:// to bare domains", () => {
    expect(ensureHttps("example.com")).toBe("https://example.com");
  });

  it("prepends https:// to subdomains", () => {
    expect(ensureHttps("blog.example.com")).toBe("https://blog.example.com");
  });

  it("handles domains with paths", () => {
    expect(ensureHttps("http://example.com/page")).toBe("https://example.com/page");
  });

  it("does not double-prefix already https URLs", () => {
    expect(ensureHttps("https://example.com")).not.toContain("https://https://");
  });

  it("handles empty string gracefully", () => {
    // Empty string gets https:// prepended since it doesn't start with either
    expect(ensureHttps("")).toBe("https://");
  });
});

// ── cn (className merger) ───────────────────────────────────────────────────
describe("cn", () => {
  it("merges multiple class strings", () => {
    const result = cn("px-4", "py-2");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    const result = cn("px-4", "px-8");
    expect(result).not.toContain("px-4");
    expect(result).toContain("px-8");
  });

  it("handles conditional classes", () => {
    const result = cn("base", true && "active", false && "inactive");
    expect(result).toContain("active");
    expect(result).not.toContain("inactive");
  });

  it("handles undefined and null gracefully", () => {
    const result = cn("base", undefined, null);
    expect(result).toBe("base");
  });

  it("handles arrays of classes", () => {
    const result = cn(["px-4", "py-2"], "font-bold");
    expect(result).toContain("px-4");
    expect(result).toContain("py-2");
    expect(result).toContain("font-bold");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});
