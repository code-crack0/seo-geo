// src/agents/crawler.ts
import { generateText, tool } from "ai";
import { defaultModel } from "@/lib/ai";
import fs from "fs";
import path from "path";
import { z } from "zod";
import type { CrawlerResult } from "@/lib/types";
import { createPlaywrightTools } from "@/tools/playwright";
import { extractJsonFromResult } from "@/lib/parse-agent-result";
import { withRetry } from "@/lib/retry";
import { storePageHtml } from "@/lib/db";
import { type Page } from "playwright";

const systemPrompt = fs.readFileSync(path.join(process.cwd(), "src/agents/prompts/crawler.md"), "utf-8");

export async function runCrawlerAgent(domain: string, auditId: string, dataStream: any, page: Page): Promise<CrawlerResult> {
  const tools = createPlaywrightTools(dataStream, page);

  // captureAndStore: saves the current page's full HTML to SQLite and returns
  // only compact metadata so the LLM context stays small.
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

      // Capture a viewport screenshot for vision-based content analysis
      let screenshotB64: string | null = null;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 50 });
        screenshotB64 = buf.toString("base64");
      } catch { /* swallow — screenshot is optional */ }

      await storePageHtml(auditId, url, capped, screenshotB64);

      // Extract minimal metadata for LLM crawl tracking
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
6. Once you have 15 pages OR run out of new URLs, STOP and output the JSON immediately

IMPORTANT: Use captureAndStore (NOT extractPageData) after each navigation.

Return a JSON object:
{ pageUrls: string[], businessType, sitemapFound, robotsTxtFound, totalPages, brokenLinks, redirectChains }
Where pageUrls is the list of all URLs successfully captured and stored.`,
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

  return JSON.parse(extractJsonFromResult(result)) as CrawlerResult;
}
