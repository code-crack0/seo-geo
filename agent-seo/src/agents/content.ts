// src/agents/content.ts
import { generateObject } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import type { BusinessType, ContentResult } from "@/lib/types";
import { withRetry } from "@/lib/retry";
import { getPagesByAuditId } from "@/lib/db";
import { extractContentSummary } from "@/lib/html-parser";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/content.md"), "utf-8");
const referenceData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/reference/eeat-framework.json"), "utf-8"));

// Structured output schema — enforces complete, non-null scores every time
const ContentResultSchema = z.object({
  score: z.number().min(0).max(100).describe("Overall content quality score (0-100), weighted average of E-E-A-T dimensions"),
  eeat: z.object({
    experience: z.object({
      score: z.number().min(0).max(100).describe("Score for first-hand Experience signals (0-100)"),
      signals: z.array(z.string()).describe("Specific E signals found: personal anecdotes, original photos, case studies, 'we tested' language"),
    }),
    expertise: z.object({
      score: z.number().min(0).max(100).describe("Score for Expertise signals (0-100)"),
      signals: z.array(z.string()).describe("Specific E signals found: author bios, credentials, technical depth, cited sources"),
    }),
    authoritativeness: z.object({
      score: z.number().min(0).max(100).describe("Score for Authoritativeness signals (0-100)"),
      signals: z.array(z.string()).describe("Specific A signals found: brand recognition, awards, press mentions, partner logos"),
    }),
    trustworthiness: z.object({
      score: z.number().min(0).max(100).describe("Score for Trustworthiness signals (0-100)"),
      signals: z.array(z.string()).describe("Specific T signals found: HTTPS, contact info, privacy policy, reviews, clear pricing"),
    }),
  }),
  thinPages: z.array(z.object({
    url: z.string(),
    wordCount: z.number(),
    issue: z.string().describe("What makes this page thin or low-quality"),
  })).describe("Pages with thin, duplicate, or low-quality content"),
  recommendations: z.array(z.string()).min(3).describe("Top 5 specific, actionable recommendations to improve E-E-A-T"),
  topPerformingPages: z.array(z.object({
    url: z.string(),
    reason: z.string().describe("Why this page demonstrates strong E-E-A-T"),
  })).describe("Best content pages that demonstrate strong E-E-A-T signals"),
});

export async function runContentAgent(auditId: string, businessType: BusinessType): Promise<ContentResult> {
  const pages = await getPagesByAuditId(auditId);

  // Compact text metadata for all pages (headings, word count, meta)
  const textMeta = pages.map(p => {
    try { return extractContentSummary(p.html ?? "", p.url); } catch {
      return { url: p.url, title: "", metaDescription: "", headings: [], wordCount: 0, externalLinksCount: 0 };
    }
  });

  const systemText = `${systemPrompt}\n\nE-E-A-T Reference Framework:\n${JSON.stringify(referenceData, null, 2)}`;

  // Use vision API when screenshots are available (richer E-E-A-T signals)
  const screenshotPages = pages.filter(p => p.screenshot);

  if (screenshotPages.length > 0) {
    // Limit to 6 screenshots to keep vision token usage reasonable (~7-9K vision tokens)
    const imagePages = screenshotPages.slice(0, 6);

    const { object } = await withRetry(() =>
      generateObject({
        model: defaultModel,
        schema: ContentResultSchema,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${systemText}

Analyze this website's E-E-A-T content quality. You have BOTH page metadata AND visual screenshots.

Business type: ${businessType}
Total pages crawled: ${pages.length}

Page metadata (all ${pages.length} pages):
${JSON.stringify(textMeta, null, 2)}

Visual screenshots (${imagePages.length} pages attached below):
Use the screenshots to visually assess:
- Trust signals visible on page: contact info, privacy links, security badges, phone numbers, addresses
- Experience signals: original photos, testimonials, case studies, "we tested" language visible
- Expertise signals: author bios with credentials, in-depth technical content, citations visible
- Authoritativeness: brand logos, press mentions, award badges, partner logos visible
- Content quality: professional layout, readable typography, no keyword stuffing, content depth
- Thin or low-value pages vs high-quality content pages

Give specific, accurate scores based on what you can ACTUALLY observe in the screenshots and metadata.
Do not give 0 scores unless the site truly has no signals at all.`,
              },
              ...imagePages.map(p => ({
                type: "image" as const,
                image: Buffer.from(p.screenshot!, "base64"),
                mimeType: "image/jpeg" as const,
              })),
            ],
          },
        ],
        maxTokens: 16000,
      })
    );

    return object as ContentResult;
  }

  // Fallback: text-only analysis when no screenshots available
  const { object } = await withRetry(() =>
    generateObject({
      model: defaultModel,
      schema: ContentResultSchema,
      messages: [
        {
          role: "user",
          content: `${systemText}

Analyze the following crawled website data for E-E-A-T quality signals.

Business type: ${businessType}
Total pages: ${pages.length}

Page data:
${JSON.stringify(textMeta, null, 2)}

Infer E-E-A-T signals from: page titles, meta descriptions, heading structure, word counts, and URL patterns.
Sites with more pages, better meta descriptions, and varied headings generally score higher.
Give realistic scores — avoid giving all zeros if the site has some content.`,
        },
      ],
      maxTokens: 16000,
    })
  );

  return object as ContentResult;
}
