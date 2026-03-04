// app/page.tsx
export const dynamic = "force-dynamic";
import { AuditInput } from "@/components/audit/audit-input";
import { Badge } from "@/components/ui/badge";
import { getRecentAudits as fetchRecentAudits } from "@/lib/db";
import { scoreToColor } from "@/lib/utils";
import Link from "next/link";
const AGENTS = [
  { icon: "🕷️", name: "Crawler" },
  { icon: "🔧", name: "Technical" },
  { icon: "📝", name: "Content" },
  { icon: "🏷️", name: "Schema" },
  { icon: "🤖", name: "GEO" },
  { icon: "📊", name: "Strategist" },
];

const FEATURES = ["Technical SEO", "E-E-A-T Analysis", "Schema Validation", "AI Visibility (GEO)"];

async function getRecentAudits() {
  try {
    return await fetchRecentAudits(5);
  } catch {
    return [];
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusVariant(status: string): "good" | "critical" | "info" {
  if (status === "completed") return "good";
  if (status === "failed") return "critical";
  return "info";
}

export default async function HomePage() {
  const recentAudits = await getRecentAudits();

  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section
        className="flex flex-col items-center justify-center px-4 sm:px-8 pt-24 pb-16 text-center"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(13,148,136,0.25) 0%, transparent 70%), var(--bg-primary)" }}
      >
        <Link href="/" className="mb-12 text-2xl font-bold tracking-tight text-[var(--text-secondary)]">
          Agent<span className="text-[var(--text-primary)]">SEO</span>
          <span className="text-[var(--accent)]">.</span>
        </Link>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl animate-fade-in">
          See how AI sees your website
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-2xl mb-10 animate-fade-in-delay">
          Multi-agent SEO & GEO intelligence. Technical audits, content analysis, schema validation, and AI visibility scoring — powered by autonomous agents that browse the web in real-time.
        </p>
        <AuditInput />
        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {FEATURES.map((f) => (
            <span key={f} className="px-3 py-1 rounded-full border border-[var(--border)] text-sm text-[var(--text-secondary)]">{f}</span>
          ))}
        </div>
        {/* Agent pipeline */}
        <div className="flex items-center gap-2 mt-12 flex-wrap justify-center">
          {AGENTS.map((agent, i) => (
            <div key={agent.name} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">{agent.icon}</span>
                <span className="text-xs text-[var(--text-tertiary)] font-medium">{agent.name}</span>
              </div>
              {i < AGENTS.length - 1 && <span className="text-[var(--text-tertiary)] mx-1">→</span>}
            </div>
          ))}
        </div>
      </section>
      {/* Recent Audits */}
      <section className="px-4 sm:px-8 pb-16 max-w-6xl mx-auto w-full">
        {recentAudits.length > 0 ? (
          <div className="mt-8 space-y-2">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Recent Audits</p>
            {recentAudits.map((audit) => (
              <Link
                key={audit.id}
                href={`/audit/${audit.id}?domain=${encodeURIComponent(audit.domain)}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors border border-[var(--border)]"
              >
                <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate">{audit.domain}</span>
                <Badge variant={statusVariant(audit.status)}>{audit.status}</Badge>
                <span
                  className="text-sm font-mono"
                  style={{ color: audit.overall_score !== null ? scoreToColor(audit.overall_score!) : "var(--text-tertiary)" }}
                >
                  {audit.overall_score ?? "—"}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">{timeAgo(new Date(audit.created_at))}</span>
              </Link>
            ))}
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[var(--text-secondary)] mb-4">Recent Audits</h2>
            <p className="text-sm text-[var(--text-tertiary)]">No audits yet. Start your first audit above.</p>
          </>
        )}
      </section>
      <footer className="mt-auto py-6 text-center text-sm text-[var(--text-tertiary)]">
        Built with AI Agents • Vercel AI SDK + Playwright
      </footer>
    </main>
  );
}
