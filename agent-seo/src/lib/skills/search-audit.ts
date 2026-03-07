import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchChunks } from "@/lib/embeddings";

export const searchAuditSkill = (auditId: string) =>
  tool(
    async ({ query }) => {
      const chunks = await searchChunks(auditId, query, 8);
      if (chunks.length === 0) return "No relevant information found for that query.";
      return chunks.map((c) => `[${c.chunkType}] ${c.content}`).join("\n\n---\n\n");
    },
    {
      name: "search_audit_data",
      description:
        "Search the full SEO audit results for this website. Use this to answer ANY question about " +
        "scores, technical issues, content quality, schema markup, GEO visibility, recommendations, " +
        "or quick wins. Always use this before saying you don't know something.",
      schema: z.object({
        query: z.string().describe("What to search for — be specific, e.g. 'Core Web Vitals LCP score' or 'missing schema types'"),
      }),
    }
  );
