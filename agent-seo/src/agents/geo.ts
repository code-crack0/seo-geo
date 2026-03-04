// src/agents/geo.ts
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import type { BusinessType, GEOResult } from "@/lib/types";
import { createPlaywrightTools } from "@/tools/playwright";
import { withRetry } from "@/lib/retry";
import { type Page } from "playwright";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/geo.md"), "utf-8");
const referenceData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/geo-checklist.json"), "utf-8"));

const GEOResultSchema = z.object({
  aiVisibilityScore: z.number().min(0).max(100).describe(
    "Overall AI visibility score (0-100). 0-20 = invisible, 21-40 = barely visible, 41-60 = emerging, 61-80 = visible, 81-100 = authority"
  ),
  mentions: z.array(z.object({
    engine: z.enum(["google_ai", "perplexity", "chatgpt", "you_com"]),
    query: z.string(),
    mentioned: z.boolean(),
    sentiment: z.enum(["positive", "neutral", "negative", "not_found"]),
    position: z.enum(["primary", "secondary", "passing", "not_mentioned"]),
    citedSources: z.array(z.string()).describe("URLs or source names cited in the AI response"),
  })).describe("One entry per query per engine — all searches performed"),
  citationGaps: z.array(z.object({
    topic: z.string().describe("Topic or query where the brand was not cited"),
    competitorsCited: z.array(z.string()).describe("Competitor domains/brands that were cited instead"),
    yourContentExists: z.boolean().describe("Whether the site has content covering this topic"),
    opportunity: z.string().describe("Specific action to improve citation for this topic"),
  })).describe("Topics where competitors are cited but this brand is not"),
  citeScore: z.object({
    clarity: z.number().min(0).max(100).describe("Clarity: direct answers, definitions, concise key claims"),
    intent: z.number().min(0).max(100).describe("Intent: content matches informational query patterns, FAQ sections"),
    trust: z.number().min(0).max(100).describe("Trust: authoritative sources, author expertise, schema markup, recent dates"),
    evidence: z.number().min(0).max(100).describe("Evidence: statistics, original data, expert quotes, case studies"),
  }),
  recommendations: z.array(z.string()).min(3).describe("Top 5 specific, prioritised GEO recommendations"),
});

export async function runGEOAgent(domain: string, businessType: BusinessType, dataStream: any, page: Page): Promise<GEOResult> {
  const tools = createPlaywrightTools(dataStream, page);

  // Step 1: Run AI engine searches with Playwright tools
  const searchResult = await withRetry(() =>
    generateText({
      model: defaultModel,
      system: `You are collecting AI engine visibility data for the domain "${domain}".
Run searches in this exact order:
1. searchPerplexity — 3 queries about this domain/brand
2. searchGoogle — 2 queries to check for AI Overviews
3. searchYouCom — 2 queries to check You.com AI responses
After all 7 searches complete, stop. Do not output JSON here.`,
      prompt: `Domain: ${domain}, Business type: ${businessType}
Run the 7 AI engine searches now.`,
      tools: {
        searchPerplexity: tools.searchPerplexity,
        searchGoogle: tools.searchGoogle,
        searchYouCom: tools.searchYouCom,
      },
      maxTokens: 8000,
      maxSteps: 15,
    })
  );

  // Collect all search results from tool calls
  const searchData: { tool: string; query: string; mentioned: boolean; responseText: string; url: string }[] = [];
  for (const step of searchResult.steps) {
    for (const tr of (step.toolResults ?? [])) {
      const r = tr as { toolName: string; result: Record<string, unknown> };
      searchData.push({
        tool: r.toolName,
        query: String(r.result.query ?? ""),
        mentioned: Boolean(r.result.mentioned),
        responseText: String(r.result.responseText ?? "").slice(0, 1500),
        url: String(r.result.url ?? ""),
      });
    }
  }

  // Step 2: Synthesise search results into structured GEOResult
  const { object } = await withRetry(() =>
    generateObject({
      model: defaultModel,
      schema: GEOResultSchema,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}

Reference checklist:
${JSON.stringify(referenceData, null, 2)}

TASK: Analyse the AI engine search results below for domain "${domain}" (${businessType}) and produce a GEOResult.

Search results collected (${searchData.length} total):
${JSON.stringify(searchData, null, 2)}

Engine mapping:
- tool "searchPerplexity" → engine: "perplexity"
- tool "searchGoogle" → engine: "google_ai"
- tool "searchYouCom" → engine: "you_com"

Instructions:
- Create one "mentions" entry per search result, using the exact query text
- Set mentioned=true only if the domain appears in responseText
- Identify citation gaps: queries where competitors were cited but not this domain
- Score the CITE framework based on what you know about AI-optimised content for this business type
- Compute aiVisibilityScore as weighted average of mention rate × sentiment quality across all engines`,
        },
      ],
      maxTokens: 16000,
    })
  );

  return object as GEOResult;
}
