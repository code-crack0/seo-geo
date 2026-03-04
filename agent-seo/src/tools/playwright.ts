// src/tools/playwright.ts
import { tool, type DataStreamWriter } from "ai";
import { z } from "zod";
import { type Page } from "playwright";
import { PAGE_DATA_SCRIPT, PERFORMANCE_SCRIPT } from "./extractors";
import type { PopupDetection } from "@/lib/types";

// ─── Navigation helper (resilient) ────────────────────────────────────────────
// ERR_ABORTED fires when a page redirects before DOMContentLoaded resolves.
// Retry with "commit" (fires as soon as response headers arrive) to handle
// sites with aggressive JS redirects or anti-bot challenges.

async function navigateRobust(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (firstErr) {
    const msg = String(firstErr);
    if (msg.includes("ERR_ABORTED") || msg.includes("net::ERR") || msg.includes("Timeout")) {
      try {
        // "commit" fires the moment we get HTTP response headers — most resilient
        await page.goto(url, { waitUntil: "commit", timeout: 20000 });
        // Let JS execute after commit
        await page.waitForTimeout(2500).catch(() => {});
      } catch {
        // Navigation completely failed — proceed with whatever state the page is in
      }
    }
    // Any other error type: swallow and continue (don't crash the agent)
  }
}

// ─── Continuous screenshot streaming ─────────────────────────────────────────
// Streams JPEG screenshots every ~700ms during long-running operations so the
// inline browser panel updates in near-real-time instead of only on events.

function startScreenshotStream(
  page: Page,
  dataStream: DataStreamWriter,
  actionLabel: string,
  intervalMs = 700,
): () => void {
  let active = true;

  (async () => {
    while (active) {
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 60 });
        const url = (() => { try { return page.url(); } catch { return ""; } })();
        try {
          dataStream.writeData({
            type: "browser_frame",
            image: `data:image/jpeg;base64,${buf.toString("base64")}`,
            url,
            action: actionLabel,
          });
        } catch { /* stream closed */ }
      } catch { /* page transitioning — skip frame */ }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  })();

  return () => { active = false; };
}

// ─── Popup detection ──────────────────────────────────────────────────────────

const DETECT_POPUPS_SCRIPT = `(function() {
  var groups = [
    { selectors: ['#onetrust-banner-sdk', '.onetrust-pc-dark-filter', '#onetrust-accept-btn-handler',
        '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyButtonAccept',
        '.cc-window', '.cc-banner', '#cn-accept-cookie', '#cookie-notice',
        '[id*="cookie"][id*="banner"]', '[class*="cookie"][class*="banner"]',
        '[id*="cookie"][id*="bar"]', '[class*="cookie"][class*="bar"]',
        '.cookiescript', '#cookiescript_injected', '[class*="gdpr"]',
        '#didomi-notice', '.didomi-popup', '[id*="consent"][id*="banner"]'],
      type: 'cookie' },
    { selectors: ['[id*="gdpr"]', '[class*="gdpr"]', '.privacy-banner', '[data-nosnippet*="cookie"]'],
      type: 'gdpr' },
    { selectors: ['.modal-backdrop', '.modal.show', '[class*="overlay"][class*="modal"]',
        '[class*="popup"]:not([class*="cookie"])', '[id*="popup"]:not([id*="cookie"])'],
      type: 'modal' },
  ];
  var found = [];
  for (var g = 0; g < groups.length; g++) {
    for (var s = 0; s < groups[g].selectors.length; s++) {
      try {
        var els = document.querySelectorAll(groups[g].selectors[s]);
        for (var e = 0; e < els.length; e++) {
          var el = els[e];
          if (!el.offsetParent && window.getComputedStyle(el).position !== 'fixed') continue;
          var rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20) continue;
          var vpArea = window.innerWidth * window.innerHeight;
          var elArea = rect.width * rect.height;
          var pct = Math.round((elArea / vpArea) * 100);
          var pos = 'center';
          if (rect.bottom < window.innerHeight * 0.35) pos = 'top';
          else if (rect.top > window.innerHeight * 0.65) pos = 'bottom';
          else if (pct > 60) pos = 'full';
          found.push({
            selector: groups[g].selectors[s],
            bannerType: groups[g].type,
            viewportCoveragePercent: pct,
            blocksContent: pct > 25 || pos === 'full',
            position: pos,
          });
          break;
        }
      } catch(e) {}
    }
  }
  return found;
})()`;

