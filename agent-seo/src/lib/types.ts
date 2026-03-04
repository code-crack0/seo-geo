// src/lib/types.ts

// === AUDIT INPUT ===
export interface AuditInput {
  domain: string;
  auditId: string;
}

// === BUSINESS TYPE ===
export type BusinessType = "saas" | "ecommerce" | "local" | "publisher" | "agency" | "general";

// === CRAWLER OUTPUT ===
// Raw page HTML is stored in SQLite (crawled_pages table); agents query it directly.
export interface CrawlerResult {
  pageUrls: string[];
  businessType: BusinessType;
  sitemapFound: boolean;
  robotsTxtFound: boolean;
  totalPages: number;
  brokenLinks: string[];
  redirectChains: { from: string; to: string; hops: number }[];
}

// === TECHNICAL AUDIT ===
export interface TechnicalResult {
  score: number;
  cwv: {
    lcp: { value: number; rating: "good" | "needs-improvement" | "poor" };
    inp: { value: number; rating: "good" | "needs-improvement" | "poor" };
    cls: { value: number; rating: "good" | "needs-improvement" | "poor" };
  };
  issues: TechnicalIssue[];
  mobileResponsive: boolean;
  httpsEnabled: boolean;
  indexabilityIssues: string[];
}

export interface TechnicalIssue {
  severity: "critical" | "warning" | "info";
  category: "performance" | "indexability" | "mobile" | "security" | "crawlability" | "redirects" | "meta" | "speed";
  title: string;
  description: string;
  affectedPages: string[];
  recommendation: string;
}

// === CONTENT ANALYSIS ===
export interface ContentResult {
  score: number;
  eeat: {
    experience: { score: number; signals: string[] };
    expertise: { score: number; signals: string[] };
    authoritativeness: { score: number; signals: string[] };
    trustworthiness: { score: number; signals: string[] };
  };
  thinPages: { url: string; wordCount: number; issue: string }[];
  recommendations: string[];
  topPerformingPages: { url: string; reason: string }[];
}

// === SCHEMA ANALYSIS ===
export interface SchemaResult {
  score: number;
  detected: {
    url: string;
    type: string;
    format: "json-ld" | "microdata" | "rdfa";
    valid: boolean;
    issues: string[];
  }[];
  missing: { type: string; reason: string; priority: "high" | "medium" | "low" }[];
  deprecated: { type: string; found_on: string; replacement: string }[];
  suggestions: any[];
}

// === GEO ANALYSIS ===
export interface GEOResult {
  aiVisibilityScore: number;
  mentions: {
    engine: "google_ai" | "perplexity" | "chatgpt" | "you_com";
    query: string;
    mentioned: boolean;
    sentiment: "positive" | "neutral" | "negative" | "not_found";
    position: "primary" | "secondary" | "passing" | "not_mentioned";
    citedSources: string[];
  }[];
  citationGaps: {
    topic: string;
    competitorsCited: string[];
    yourContentExists: boolean;
    opportunity: string;
  }[];
  citeScore: {
    clarity: number;
    intent: number;
    trust: number;
    evidence: number;
  };
  recommendations: string[];
}

// === CONTENT STRATEGY ===
export interface StrategyResult {
  overallScore: number;
  categoryScores: {
    technical: number;
    content: number;
    schema: number;
    geo: number;
  };
  prioritizedActions: {
    rank: number;
    category: "technical" | "content" | "schema" | "geo";
    action: string;
    impact: "high" | "medium" | "low";
    effort: "high" | "medium" | "low";
    details: string;
  }[];
  contentBriefs: {
    title: string;
    targetKeyword: string;
    geoOptimized: boolean;
    rationale: string;
    outline: string[];
    estimatedImpact: string;
  }[];
  quickWins: string[];
}

// === FULL AUDIT STATE ===
export interface AuditState {
  auditId: string;
  domain: string;
  status: "crawling" | "analyzing" | "synthesizing" | "completed" | "failed";
  businessType?: BusinessType;
  crawler?: CrawlerResult;
  technical?: TechnicalResult;
  content?: ContentResult;
  schema?: SchemaResult;
  geo?: GEOResult;
  strategy?: StrategyResult;
  error?: string;
}

// === POPUP / COOKIE BANNER DETECTION ===
export interface PopupDetection {
  selector: string;
  bannerType: "cookie" | "gdpr" | "consent" | "modal" | "other";
  viewportCoveragePercent: number;
  blocksContent: boolean;
  position: "top" | "bottom" | "center" | "full";
  [key: string]: unknown; // Required for JSON serialization compatibility
}

// === STREAMING DATA TYPES ===
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}

export type StreamEvent =
  | { type: "agent_status"; agent: string; status: "running" | "done" | "error"; message?: string }
  | { type: "browser_frame"; image: string; url: string; action: string }
  | { type: "browser_session"; sessionId: string; liveUrl: string }
  | { type: "log"; level: LogLevel; message: string }
  | { type: "popup_report"; url: string; popups: PopupDetection[] }
  | { type: "business_type"; businessType: BusinessType }
  | { type: "partial_result"; agent: string; data: any }
  | { type: "score_update"; category: string; score: number }
  | { type: "issue_found"; issue: TechnicalIssue }
  | { type: "geo_mention"; mention: GEOResult["mentions"][0] }
  | { type: "audit_complete"; state: AuditState };
