// src/components/audit/agent-timeline.tsx
"use client";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const AGENTS = [
  { key: "crawler", label: "Site Crawler", icon: "🕷️" },
  { key: "technical", label: "Technical SEO", icon: "🔧" },
  { key: "content", label: "Content Quality", icon: "📝" },
  { key: "schema", label: "Schema Markup", icon: "🏷️" },
  { key: "geo", label: "GEO Analysis", icon: "🤖" },
  { key: "strategist", label: "Strategy Report", icon: "📊" },
];

type AgentStatus = { status: "pending" | "running" | "done" | "error"; message?: string };

interface AgentTimelineProps {
  agents: Record<string, AgentStatus>;
}

export function AgentTimeline({ agents }: AgentTimelineProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Audit Agents</p>
      {AGENTS.map((agent, i) => {
        const state = agents[agent.key] ?? { status: "pending" };
        return (
          <div key={agent.key} className="flex gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <StatusDot status={state.status} />
              {i < AGENTS.length - 1 && (
                <div className={`w-px flex-1 mt-1 ${state.status === "done" ? "bg-[var(--agent-done)]" : "bg-[var(--border)] border-dashed"}`} style={{ minHeight: 24 }} />
              )}
            </div>
            {/* Content */}
            <div className="pb-5 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">{agent.label}</span>
                <StatusBadge status={state.status} />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] truncate">
                {state.message ?? (state.status === "pending" ? "Waiting..." : "")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatus["status"] }) {
  if (status === "done") return (
    <div className="w-6 h-6 rounded-full bg-[var(--agent-done)] flex items-center justify-center shrink-0">
      <Check className="w-3.5 h-3.5 text-black" />
    </div>
  );
  if (status === "error") return (
    <div className="w-6 h-6 rounded-full bg-[var(--agent-error)] flex items-center justify-center shrink-0">
      <X className="w-3.5 h-3.5 text-white" />
    </div>
  );
  if (status === "running") return (
    <motion.div
      className="w-6 h-6 rounded-full border-2 border-[var(--agent-running)] shrink-0"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      style={{ borderTopColor: "transparent" }}
    />
  );
  return <div className="w-6 h-6 rounded-full border-2 border-[var(--agent-pending)] shrink-0" />;
}

function StatusBadge({ status }: { status: AgentStatus["status"] }) {
  const map = {
    pending: { label: "PENDING", className: "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]" },
    running: { label: "RUNNING", className: "bg-blue-950 text-blue-400" },
    done: { label: "DONE", className: "bg-green-950 text-green-400" },
    error: { label: "ERROR", className: "bg-red-950 text-red-400" },
  };
  const { label, className } = map[status];
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${className}`}>{label}</span>;
}
