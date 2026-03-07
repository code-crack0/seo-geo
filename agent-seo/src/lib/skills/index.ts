import { searchAuditSkill } from "./search-audit";
import { getPageDetailsSkill } from "./get-page-details";
import { getTechnicalIssuesSkill } from "./get-technical-issues";
import { getScoreSummarySkill } from "./get-score-summary";

export { searchAuditSkill, getPageDetailsSkill, getTechnicalIssuesSkill, getScoreSummarySkill };

/** Build all chat skills for a given audit session */
export function buildAuditSkills(auditId: string) {
  return [
    searchAuditSkill(auditId),
    getPageDetailsSkill(auditId),
    getTechnicalIssuesSkill(auditId),
    getScoreSummarySkill(auditId),
  ];
}
