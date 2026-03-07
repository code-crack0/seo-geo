import { Annotation, type StateType } from "@langchain/langgraph";
import type { DataStreamWriter } from "ai";

/**
 * Non-serializable runtime values passed via graph config (not stored in state).
 */
export interface AuditGraphConfig {
  auditId: string;
  domain: string;
  dataStream: DataStreamWriter;
}

/**
 * LangGraph state schema for the audit graph.
 *
 * Fields that may be written by parallel nodes (agentErrors) use a reducer
 * so concurrent updates are concatenated rather than overwritten.
 */
export const AuditGraphState = Annotation.Root({
  auditId: Annotation<string>,
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
  crawler: Annotation<unknown | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  technical: Annotation<unknown | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  content: Annotation<unknown | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  schema: Annotation<unknown | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  geo: Annotation<unknown | undefined>({
    default: () => undefined,
    reducer: (_, next) => next,
  }),
  strategy: Annotation<unknown | undefined>({
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
