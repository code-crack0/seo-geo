// app/audit/[id]/page.tsx
import { redirect } from "next/navigation";
import { getAuditById } from "@/lib/db";
import { AuditDashboard } from "@/components/audit/audit-dashboard";

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ domain?: string }>;
}) {
  const { id } = await params;
  const { domain = "" } = await searchParams;

  const existing = await getAuditById(id);

  // Completed audit with stored results — hydrate from DB
  if (existing?.status === "completed" && existing.results) {
    const storedResults = typeof existing.results === "string"
      ? JSON.parse(existing.results)
      : existing.results;
    return (
      <AuditDashboard
        auditId={id}
        domain={existing.domain}
        existingAudit={storedResults}
      />
    );
  }

  // Running or new audit — need domain from query param
  if (!domain) redirect("/");
  return <AuditDashboard auditId={id} domain={domain} />;
}
