import { Annotation, type StateType } from "@langchain/langgraph";
import type { DataStreamWriter } from "ai";
import type {
  CrawlerResult,
  TechnicalResult,
  ContentResult,
  SchemaResult,
  GEOResult,
  StrategyResult,
} from "@/lib/types";

/**
 * Non-serializable runtime values passed via graph config (not stored in state).
 */
export interface AuditGraphConfig {
  dataStream: DataStreamWriter;
}

/**
 * LangGraph state schema for the audit graph.
 *
 * Fields that may be written by parallel nodes (agentErrors) use a reducer
 * so concurrent updates are concatenated rather than overwritten.
 */
export const AuditGraphState = Annotation.Root({
  /**
   * Required at invocation time — no default by design.
   * Must be provided when invoking the graph (e.g. graph.invoke({ auditId, domain })).
   */
  auditId: Annotation<string>,
  /**
   * Required at invocation time — no default by design.
   * Must be provided when invoking the graph (e.g. graph.invoke({ auditId, domain })).
   */
  domain: Annotation<string>,
  status: Annotation<
    "crawling" | "analyzing" | "synthesizing" | "completed" | "failed"
  >({
    default: () => "crawling",
    reducer: (_, next) => next,
  }),
  sessionId: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  liveUrl: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  crawler: Annotation<CrawlerResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  technical: Annotation<TechnicalResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  content: Annotation<ContentResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  schema: Annotation<SchemaResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  geo: Annotation<GEOResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  strategy: Annotation<StrategyResult | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  /** Errors collected from parallel agent nodes — concat reducer prevents overwrites */
  agentErrors: Annotation<Array<{ agent: string; error: string }>>({
    default: () => [],
    reducer: (curr, upd) => curr.concat(upd),
  }),
});

export type AuditGraphStateType = StateType<typeof AuditGraphState.spec>;
