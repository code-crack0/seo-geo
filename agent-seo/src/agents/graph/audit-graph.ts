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
  handleErrorNode,
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
  return [
    new Send("technical", state),
    new Send("content", state),
    new Send("schema", state),
    new Send("geo", state),
  ];
}

// ── Graph assembly ─────────────────────────────────────────────────────────────

const graph = new StateGraph(AuditGraphState)
  // Register nodes
  .addNode("initBrowser", initBrowserNode)
  .addNode("crawl", crawlNode)
  .addNode("technical", technicalNode)
  .addNode("content", contentNode)
  .addNode("schema", schemaNode)
  .addNode("geo", geoNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("save", saveNode)
  .addNode("handleError", handleErrorNode)

  // Entry edge
  .addEdge(START, "initBrowser")
  .addEdge("initBrowser", "crawl")

  // Conditional fan-out after crawl
  .addConditionalEdges("crawl", crawlRouter, {
    synthesize: "synthesize",
    technical: "technical",
    content: "content",
    schema: "schema",
    geo: "geo",
  })

  // All four parallel agents converge at synthesize
  .addEdge("technical", "synthesize")
  .addEdge("content", "synthesize")
  .addEdge("schema", "synthesize")
  .addEdge("geo", "synthesize")

  // Sequential tail
  .addEdge("synthesize", "save")
  .addEdge("save", END)

  // Standalone error sink
  .addEdge("handleError", END);

// ── Compile with MemorySaver checkpointer ─────────────────────────────────────

const checkpointer = new MemorySaver();

export const auditGraph = graph.compile({ checkpointer });
