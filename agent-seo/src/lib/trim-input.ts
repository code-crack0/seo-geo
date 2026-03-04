// src/lib/trim-input.ts
// Analysis agents now query SQLite directly and parse HTML themselves,
// so the only trimming needed is for the strategist's combined input.

import type { CrawlerResult } from "./types";

/** Strategist: trim crawler portion so the combined results stay compact */
export function trimForStrategist(input: { crawler: CrawlerResult; [key: string]: unknown }): object {
  return {
    ...input,
    crawler: {
      businessType: input.crawler.businessType,
      sitemapFound: input.crawler.sitemapFound,
      robotsTxtFound: input.crawler.robotsTxtFound,
      totalPages: input.crawler.totalPages,
      brokenLinks: (input.crawler.brokenLinks ?? []).slice(0, 10),
      redirectChains: (input.crawler.redirectChains ?? []).slice(0, 10),
      pageUrls: (input.crawler.pageUrls ?? []).slice(0, 20),
    },
  };
}
