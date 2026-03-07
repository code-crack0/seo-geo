import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPageByUrl } from "@/lib/db";

export const getPageDetailsSkill = (auditId: string) =>
  tool(
    async ({ url }) => {
      const page = await getPageByUrl(auditId, url);
      if (!page?.html) return `No stored data found for URL: ${url}`;
      // Extract basic page info from HTML
      const titleMatch = page.html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
      const descMatch = page.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,200})["']/i);
      const wordCount = (page.html.match(/\b\w+\b/g) ?? []).length;
      return JSON.stringify({
        url: page.url,
        title: titleMatch?.[1]?.trim() ?? "no title",
        metaDescription: descMatch?.[1]?.trim() ?? "no description",
        wordCount,
        hasScreenshot: Boolean(page.screenshot),
      }, null, 2);
    },
    {
      name: "get_page_details",
      description:
        "Get detailed information about a specific crawled page: title, meta description, word count. " +
        "Use this when the user asks about a specific URL.",
      schema: z.object({
        url: z.string().describe("The full URL of the page to inspect"),
      }),
    }
  );