const DISMISS_POPUPS_SCRIPT = `(function() {
  var clickSelectors = [
    '#onetrust-accept-btn-handler', '.onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept',
    '.cc-btn.cc-allow', '.cc-dismiss', '#cn-accept-cookie', '#accept-all',
    '[id*="accept"][id*="cookie"i]', '[class*="accept"][class*="cookie"i]',
    'button[aria-label*="accept"i]', 'button[aria-label*="agree"i]',
    'button[aria-label*="close"i]:not([aria-label*="menu"i])',
    'button[aria-label*="dismiss"i]', '[data-testid*="cookie-accept"]',
    '.cookie-banner button', '.consent-banner button', '#consent button',
    '[class*="cookie"] button[class*="close"i]', '[id*="cookie"] button[class*="close"i]',
    '.fc-button.fc-cta-consent', '#didomi-notice-agree-button', '.didomi-continue-without-agreeing'
  ];
  var hideSelectors = [
    '.cookie-banner', '.cookie-notice', '.cookie-popup', '[class*="cookie-consent"]',
    '[id*="cookie-consent"]', '.gdpr-banner', '.gdpr-popup', '[class*="cookie-bar"]',
    '#cookiescript_injected', '.modal-backdrop', '[class*="consent-modal"]',
    '[class*="cookie-modal"]', '[id*="cookie-modal"]'
  ];
  for (var i = 0; i < clickSelectors.length; i++) {
    try {
      var els = document.querySelectorAll(clickSelectors[i]);
      for (var j = 0; j < els.length; j++) {
        if (els[j].offsetParent !== null) { els[j].click(); }
      }
    } catch(e) {}
  }
  for (var k = 0; k < hideSelectors.length; k++) {
    try {
      var hidden = document.querySelectorAll(hideSelectors[k]);
      for (var l = 0; l < hidden.length; l++) { hidden[l].style.display = 'none'; }
    } catch(e) {}
  }
  return true;
})()`;

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function detectAndDismissPopups(
  page: Page,
  dataStream: DataStreamWriter,
  url: string,
): Promise<PopupDetection[]> {
  let detections: PopupDetection[] = [];
  try {
    detections = await page.evaluate(DETECT_POPUPS_SCRIPT) as PopupDetection[];
  } catch { /* page may have navigated away */ }

  if (detections.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dataStream.writeData({ type: "popup_report", url, popups: detections } as any);
    } catch { /* stream closed */ }
    for (const d of detections) {
      const impact = d.blocksContent ? "⚠️ blocks content" : "minor";
      try {
        dataStream.writeData({
          type: "log",
          level: d.blocksContent ? "warn" : "info",
          message: `[popup] ${d.bannerType} banner at ${new URL(url).hostname} — ${d.viewportCoveragePercent}% viewport, ${d.position} (${impact})`,
        });
      } catch { /* stream closed */ }
    }
  }

  try {
    await page.evaluate(DISMISS_POPUPS_SCRIPT);
    await page.waitForTimeout(350).catch(() => {});
  } catch { /* swallow */ }

  return detections;
}

