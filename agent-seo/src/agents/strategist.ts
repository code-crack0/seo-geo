// src/agents/strategist.ts
import { generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import type {
  BusinessType,
  CrawlerResult,
  TechnicalResult,
  ContentResult,
  SchemaResult,
  GEOResult,
  StrategyResult,
} from "@/lib/types";
import { trimForStrategist } from "@/lib/trim-input";
import { withRetry } from "@/lib/retry";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/strategist.md"), "utf-8");
const qualityGates = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/quality-gates.json"), "utf-8"));
const industryTemplates = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/industry-templates.json"), "utf-8"));

const StrategyResultSchema = z.object({
  overallScore: z.number().min(0).max(100).describe("Weighted overall SEO+GEO score"),
  categoryScores: z.object({
    technical: z.number().min(0).max(100),
    content: z.number().min(0).max(100),
    schema: z.number().min(0).max(100),
    geo: z.number().min(0).max(100),
  }),
  prioritizedActions: z.array(z.object({
    rank: z.number().int().min(1),
    category: z.enum(["technical", "content", "schema", "geo"]),
    action: z.string().describe("Short imperative action title"),
    impact: z.enum(["high", "medium", "low"]),
    effort: z.enum(["high", "medium", "low"]),
    details: z.string().describe("Why this matters and how to implement it"),
  })).min(5).max(15),
  contentBriefs: z.array(z.object({
    title: z.string(),
    targetKeyword: z.string(),
    geoOptimized: z.boolean(),
    rationale: z.string(),
    outline: z.array(z.string()).min(3),
    estimatedImpact: z.string(),
  })).min(3).max(6),
  quickWins: z.array(z.string()).min(3).max(8).describe("Actions completable in under 1 hour"),
});

interface StrategistInput {
  crawler: CrawlerResult;
  technical?: TechnicalResult;
  content?: ContentResult;
  schema?: SchemaResult;
  geo?: GEOResult;
  businessType: BusinessType;
}

export async function runStrategistAgent(input: StrategistInput): Promise<StrategyResult> {
  const { object } = await withRetry(() =>
    generateObject({
      model: defaultModel,
      schema: StrategyResultSchema,
      messages: [{
        role: "user",
        content: `${systemPrompt}

Quality Gates:
${JSON.stringify(qualityGates, null, 2)}

Industry Templates:
${JSON.stringify(industryTemplates, null, 2)}

Synthesize the following audit results into a final strategy report:

${JSON.stringify(trimForStrategist(input as unknown as Parameters<typeof trimForStrategist>[0]))}`,
      }],
      maxTokens: 16000,
    })
  );

  return object as StrategyResult;
}
