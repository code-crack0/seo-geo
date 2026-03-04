// src/agents/crawler.ts
import { generateText, generateObject, tool } from "ai";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import { z } from "zod";
import type { CrawlerResult } from "@/lib/types";
import { createPlaywrightTools } from "@/tools/playwright";
import { withRetry } from "@/lib/retry";
import { storePageHtml } from "@/lib/db";
import { type Page } from "playwright";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/crawler.md"), "utf-8");

export async function runCrawlerAgent(domain: string, auditId: string, dataStream: any, page: Page): Promise<CrawlerResult> {
  const tools = createPlaywrightTools(dataStream, page);

  const captureAndStore = tool({
    description:
      "Capture the current page's HTML, store it to the database, and return key metadata " +
      "(url, title, wordCount, internalLinks) for crawl tracking. " +
      "Call this immediately after every navigateTo.",
    parameters: z.object({}),
    execute: async () => {
      const url = page.url();
      if (!url || url === "about:blank") {
        return { url: "", stored: false, title: "", wordCount: 0, internalLinks: [] as string[] };
      }

      let html = "";
      try {
        html = (await page.evaluate(() => document.documentElement.outerHTML)) as string;
      } catch {
        return { url, stored: false, title: "", wordCount: 0, internalLinks: [] as string[] };
      }

      const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;

      let screenshotB64: string | null = null;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 50 });
        screenshotB64 = buf.toString("base64");
      } catch { /* screenshot is optional */ }

      await storePageHtml(auditId, url, capped, screenshotB64);

      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const textOnly = html.replace(/<[^>]+>/g, " ");
      const wordCount = textOnly.split(/\s+/).filter(Boolean).length;
      let domainHost = "";
      try { domainHost = new URL(url).hostname; } catch { /* ignore */ }
      const internalLinks = [...html.matchAll(/href=["'](https?:\/\/[^"'#?\s]+)/gi)]
        .map(m => m[1])
        .filter(l => l.includes(domainHost))
        .slice(0, 20);

      return { url, stored: true, title, wordCount, internalLinks };
    },
  });

  // ── Step 1: Tool-calling phase — crawl the site ───────────────────────────
  const result = await withRetry(() =>
    generateText({
      model: defaultModel,
      system: systemPrompt,
      prompt: `Crawl this domain and build a comprehensive content inventory: ${domain}

Steps:
1. Navigate to homepage, then call captureAndStore to save it
2. Call checkRobotsTxt — if it returns a sitemapUrl, call checkSitemap with THAT URL
3. If no sitemapUrl from robots.txt, try checkSitemap with https://${domain}/sitemap.xml
4. For each new URL discovered: navigateTo then immediately captureAndStore
5. Crawl up to 15 UNIQUE pages — never revisit a URL you already navigated to
6. Once you have 15 pages OR run out of new URLs, STOP.

IMPORTANT: Use captureAndStore (NOT extractPageData) after each navigation. Do NOT output JSON.`,
      tools: {
        navigateTo: tools.navigateTo,
        captureAndStore,
        checkRobotsTxt: tools.checkRobotsTxt,
        checkSitemap: tools.checkSitemap,
      },
      maxTokens: 16000,
      maxSteps: 50,
    })
  );

  // ── Step 2: Extract data from tool call results ───────────────────────────
  const pageUrls: string[] = [];
  let sitemapFound = false;
  let robotsTxtFound = false;
  const brokenLinks: string[] = [];
  const redirectChains: { from: string; to: string; hops: number }[] = [];
  const pageTitles: string[] = [];

  for (const step of result.steps) {
    for (const tr of (step.toolResults ?? [])) {
      const r = tr as { toolName: string; result: Record<string, unknown> };
      if (r.toolName === "captureAndStore" && r.result.stored && r.result.url) {
        const url = String(r.result.url);
        if (!pageUrls.includes(url)) {
          pageUrls.push(url);
          if (r.result.title) pageTitles.push(String(r.result.title));
        }
      }
      if (r.toolName === "checkRobotsTxt") robotsTxtFound = true;
      if (r.toolName === "checkSitemap" && Array.isArray(r.result.urls) && r.result.urls.length > 0) {
        sitemapFound = true;
      }
    }
  }

  // ── Step 3: Infer businessType using generateObject ───────────────────────
  const MetaSchema = z.object({
    businessType: z.enum(["saas", "ecommerce", "local", "publisher", "agency", "general"]),
  });

  let businessType: CrawlerResult["businessType"] = "general" as CrawlerResult["businessType"];
  try {
    const { object: meta } = await withRetry(() =>
      generateObject({
        model: defaultModel,
        schema: MetaSchema,
        messages: [{
          role: "user",
          content: `Domain: ${domain}\nCrawled page titles: ${pageTitles.slice(0, 8).join(" | ")}\nURLs: ${pageUrls.slice(0, 8).join(", ")}\n\nClassify this website's business type.`,
        }],
        maxTokens: 200,
      })
    );
    businessType = meta.businessType;
  } catch { /* use default */ }

  return {
    pageUrls,
    businessType,
    sitemapFound,
    robotsTxtFound,
    totalPages: pageUrls.length,
    brokenLinks,
    redirectChains,
  };
}
