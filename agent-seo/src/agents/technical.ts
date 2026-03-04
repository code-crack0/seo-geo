// src/agents/technical.ts
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import type { CrawlerResult, TechnicalResult } from "@/lib/types";
import { createPlaywrightTools } from "@/tools/playwright";
import { withRetry } from "@/lib/retry";
import { getPagesByAuditId } from "@/lib/db";
import { extractTechnicalSummary } from "@/lib/html-parser";
import { type Page } from "playwright";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/technical.md"), "utf-8");
const referenceData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/cwv-thresholds.json"), "utf-8"));

const TechnicalResultSchema = z.object({
  score: z.number().min(0).max(100).describe(
    "Overall technical SEO score (0-100). Weighted: Performance+CWV 30%, Indexability+Crawlability 25%, Mobile 15%, Security 15%, Meta+Redirects 15%"
  ),
  cwv: z.object({
    lcp: z.object({
      value: z.number().describe("Largest Contentful Paint in milliseconds"),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
    inp: z.object({
      value: z.number().describe("Interaction to Next Paint in milliseconds"),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
    cls: z.object({
      value: z.number().describe("Cumulative Layout Shift (unitless score)"),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
  }),
  issues: z.array(z.object({
    severity: z.enum(["critical", "warning", "info"]),
    category: z.enum(["performance", "indexability", "mobile", "security", "crawlability", "redirects", "meta", "speed"]),
    title: z.string(),
    description: z.string(),
    affectedPages: z.array(z.string()),
    recommendation: z.string(),
  })).describe("Technical SEO issues found, sorted by severity"),
  mobileResponsive: z.boolean(),
  httpsEnabled: z.boolean(),
  indexabilityIssues: z.array(z.string()).describe("Pages or patterns with indexability problems"),
});

export async function runTechnicalAgent(crawlerResult: CrawlerResult, auditId: string, dataStream: any, page: Page): Promise<TechnicalResult> {
  const tools = createPlaywrightTools(dataStream, page);

  // Parse structural data from stored HTML (fast, no network)
  const storedPages = await getPagesByAuditId(auditId);
  const technicalPages = storedPages.map(p => {
    try {
      return extractTechnicalSummary(p.html ?? "", p.url);
    } catch {
      return { url: p.url, title: "", metaDescription: "", metaRobots: "", canonical: "", headings: [], wordCount: 0, hasHttps: false, internalLinksCount: 0, externalLinksCount: 0 };
    }
  });

  const inputData = {
    businessType: crawlerResult.businessType,
    sitemapFound: crawlerResult.sitemapFound,
    robotsTxtFound: crawlerResult.robotsTxtFound,
    totalPages: crawlerResult.totalPages,
    brokenLinks: (crawlerResult.brokenLinks ?? []).slice(0, 20),
    redirectChains: (crawlerResult.redirectChains ?? []).slice(0, 15),
    pages: technicalPages,
  };

  // Step 1: Navigate homepage and collect live Core Web Vitals via Playwright
  let cwvData: unknown = null;
  try {
    const cwvResult = await withRetry(() =>
      generateText({
        model: defaultModel,
        system: "You are collecting Core Web Vitals data. Navigate to the homepage then call getPerformanceMetrics. Stop after getPerformanceMetrics returns.",
        prompt: `Navigate to https://${new URL(technicalPages[0]?.url ?? "https://example.com").origin} and get performance metrics.`,
        tools: {
          navigateTo: tools.navigateTo,
          getPerformanceMetrics: tools.getPerformanceMetrics,
        },
        maxTokens: 2000,
        maxSteps: 4,
      })
    );

    // Extract CWV from tool results
    for (const step of cwvResult.steps) {
      for (const tr of (step.toolResults ?? [])) {
        if ((tr as { toolName: string }).toolName === "getPerformanceMetrics") {
          cwvData = (tr as { result: unknown }).result;
        }
      }
    }
  } catch { /* CWV collection failed — proceed without live data */ }

  // Step 2: Synthesize everything into a structured TechnicalResult
  const { object } = await withRetry(() =>
    generateObject({
      model: defaultModel,
      schema: TechnicalResultSchema,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}

CWV Reference thresholds:
${JSON.stringify(referenceData, null, 2)}

TASK: Perform a technical SEO audit of this ${crawlerResult.businessType} website. Produce a TechnicalResult.

Structural data from all crawled pages:
${JSON.stringify(inputData, null, 2)}

Live Core Web Vitals from homepage (null = measurement failed):
${JSON.stringify(cwvData, null, 2)}

If live CWV is null, estimate ratings from page weight, resource counts and known patterns.
Score all 8 categories and compute the weighted overall score.
List every issue found with severity, affected pages, and actionable recommendations.`,
        },
      ],
      maxTokens: 16000,
    })
  );

  return object as TechnicalResult;
}