async function takeFullPageScreenshot(page: Page): Promise<string> {
  try {
    const buffer = await page.screenshot({ type: "jpeg", fullPage: true });
    return buffer.toString("base64");
  } catch {
    // Fallback: viewport-only screenshot
    try {
      const buffer = await page.screenshot({ type: "jpeg" });
      return buffer.toString("base64");
    } catch {
      return "";
    }
  }
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createPlaywrightTools(dataStream: DataStreamWriter, page: Page) {
  return {
    navigateTo: tool({
      description: "Navigate the browser to a URL and capture a screenshot",
      parameters: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        try { dataStream.writeData({ type: "log", level: "info", message: `[browser] → ${url}` }); } catch { /* */ }

        // Stream screenshots live while the page loads
        const stopStream = startScreenshotStream(page, dataStream, `Loading ${url}…`);

        try {
          await navigateRobust(page, url);
          await page.waitForTimeout(1200).catch(() => {});
        } finally {
          stopStream();
        }

        await detectAndDismissPopups(page, dataStream, url);

        // Final high-quality full-page screenshot after everything settles
        const imageData = await takeFullPageScreenshot(page);
        if (imageData) {
          try {
            dataStream.writeData({ type: "browser_frame", image: `data:image/jpeg;base64,${imageData}`, url, action: `Navigated to ${url}` });
          } catch { /* */ }
        }

        return { url, success: true };
      },
    }),

    extractPageData: tool({
      description: "Extract SEO-relevant data from the current page",
      parameters: z.object({}),
      execute: async () => {
        try { return await page.evaluate(PAGE_DATA_SCRIPT); } catch { return {}; }
      },
    }),

    extractSchemaMarkup: tool({
      description: "Extract JSON-LD schema markup from current page (capped at 5 objects, 800 chars each)",
      parameters: z.object({}),
      execute: async () => {
        try {
          const schemas: unknown[] = await page.evaluate(`
            Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
              .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } })
              .filter(Boolean)
              .slice(0, 5)
          `);
          // Truncate each schema object to 800 chars to prevent context bloat
          return schemas.map(s => {
            const str = JSON.stringify(s);
            if (str.length <= 800) return s;
            const typeHint = (s as Record<string, unknown>)?.["@type"] ?? "unknown";
            return { "@type": typeHint, _truncated: true, _preview: str.slice(0, 800) };
          });
        } catch { return []; }
      },
    }),

    checkRobotsTxt: tool({
      description: "Fetch and analyze robots.txt for the domain",
      parameters: z.object({ domain: z.string() }),
      execute: async ({ domain }) => {
        const url = `https://${domain}/robots.txt`;
        try { dataStream.writeData({ type: "log", level: "info", message: `[crawler] Fetching robots.txt for ${domain}` }); } catch { /* */ }

        const stopStream = startScreenshotStream(page, dataStream, "Checking robots.txt…");
        try {
          await navigateRobust(page, url);
        } finally {
          stopStream();
        }

        let content = "";
        try { content = await page.evaluate(`document.body.innerText`) as string; } catch { /* */ }

        const hasDisallowAll = /^Disallow:\s*\/\s*$/m.test(content);
        const sitemapMatch = content.match(/Sitemap:\s*(.+)/i);

        const imageData = await takeFullPageScreenshot(page);
        if (imageData) {
          try { dataStream.writeData({ type: "browser_frame", image: `data:image/jpeg;base64,${imageData}`, url, action: "Checked robots.txt" }); } catch { /* */ }
        }
        if (hasDisallowAll) {
          try { dataStream.writeData({ type: "log", level: "warn", message: `[crawler] robots.txt blocks all crawlers (Disallow: /)` }); } catch { /* */ }
        }

        return { content, hasDisallowAll, sitemapUrl: sitemapMatch?.[1]?.trim() };
      },
    }),

    checkSitemap: tool({
      description: "Fetch and analyze XML sitemap",
      parameters: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        try { dataStream.writeData({ type: "log", level: "info", message: `[crawler] Fetching sitemap: ${url}` }); } catch { /* */ }

        // Use Playwright's request context — bypasses CORS/CSP restrictions that break
        // page.evaluate(fetch(...)) on many sites. Works like a server-side HTTP request.
        let content = "";
        try {
          const response = await page.context().request.get(url, {
            headers: { Accept: "application/xml,text/xml,*/*" },
            timeout: 15000,
          });
          if (response.ok()) {
            content = await response.text();
          } else {
            try { dataStream.writeData({ type: "log", level: "warn", message: `[crawler] Sitemap HTTP ${response.status()}: ${url}` }); } catch { /* */ }
          }
        } catch (e) {
          try { dataStream.writeData({ type: "log", level: "warn", message: `[crawler] Sitemap fetch failed: ${String(e)}` }); } catch { /* */ }
        }

        const locMatches = [...content.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)].map(m => m[1].trim());

        // Detect sitemap index: all <loc> entries point to other XML/sitemap files
        const isSitemapIndex = locMatches.length > 0 && locMatches.every(u => u.endsWith(".xml") || u.includes("sitemap"));
        let finalUrls: string[] = [];

        if (isSitemapIndex && locMatches.length > 0) {
          // Fetch ALL sub-sitemaps and take 10 URLs from each for better content diversity
          try {
            dataStream.writeData({ type: "log", level: "info", message: `[crawler] Sitemap index: ${locMatches.length} sub-sitemaps — fetching 10 URLs each` });
          } catch { /* */ }

          const seen = new Set<string>();
          for (const subUrl of locMatches) {
            try {
              const subRes = await page.context().request.get(subUrl, {
                headers: { Accept: "application/xml,text/xml,*/*" },
                timeout: 15000,
              });
              if (subRes.ok()) {
                const subContent = await subRes.text();
                const subLocs = [...subContent.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)]
                  .map(m => m[1].trim())
                  .filter(u => !u.endsWith(".xml") && !seen.has(u)); // skip nested indexes, deduplicate
                const picked = subLocs.slice(0, 10);
                picked.forEach(u => seen.add(u));
                finalUrls.push(...picked);
              }
            } catch { /* skip failed sub-sitemap, continue with others */ }
          }

          if (finalUrls.length === 0) finalUrls = locMatches; // fallback: return sub-sitemap URLs themselves
        } else {
          // Regular sitemap — take up to 10 URLs
          finalUrls = locMatches.slice(0, 10);
        }

        const urlCount = finalUrls.length;
        try { dataStream.writeData({ type: "log", level: "info", message: `[crawler] Sitemap: ${urlCount} URLs collected` }); } catch { /* */ }
        return { urlCount, found: urlCount > 0, sampleUrls: finalUrls };
      },
    }),

    getPerformanceMetrics: tool({
      description: "Get page performance metrics",
      parameters: z.object({}),
      execute: async () => {
        try { return await page.evaluate(PERFORMANCE_SCRIPT); } catch { return {}; }
      },
    }),

    searchPerplexity: tool({
      description: "Search Perplexity AI to check if a brand is cited in AI responses",
      parameters: z.object({ query: z.string(), domain: z.string() }),
      execute: async ({ query, domain }) => {
        const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;
        try { dataStream.writeData({ type: "log", level: "info", message: `[geo] Querying Perplexity: "${query}"` }); } catch { /* */ }

        const stopStream = startScreenshotStream(page, dataStream, `Perplexity: "${query}"`, 1200);
        try {
          await navigateRobust(page, url);
          // Wait for AI response to generate — stream screenshots during this wait
          await page.waitForTimeout(8000).catch(() => {});
        } finally {
          stopStream();
        }

        await detectAndDismissPopups(page, dataStream, url);

        const imageData = await takeFullPageScreenshot(page);
        if (imageData) {
          try { dataStream.writeData({ type: "browser_frame", image: `data:image/jpeg;base64,${imageData}`, url, action: `Perplexity: "${query}"` }); } catch { /* */ }
        }

        let responseText = "";
        try {
          responseText = await page.evaluate(`
            document.querySelector('[class*="prose"], [class*="answer"], main')?.innerText ?? document.body.innerText
          `) as string;
        } catch { /* */ }

        const mentioned = responseText.toLowerCase().includes(domain.toLowerCase());
        try {
          dataStream.writeData({ type: "log", level: "info", message: `[geo] Perplexity "${query}": ${mentioned ? "✅ mentioned" : "❌ not mentioned"}` });
        } catch { /* */ }

        return { query, responseText: responseText.slice(0, 2000), mentioned, url };
      },
    }),

    searchGoogle: tool({
      description: "Search Google and check for AI Overviews",
      parameters: z.object({ query: z.string(), domain: z.string() }),
      execute: async ({ query, domain }) => {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        try { dataStream.writeData({ type: "log", level: "info", message: `[geo] Google: "${query}"` }); } catch { /* */ }

        const stopStream = startScreenshotStream(page, dataStream, `Google: "${query}"`, 1000);
        try {
          await navigateRobust(page, url);
          await page.waitForTimeout(2500).catch(() => {});
        } finally {
          stopStream();
        }

        await detectAndDismissPopups(page, dataStream, url);

        const imageData = await takeFullPageScreenshot(page);
        if (imageData) {
          try { dataStream.writeData({ type: "browser_frame", image: `data:image/jpeg;base64,${imageData}`, url, action: `Google: "${query}"` }); } catch { /* */ }
        }

        let pageText = "";
        try { pageText = await page.evaluate(`document.body.innerText`) as string; } catch { /* */ }

        const hasAIOverview = pageText.includes("AI Overview") || pageText.includes("SGE");
        const mentioned = pageText.toLowerCase().includes(domain.toLowerCase());
        try {
          dataStream.writeData({ type: "log", level: "info", message: `[geo] Google: AI Overview ${hasAIOverview ? "✅" : "❌"}, domain ${mentioned ? "✅ mentioned" : "❌ not mentioned"}` });
        } catch { /* */ }

        return { query, hasAIOverview, mentioned, url };
      },
    }),

    searchYouCom: tool({
      description: "Search You.com AI to check if a brand is cited in AI-generated answers. You.com provides AI answers without requiring authentication.",
      parameters: z.object({ query: z.string(), domain: z.string() }),
      execute: async ({ query, domain }) => {
        const url = `https://you.com/search?q=${encodeURIComponent(query)}&fromSearchBar=true&tbm=youchat`;
        try { dataStream.writeData({ type: "log", level: "info", message: `[geo] You.com: "${query}"` }); } catch { /* */ }

        const stopStream = startScreenshotStream(page, dataStream, `You.com: "${query}"`, 1200);
        try {
          await navigateRobust(page, url);
          // Wait for AI chat response to generate
          await page.waitForTimeout(7000).catch(() => {});
        } finally {
          stopStream();
        }

        await detectAndDismissPopups(page, dataStream, url);

        const imageData = await takeFullPageScreenshot(page);
        if (imageData) {
          try { dataStream.writeData({ type: "browser_frame", image: `data:image/jpeg;base64,${imageData}`, url, action: `You.com: "${query}"` }); } catch { /* */ }
        }

        let responseText = "";
        try {
          responseText = await page.evaluate(`
            document.querySelector('[data-testid="youchat-text"], [class*="chatResult"], [class*="youChat"], [class*="ai-response"], .youchat-result')?.innerText
            ?? document.querySelector('main')?.innerText
            ?? document.body.innerText
          `) as string;
        } catch { /* */ }

        const mentioned = responseText.toLowerCase().includes(domain.toLowerCase());
        try {
          dataStream.writeData({ type: "log", level: "info", message: `[geo] You.com "${query}": ${mentioned ? "✅ mentioned" : "❌ not mentioned"}` });
        } catch { /* */ }

        return { query, responseText: responseText.slice(0, 2000), mentioned, url };
      },
    }),
  };
}
