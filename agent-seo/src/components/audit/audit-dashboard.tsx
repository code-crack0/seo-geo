// src/components/audit/audit-dashboard.tsx
"use client";
import { useEffect } from "react";
import { useAuditStore } from "@/stores/audit-store";
import { AgentTimeline } from "./agent-timeline";
import { LiveBrowser } from "./live-browser";
import { ScoreOverview } from "./score-overview";
import { TechnicalCard } from "./technical-card";
import { ContentCard } from "./content-card";
import { SchemaCard } from "./schema-card";
import { GEOCard } from "./geo-card";
import { ActionsList } from "./actions-list";
import { ContentBriefs } from "./content-briefs";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ResultCardSkeleton, BrowserSkeleton } from "@/components/audit/skeletons";
import { motion } from "framer-motion";
import Link from "next/link";

function NoDataCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex items-center justify-center min-h-[80px]">
      <p className="text-xs text-[var(--text-tertiary)]">{label} — no data recorded</p>
    </div>
  );
}

interface StoredAuditResults {
  technical?: unknown;
  content?: unknown;
  schema?: unknown;
  geo?: unknown;
  strategy?: unknown;
  businessType?: unknown;
}

export function AuditDashboard({
  auditId,
  domain,
  existingAudit,
}: {
  auditId: string;
  domain: string;
  existingAudit?: StoredAuditResults;
}) {
  const {
    agents,
    browserFrames,
    browserLiveUrl,
    logs,
    popupReports,
    status,
    technicalResult,
    contentResult,
    schemaResult,
    geoResult,
    strategyResult,
    overallScore,
    businessType,
    domain: storeDomain,
    startAudit,
    loadExistingAudit,
    handleStreamEvent,
    setFailed,
  } = useAuditStore();

  const isLive = status === "running";
  const currentAgent = Object.entries(agents).find(([, v]) => v.status === "running")?.[0];

  useEffect(() => {
    if (!auditId || !domain) return;

    // If this is a completed audit with stored results, hydrate from DB
    if (existingAudit) {
      loadExistingAudit(auditId, domain, existingAudit as Parameters<typeof loadExistingAudit>[2]);
      return;
    }

    // Otherwise start a live streaming audit
    const controller = new AbortController();

    async function startStreaming() {
      startAudit(domain, auditId);

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";
        const response = await fetch(`${backendUrl}/api/audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, auditId }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setFailed();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("2:")) {
              // Vercel AI SDK data stream: 2:[...array of events...]
              try {
                const arr = JSON.parse(line.slice(2));
                if (Array.isArray(arr)) {
                  for (const event of arr) {
                    handleStreamEvent(event);
                  }
                }
              } catch {
                // Ignore malformed data stream lines
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setFailed();
        }
      }
    }

    startStreaming();

    return () => {
      controller.abort();
    };
  // Zustand actions have stable refs — safe to omit; existingAudit is stable (server prop)
  }, [auditId, domain, existingAudit]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayDomain = storeDomain || domain;

  if (status === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-[var(--text-secondary)]">The audit failed. Please try again.</p>
          <Link href="/" className="text-[var(--accent)] hover:underline">← Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      <header className="h-14 border-b border-[var(--border)] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-lg hover:opacity-80 transition-opacity">AgentSEO<span className="text-[var(--accent)]">.</span></Link>
          {displayDomain && <span className="text-[var(--text-secondary)] font-medium truncate max-w-[160px] sm:max-w-xs">{displayDomain}</span>}
          {businessType && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">{businessType}</span>}
        </div>
        <Link href="/" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">+ New Audit</Link>
      </header>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[280px_1fr_380px] overflow-hidden">
        {/* Left sidebar */}
        <aside className="hidden lg:block border-r border-[var(--border)] overflow-y-auto p-4 space-y-6">
          <AgentTimeline agents={agents} />
          <ScoreOverview
            overall={overallScore}
            technical={technicalResult?.score ?? null}
            content={contentResult?.score ?? null}
            schema={schemaResult?.score ?? null}
            geo={geoResult?.aiVisibilityScore ?? null}
          />
        </aside>

        {/* Center main */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--text-tertiary)] uppercase font-semibold mb-2">
              {existingAudit ? "Browser Recording" : "Live Browser View"}
            </p>
            {!existingAudit && browserFrames.length === 0 && logs.length === 0 ? (
              <BrowserSkeleton />
            ) : (
              <LiveBrowser
                frames={browserFrames}
                isLive={isLive}
                agentName={currentAgent ? `${currentAgent} agent` : undefined}
                liveUrl={browserLiveUrl}
                logs={logs}
                popupReports={popupReports}
                sessionEnded={!!existingAudit}
              />
            )}
          </div>

          <div className="p-4 space-y-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase font-semibold">Results Grid</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {technicalResult ? <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}><TechnicalCard result={technicalResult} /></motion.div> : (existingAudit ? <NoDataCard label="Technical SEO" /> : <ResultCardSkeleton />)}
              {contentResult ? <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}><ContentCard result={contentResult} /></motion.div> : (existingAudit ? <NoDataCard label="Content Quality" /> : <ResultCardSkeleton />)}
              {schemaResult ? <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}><SchemaCard result={schemaResult} /></motion.div> : (existingAudit ? <NoDataCard label="Schema Markup" /> : <ResultCardSkeleton />)}
              {geoResult ? <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}><GEOCard result={geoResult} /></motion.div> : (existingAudit ? <NoDataCard label="AI Visibility (GEO)" /> : <ResultCardSkeleton />)}
            </div>
            {strategyResult && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="space-y-6">
                <ActionsList actions={strategyResult.prioritizedActions} />
                <ContentBriefs briefs={strategyResult.contentBriefs} />
              </motion.div>
            )}
          </div>
        </main>

        {/* Right chat */}
        <aside className="hidden lg:block border-l border-[var(--border)] overflow-hidden">
          <ChatPanel auditId={auditId} />
        </aside>
      </div>
    </div>
  );
}
