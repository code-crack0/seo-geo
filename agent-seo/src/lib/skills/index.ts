export { searchAuditSkill } from "./search-audit";
export { getPageDetailsSkill } from "./get-page-details";
export { getTechnicalIssuesSkill } from "./get-technical-issues";
export { getScoreSummarySkill } from "./get-score-summary";

import { searchAuditSkill } from "./search-audit";
import { getPageDetailsSkill } from "./get-page-details";
import { getTechnicalIssuesSkill } from "./get-technical-issues";
import { getScoreSummarySkill } from "./get-score-summary";

/** Build all chat skills for a given audit session */
export function buildAuditSkills(auditId: string) {
  return [
    searchAuditSkill(auditId),
    getPageDetailsSkill(auditId),
    getTechnicalIssuesSkill(auditId),
    getScoreSummarySkill(auditId),
  ];
}
