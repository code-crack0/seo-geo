// src/agents/schema.ts
import { generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import type { BusinessType, SchemaResult } from "@/lib/types";
import { withRetry } from "@/lib/retry";
import { getPagesByAuditId } from "@/lib/db";
import { extractAllSchemaMarkup } from "@/lib/html-parser";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/schema.md"), "utf-8");
const referenceData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/schema-types.json"), "utf-8"));

const SchemaResultSchema = z.object({
  score: z.number().min(0).max(100).describe(
    "Overall schema markup health score (0-100). 0 = no schema at all, 100 = comprehensive valid schema covering all relevant types"
  ),
  detected: z.array(z.object({
    url: z.string(),
    type: z.string().describe("Schema @type value e.g. 'Product', 'Organization', 'Article', 'BreadcrumbList'"),
    format: z.enum(["json-ld", "microdata", "rdfa"]),
    valid: z.boolean().describe("True if all required properties for this schema type are present"),
    issues: z.array(z.string()).describe("Missing required properties or validation problems"),
  })).describe("All schema markup found across crawled pages"),
  missing: z.array(z.object({
    type: z.string().describe("Schema type that should be added for this business type"),
    reason: z.string().describe("Why this schema type would benefit this site"),
    priority: z.enum(["high", "medium", "low"]),
  })).describe("Recommended schema types not currently implemented"),
  deprecated: z.array(z.object({
    type: z.string().describe("The deprecated schema type found"),
    found_on: z.string().describe("URL where deprecated schema was found"),
    replacement: z.string().describe("What to use instead"),
  })).describe("Deprecated schema types that should be replaced"),
  suggestions: z.array(z.string()).describe("Additional actionable schema implementation suggestions"),
});

export async function runSchemaAgent(auditId: string, businessType: BusinessType): Promise<SchemaResult> {
  const pages = await getPagesByAuditId(auditId);

  // Extract schema markup server-side directly from stored HTML — reliable, no LLM needed for detection
  const schemaData = pages.map(p => {
    try {
      return extractAllSchemaMarkup(p.html ?? "", p.url);
    } catch {
      return { url: p.url, jsonLd: [], hasMicrodata: false, hasRdfa: false };
    }
  });

  const totalJsonLd = schemaData.reduce((n, p) => n + p.jsonLd.length, 0);
  const pagesWithSchema = schemaData.filter(p => p.jsonLd.length > 0 || p.hasMicrodata || p.hasRdfa).length;

  const { object } = await withRetry(() =>
    generateObject({
      model: defaultModel,
      schema: SchemaResultSchema,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}

Reference — supported schema types by business type:
${JSON.stringify(referenceData, null, 2)}

TASK: Validate the schema markup found in this ${businessType} website and produce a SchemaResult.

Summary: ${pages.length} pages crawled, ${pagesWithSchema} have schema markup, ${totalJsonLd} total JSON-LD blocks found.

Extracted schema data per page (server-side parsed directly from HTML):
${JSON.stringify(schemaData, null, 2)}

Instructions:
- For each JSON-LD block found, add an entry to "detected" with the @type, validation status, and any missing required properties
- If hasMicrodata=true for a page but no jsonLd, add a microdata detected entry
- For missing schemas: based on businessType "${businessType}", list priority schemas not found
- Score 0 if no schema found at all; score proportionally to coverage and validity
- Flag any deprecated schema types (HowTo, FAQ for non-govt/health, SpecialAnnouncement, etc.)`,
        },
      ],
      maxTokens: 16000,
    })
  );

  return {
    ...object,
    suggestions: (object.suggestions ?? []) as SchemaResult["suggestions"],
  } as SchemaResult;
}
