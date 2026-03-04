// app/api/chat/route.ts
import { streamText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { defaultModel } from "@/lib/ai";
import { getAuditById, getPageByUrl } from "@/lib/db";
import { searchChunks } from "@/lib/embeddings";
import type { AuditState } from "@/lib/types";

export async function POST(req: Request) {
  const { messages, auditId } = await req.json() as {
    messages: CoreMessage[];
    auditId?: string;
  };

  let systemPrompt = `You are an SEO & GEO expert assistant. Answer questions clearly and actionably.`;

  if (auditId) {
    const audit = await getAuditById(auditId);

    if (audit) {
      const overview = [
        audit.domain ? `Domain: ${audit.domain}` : null,
        audit.business_type ? `Business type: ${audit.business_type}` : null,
        audit.overall_score != null ? `Overall score: ${audit.overall_score}` : null,
        audit.technical_score != null ? `Technical: ${audit.technical_score}` : null,
        audit.content_score != null ? `Content: ${audit.content_score}` : null,
        audit.schema_score != null ? `Schema: ${audit.schema_score}` : null,
        audit.geo_score != null ? `GEO AI Visibility: ${audit.geo_score}` : null,
      ].filter(Boolean).join(" | ");

      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const rawContent = lastUserMsg?.content;
      const query = typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.filter((p): p is { type: "text"; text: string } => (p as { type: string }).type === "text").map((p) => p.text).join(" ")
          : "SEO audit summary";

      let contextBlocks = "";
      try {
        const chunks = await searchChunks(auditId, query);
        contextBlocks = chunks.map((c) => `[${c.chunkType}] ${c.content}`).join("\n\n");
      } catch {
        if (audit.results) {
          try {
            const state = (typeof audit.results === "string"
              ? JSON.parse(audit.results)
              : audit.results) as AuditState;
            contextBlocks = `Quick wins: ${(state.strategy?.quickWins ?? []).join("; ")}`;
          } catch { /* leave empty */ }
        }
      }

      systemPrompt = `You are an SEO & GEO expert assistant. Answer questions about this audit specifically.

AUDIT OVERVIEW: ${overview}

RELEVANT AUDIT DATA:
${contextBlocks}

Instructions: Be specific and reference actual findings from the data above. When asked about a specific page, use the getPageDetails tool.`;
    }
  }

  const result = streamText({
    model: defaultModel,
    system: systemPrompt,
    messages,
    tools: auditId ? {
      getPageDetails: tool({
        description: "Get detailed HTML metadata for a specific page URL from the audit",
        parameters: z.object({ url: z.string().describe("The full page URL to inspect") }),
        execute: async ({ url }) => {
          const page = await getPageByUrl(auditId, url);
          if (!page) return { error: "Page not found in audit data" };
          if (!page.html) return { url: page.url, error: "Page HTML not available", hasScreenshot: Boolean(page.screenshot) };
          const titleMatch = page.html?.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
          const descMatch = page.html?.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,200})["']/i);
          const h1Match = page.html?.match(/<h1[^>]*>([^<]{1,120})<\/h1>/i);
          return {
            url: page.url,
            title: titleMatch?.[1]?.trim() ?? null,
            metaDescription: descMatch?.[1]?.trim() ?? null,
            h1: h1Match?.[1]?.trim() ?? null,
            hasScreenshot: Boolean(page.screenshot),
            wordCount: (page.html?.match(/\b\w+\b/g) ?? []).length,
          };
        },
      }),
    } : undefined,
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}
