// src/lib/browserbase.ts
// Browser-Use Cloud integration — creates a cloud browser session via
// browser-use-sdk, connects Playwright over CDP, and exposes the
// embeddable live view URL for the frontend.
import { BrowserUse } from "browser-use-sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface BBSession {
  sessionId: string;
  /** Embeddable live view URL — use as iframe src (https://live.browser-use.com?wss=...) */
  liveUrl: string;
}

let _client: BrowserUse | null = null;
let _sessionId: string | null = null;
let _browser: Browser | null = null;
let _context: BrowserContext | null = null;

/**
 * Create a Browser-Use cloud browser session, then attach Playwright over CDP.
 * Returns the session ID and embeddable live view URL.
 */
export async function initBrowser(): Promise<BBSession> {
  await closeBrowser();

  const apiKey = process.env.BROWSERUSE_API_KEY;
  if (!apiKey) throw new Error("BROWSERUSE_API_KEY not set in .env.local");

  _client = new BrowserUse({ apiKey });
  const session = await _client.browsers.create({});
  _sessionId = session.id;

  if (!session.cdpUrl) throw new Error("Browser-Use session missing cdpUrl");
  if (!session.liveUrl) throw new Error("Browser-Use session missing liveUrl");

  // Connect Playwright to the Browser-Use CDP endpoint
  _browser = await chromium.connectOverCDP(session.cdpUrl);
  _context = _browser.contexts()[0] ?? await _browser.newContext();

  return {
    sessionId: session.id,
    liveUrl: session.liveUrl,
  };
}

/**
 * Get the main (first) page from the Playwright context.
 * Used by the crawler agent (runs sequentially).
 */
export function getMainPage(): Page {
  if (!_context) throw new Error("Browser not initialized. Call initBrowser() first.");
  const pages = _context.pages();
  return pages[0];
}

/**
 * Open a new browser tab in the same Browser-Use session.
 * Use for parallel agents (technical, schema, geo) so they don't interfere.
 */
export async function getNewBrowserPage(): Promise<Page> {
  if (!_context) throw new Error("Browser not initialized. Call initBrowser() first.");
  return _context.newPage();
}

/**
 * Close the Playwright connection and stop the Browser-Use session.
 * Always called in the supervisor's finally block.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    _context = null;
  }
  if (_client && _sessionId) {
    await _client.browsers.stop(_sessionId).catch(() => {});
    _sessionId = null;
    _client = null;
  }
}
