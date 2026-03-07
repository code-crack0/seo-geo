// src/agents/graph/audit-graph.ts
// Assembles all nodes into a compiled LangGraph StateGraph with parallel fan-out.
//
// Graph structure:
//   START → initBrowserNode → crawlNode → [conditional routing]
//                                              ↓
//     pageUrls.length === 0 → synthesizeNode (skip analysis)
//     pageUrls.length  > 0  → Send x4: technicalNode, contentNode, schemaNode, geoNode
//                              (all four converge to synthesizeNode via static edges)
//   synthesizeNode → saveNode → END
//   handleErrorNode → END  (standalone error sink)

import { StateGraph, START, END, Send, MemorySaver } from "@langchain/langgraph";

import { AuditGraphState, type AuditGraphStateType } from "./state";
import {
  initBrowserNode,
  crawlNode,
  technicalNode,
  contentNode,
  schemaNode,
  geoNode,
  synthesizeNode,
  saveNode,
} from "./nodes";

// ── Conditional router ─────────────────────────────────────────────────────────

/**
 * After crawlNode completes, decide whether to fan out to parallel analysis
 * nodes or skip directly to synthesis (when no pages were found).
 *
 * LangGraph v1 conditional-edge routers may return either:
 *   - a string  → node name to route to
 *   - Send[]    → fan-out to multiple nodes in parallel (each receives a full
 *                 copy of the current state as its input)
 */
function crawlRouter(
  state: AuditGraphStateType,
): string | Send[] {
  const pageCount = state.crawler?.pageUrls?.length ?? 0;

  if (pageCount === 0) {
    // Nothing to analyse — jump straight to synthesis
    return "synthesize";
  }

  // Fan out to all four parallel analysis agents, each receiving the full state
  // Note: node names are prefixed with "run_" to avoid collision with state
  // attribute names (technical/content/schema/geo) which LangGraph 1.x disallows.
  return [
    new Send("run_technical", state),
    new Send("run_content", state),
    new Send("run_schema", state),
    new Send("run_geo", state),
  ];
}

// ── Graph assembly ─────────────────────────────────────────────────────────────

const graph = new StateGraph(AuditGraphState)
  // Register nodes
  .addNode("initBrowser", initBrowserNode)
  .addNode("crawl", crawlNode)
  .addNode("run_technical", technicalNode)
  .addNode("run_content", contentNode)
  .addNode("run_schema", schemaNode)
  .addNode("run_geo", geoNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("save", saveNode)
  // Entry edge
  .addEdge(START, "initBrowser")
  .addEdge("initBrowser", "crawl")

  // Conditional fan-out after crawl
  .addConditionalEdges("crawl", crawlRouter, {
    synthesize: "synthesize",
    run_technical: "run_technical",
    run_content: "run_content",
    run_schema: "run_schema",
    run_geo: "run_geo",
  })

  // All four parallel agents converge at synthesize
  .addEdge("run_technical", "synthesize")
  .addEdge("run_content", "synthesize")
  .addEdge("run_schema", "synthesize")
  .addEdge("run_geo", "synthesize")

  // Sequential tail
  .addEdge("synthesize", "save")
  .addEdge("save", END);

// ── Compile with MemorySaver checkpointer ─────────────────────────────────────

const checkpointer = new MemorySaver();

export const auditGraph = graph.compile({ checkpointer });
