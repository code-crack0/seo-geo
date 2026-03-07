// app/api/chat/route.ts
import { createDataStreamResponse, formatDataStreamPart } from "ai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { buildAuditSkills } from "@/lib/skills";
import { getAuditById } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert SEO consultant analyzing a website audit.
You have access to the full audit data through your tools. ALWAYS use search_audit_data
before saying you don't know something — the answer is almost always in the audit results.

When answering:
- Be specific and actionable (exact URLs, exact scores, exact issues)
- Prioritize critical issues over minor ones
- Reference specific data points from the audit
- For score questions, use get_score_summary first
- For specific page questions, use get_page_details`;

type IncomingMessage = { role: string; content: string | { type: string; text?: string }[] };

function toLangChainMessages(messages: IncomingMessage[]): BaseMessage[] {
  return messages.map((m) => {
    const text =
      typeof m.content === "string"
        ? m.content
        : m.content
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text ?? "")
            .join(" ");
    if (m.role === "user") return new HumanMessage(text);
    if (m.role === "assistant") return new AIMessage(text);
    return new SystemMessage(text);
  });
}

export async function POST(req: Request) {
  const { messages, auditId } = (await req.json()) as {
    messages: IncomingMessage[];
    auditId?: string;
  };

  if (!auditId) {
    return Response.json({ error: "auditId is required" }, { status: 400 });
  }

  const audit = await getAuditById(auditId);
  if (!audit) {
    return Response.json({ error: "Audit not found" }, { status: 404 });
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-pro",
    apiKey: process.env.GEMINI_API_KEY!,
    streaming: true,
  });

  const skills = buildAuditSkills(auditId);

  const agent = createReactAgent({
    llm: model,
    tools: skills,
    stateModifier: SYSTEM_PROMPT,
  });

  const lcMessages = toLangChainMessages(messages);

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const eventStream = agent.streamEvents(
        { messages: lcMessages },
        { version: "v2", recursionLimit: 10 }
      );

      for await (const event of eventStream) {
        // Notify UI when a skill tool starts
        if (event.event === "on_tool_start") {
          dataStream.writeData({ type: "tool_call", tool: event.name as string, status: "running" });
        }

        // Notify UI when a skill tool finishes
        if (event.event === "on_tool_end") {
          dataStream.writeData({ type: "tool_call", tool: event.name as string, status: "done" });
        }

        // Stream text tokens from the LLM as they arrive
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          const content = chunk?.content;
          if (typeof content === "string" && content) {
            dataStream.write(formatDataStreamPart("text", content));
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === "text" && typeof part.text === "string" && part.text) {
                dataStream.write(formatDataStreamPart("text", part.text));
              }
            }
          }
        }
      }
    },
  });
}
