// src/lib/browserbase.ts
// Browser-Use Cloud integration — creates a cloud browser session via
// browser-use-sdk, connects Playwright over CDP, and exposes the
// embeddable live view URL for the frontend.
//
// Session data is keyed by auditId so concurrent audits don't interfere.
import { BrowserUse } from "browser-use-sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface BBSession {
  sessionId: string;
  /** Embeddable live view URL — use as iframe src (https://live.browser-use.com?wss=...) */
  liveUrl: string;
}

interface SessionData {
  client: BrowserUse;
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
}

// Per-audit session map — supports concurrent audits safely
const _sessions = new Map<string, SessionData>();

/**
 * Create a Browser-Use cloud browser session, then attach Playwright over CDP.
 * Returns the session ID and embeddable live view URL.
 */
export async function initBrowser(auditId: string): Promise<BBSession> {
  await closeBrowser(auditId);

  const apiKey = process.env.BROWSERUSE_API_KEY;
  if (!apiKey) throw new Error("BROWSERUSE_API_KEY not set in .env.local");

  const client = new BrowserUse({ apiKey });
  const session = await client.browsers.create({});

  if (!session.cdpUrl) throw new Error("Browser-Use session missing cdpUrl");
  if (!session.liveUrl) throw new Error("Browser-Use session missing liveUrl");

  // Connect Playwright to the Browser-Use CDP endpoint
  const browser = await chromium.connectOverCDP(session.cdpUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();

  _sessions.set(auditId, { client, sessionId: session.id, browser, context });

  return {
    sessionId: session.id,
    liveUrl: session.liveUrl,
  };
}

/**
 * Get the main (first) page from the Playwright context.
 * Used by the crawler agent (runs sequentially).
 */
export function getMainPage(auditId: string): Page {
  const s = _sessions.get(auditId);
  if (!s) throw new Error(`Browser not initialized for audit ${auditId}. Call initBrowser() first.`);
  const pages = s.context.pages();
  return pages[0];
}

/**
 * Open a new browser tab in the same Browser-Use session.
 * Use for parallel agents (technical, schema, geo) so they don't interfere.
 */
export async function getNewBrowserPage(auditId: string): Promise<Page> {
  const s = _sessions.get(auditId);
  if (!s) throw new Error(`Browser not initialized for audit ${auditId}. Call initBrowser() first.`);
  return s.context.newPage();
}

/**
 * Close the Playwright connection and stop the Browser-Use session.
 * Always called in the supervisor's finally block.
 */
export async function closeBrowser(auditId: string): Promise<void> {
  const s = _sessions.get(auditId);
  if (!s) return;
  _sessions.delete(auditId);
  await s.browser.close().catch(() => {});
  await s.client.browsers.stop(s.sessionId).catch(() => {});
}
