// src/stores/audit-store.ts
import { create } from "zustand";
import type { BusinessType, TechnicalResult, ContentResult, SchemaResult, GEOResult, StrategyResult, StreamEvent, LogEntry, PopupDetection } from "@/lib/types";

interface BrowserFrame { image: string; url: string; action: string; timestamp: number; }
type AgentStatus = { status: "pending" | "running" | "done" | "error"; message?: string };

interface StoredAuditResults {
  technical?: TechnicalResult;
  content?: ContentResult;
  schema?: SchemaResult;
  geo?: GEOResult;
  strategy?: StrategyResult;
  businessType?: BusinessType;
}

interface AuditStore {
  auditId: string | null;
  domain: string;
  status: "idle" | "running" | "completed" | "failed";
  agents: Record<string, AgentStatus>;
  browserFrames: BrowserFrame[];
  browserLiveUrl: string | null;
  logs: LogEntry[];
  popupReports: { url: string; popups: PopupDetection[] }[];
  businessType: BusinessType | null;
  technicalResult: TechnicalResult | null;
  contentResult: ContentResult | null;
  schemaResult: SchemaResult | null;
  geoResult: GEOResult | null;
  strategyResult: StrategyResult | null;
  overallScore: number | null;
  startAudit: (domain: string, auditId: string) => void;
  loadExistingAudit: (auditId: string, domain: string, results: StoredAuditResults) => void;
  handleStreamEvent: (event: StreamEvent) => void;
  setFailed: () => void;
  reset: () => void;
}

const INITIAL_AGENTS: Record<string, AgentStatus> = {
  crawler: { status: "pending" },
  technical: { status: "pending" },
  content: { status: "pending" },
  schema: { status: "pending" },
  geo: { status: "pending" },
  strategist: { status: "pending" },
};

export const useAuditStore = create<AuditStore>((set) => ({
  auditId: null,
  domain: "",
  status: "idle",
  agents: INITIAL_AGENTS,
  browserFrames: [],
  browserLiveUrl: null,
  logs: [],
  popupReports: [],
  businessType: null,
  technicalResult: null,
  contentResult: null,
  schemaResult: null,
  geoResult: null,
  strategyResult: null,
  overallScore: null,

  startAudit: (domain, auditId) => set({
    auditId, domain, status: "running",
    agents: INITIAL_AGENTS,
    browserFrames: [], browserLiveUrl: null, logs: [], popupReports: [],
    businessType: null,
    technicalResult: null, contentResult: null,
    schemaResult: null, geoResult: null, strategyResult: null,
    overallScore: null,
  }),

  loadExistingAudit: (auditId, domain, results) => set({
    auditId, domain, status: "completed",
    agents: {
      crawler: { status: "done" },
      technical: { status: "done" },
      content: { status: "done" },
      schema: { status: "done" },
      geo: { status: "done" },
      strategist: { status: "done" },
    },
    browserFrames: [], browserLiveUrl: null, logs: [], popupReports: [],
    businessType: results.businessType ?? null,
    technicalResult: results.technical ?? null,
    contentResult: results.content ?? null,
    schemaResult: results.schema ?? null,
    geoResult: results.geo ?? null,
    strategyResult: results.strategy ?? null,
    overallScore: results.strategy?.overallScore ?? null,
  }),

  handleStreamEvent: (event) => set((state) => {
    switch (event.type) {
      case "agent_status":
        return { agents: { ...state.agents, [event.agent]: { status: event.status, message: event.message } } };
      case "browser_frame": {
        const newFrames = [...state.browserFrames, { image: event.image, url: event.url, action: event.action, timestamp: Date.now() }];
        return { browserFrames: newFrames.slice(-50) };
      }
      case "browser_session":
        return { browserLiveUrl: event.liveUrl };
      case "log": {
        const entry: LogEntry = { timestamp: Date.now(), level: event.level, message: event.message };
        return { logs: [...state.logs, entry].slice(-200) }; // Keep last 200 logs
      }
      case "popup_report": {
        const report = { url: event.url, popups: event.popups };
        return { popupReports: [...state.popupReports, report] };
      }
      case "business_type":
        return { businessType: event.businessType };
      case "partial_result":
        if (event.agent === "technical") return { technicalResult: event.data as TechnicalResult };
        if (event.agent === "content") return { contentResult: event.data as ContentResult };
        if (event.agent === "schema") return { schemaResult: event.data as SchemaResult };
        if (event.agent === "geo") return { geoResult: event.data as GEOResult };
        if (event.agent === "strategist") return { strategyResult: event.data as StrategyResult };
        return {};
      case "score_update":
        if (event.category === "overall") return { overallScore: event.score };
        return {};
      case "audit_complete":
        return {
          status: "completed",
          technicalResult: (event.state as any).technical ?? state.technicalResult,
          contentResult: (event.state as any).content ?? state.contentResult,
          schemaResult: (event.state as any).schema ?? state.schemaResult,
          geoResult: (event.state as any).geo ?? state.geoResult,
          strategyResult: (event.state as any).strategy ?? state.strategyResult,
          overallScore: (event.state as any).strategy?.overallScore ?? state.overallScore,
        };
      default:
        return {};
    }
  }),

  setFailed: () => set({ status: "failed" }),

  reset: () => set({
    auditId: null, domain: "", status: "idle", agents: INITIAL_AGENTS,
    browserFrames: [], browserLiveUrl: null, logs: [], popupReports: [],
    businessType: null, technicalResult: null, contentResult: null,
    schemaResult: null, geoResult: null, strategyResult: null, overallScore: null,
  }),
}));
