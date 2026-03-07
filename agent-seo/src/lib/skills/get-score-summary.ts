import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAuditById } from "@/lib/db";

export const getScoreSummarySkill = (auditId: string) =>
  tool(
    async () => {
      const audit = await getAuditById(auditId);
      if (!audit) return "Audit not found.";
      return JSON.stringify({
        overall: audit.overall_score,
        technical: audit.technical_score,
        content: audit.content_score,
        schema: audit.schema_score,
        geo: audit.geo_score,
        businessType: audit.business_type,
        domain: audit.domain,
      }, null, 2);
    },
    {
      name: "get_score_summary",
      description:
        "Get the overall and per-category SEO scores for this audit. " +
        "Use this when the user asks about scores, ratings, or overall performance.",
      schema: z.object({}),
    }
  );
