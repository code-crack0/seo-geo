// src/agents/strategist.ts
import { generateText } from "ai";
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
import { extractJsonFromResult } from "@/lib/parse-agent-result";
import { trimForStrategist } from "@/lib/trim-input";
import { withRetry } from "@/lib/retry";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/strategist.md"), "utf-8");
const qualityGates = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/quality-gates.json"), "utf-8"));
const industryTemplates = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/industry-templates.json"), "utf-8"));

interface StrategistInput {
  crawler: CrawlerResult;
  technical?: TechnicalResult;
  content?: ContentResult;
  schema?: SchemaResult;
  geo?: GEOResult;
  businessType: BusinessType;
}

export async function runStrategistAgent(input: StrategistInput): Promise<StrategyResult> {
  const result = await withRetry(() => generateText({
    model: defaultModel,
    system: `${systemPrompt}\n\nQuality Gates:\n${JSON.stringify(qualityGates, null, 2)}\n\nIndustry Templates:\n${JSON.stringify(industryTemplates, null, 2)}`,
    prompt: `Synthesize the following audit results into a final strategy report. Return a StrategyResult JSON object.\n\n${JSON.stringify(trimForStrategist(input as unknown as Parameters<typeof trimForStrategist>[0]))}`,
    maxTokens: 16000,
  }));

  return JSON.parse(extractJsonFromResult(result)) as StrategyResult;
}
