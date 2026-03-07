import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getAuditById } from "@/lib/db";

export const getTechnicalIssuesSkill = (auditId: string) =>
  tool(
    async ({ severity }) => {
      const audit = await getAuditById(auditId);
      const results = audit?.results as Record<string, unknown> | null;
      const issues = (results?.technical as { issues?: unknown[] })?.issues ?? [];
      const filtered = severity
        ? issues.filter((i) => (i as { severity: string }).severity === severity)
        : issues;
      if (filtered.length === 0) return `No ${severity ?? ""} technical issues found.`;
      return JSON.stringify(filtered, null, 2);
    },
    {
      name: "get_technical_issues",
      description:
        "Get the list of technical SEO issues found on this website. " +
        "Optionally filter by severity: critical, warning, or info.",
      schema: z.object({
        severity: z.enum(["critical", "warning", "info"]).optional().describe("Filter by severity level"),
      }),
    }
  );
