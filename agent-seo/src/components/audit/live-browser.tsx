// src/components/audit/live-browser.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Terminal, AlertTriangle, Layers } from "lucide-react";
import type { LogEntry, PopupDetection } from "@/lib/types";

interface BrowserFrame {
  image: string;
  url: string;
  action: string;
  timestamp: number;
}

interface LiveBrowserProps {
  frames: BrowserFrame[];
  isLive: boolean;
  agentName?: string;
  liveUrl?: string | null;
  logs?: LogEntry[];
  popupReports?: { url: string; popups: PopupDetection[] }[];
  sessionEnded?: boolean;
}

type Tab = "live" | "snapshots" | "logs" | "popups";

export function LiveBrowser({ frames, isLive, agentName, liveUrl, logs = [], popupReports = [], sessionEnded = false }: LiveBrowserProps) {
  const [activeTab, setActiveTab] = useState<Tab>(liveUrl ? "live" : "snapshots");
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isLogsAtBottomRef = useRef(true);
  const displayFrame: BrowserFrame | undefined = selectedFrame !== null ? frames[selectedFrame] : frames[frames.length - 1];
  const totalBannersBlocking = popupReports.flatMap(r => r.popups).filter(p => p.blocksContent).length;

  const handleLogsScroll = () => {
    const el = logsContainerRef.current;
    if (!el) return;
    isLogsAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Auto-scroll logs only when user is already at the bottom
  useEffect(() => {
    if (activeTab === "logs" && isLogsAtBottomRef.current) {
      logsEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [logs, activeTab]);

  // When user switches to the logs tab, snap to bottom and re-enable auto-scroll
  useEffect(() => {
    if (activeTab === "logs") {
      isLogsAtBottomRef.current = true;
      logsEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [activeTab]);

  // When audit completes and no session, switch to snapshots
  useEffect(() => {
    if (!isLive && !liveUrl && frames.length > 0) setActiveTab("snapshots");
  }, [isLive, liveUrl, frames.length]);

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[#1a1a1f] flex flex-col">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-tertiary)] border-b border-[var(--border)] shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>

        {/* URL bar */}
        <div className="flex-1 bg-[var(--bg-secondary)] rounded-md px-3 py-1 text-xs text-[var(--text-tertiary)] font-mono truncate">
          {displayFrame?.url ?? "—"}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isLive && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold text-green-400">LIVE</span>
            </div>
          )}
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer"
              className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              title="Open live session in new tab">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        {liveUrl && (
          <TabButton active={activeTab === "live"} onClick={() => setActiveTab("live")}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live View
            </span>
          </TabButton>
        )}
        <TabButton active={activeTab === "snapshots"} onClick={() => setActiveTab("snapshots")}>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3" />
            Snapshots {frames.length > 0 && <span className="opacity-50 text-[10px]">({frames.length})</span>}
          </span>
        </TabButton>
        <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            Logs {logs.length > 0 && <span className="opacity-50 text-[10px]">({logs.length})</span>}
          </span>
        </TabButton>
        <TabButton active={activeTab === "popups"} onClick={() => setActiveTab("popups")}>
          Popups
          {totalBannersBlocking > 0 && (
            <span className="ml-1 text-[10px] text-yellow-400">{totalBannersBlocking} blocking</span>
          )}
        </TabButton>
      </div>

      {/* ── LIVE VIEW (Browser-Use iframe) ── */}
      {activeTab === "live" && (
        <div className="relative" style={{ aspectRatio: "16/9" }}>
          {liveUrl ? (
            <iframe
              src={liveUrl}
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write"
              title="Browser-Use live session"
            />
          ) : (
            <PlaceholderView isLive={isLive} sessionEnded={sessionEnded} />
          )}
          {/* Agent label overlay */}
          {agentName && isLive && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-xs">
              <span className="text-green-400 font-medium">{agentName}</span>
              {displayFrame && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="text-white/70 truncate">{displayFrame.action}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SNAPSHOTS TAB ── */}
      {activeTab === "snapshots" && (
        <>
          <div className={`relative bg-[var(--bg-primary)] ${displayFrame ? "" : sessionEnded ? "py-8" : ""}`} style={displayFrame || sessionEnded ? undefined : { aspectRatio: "16/9" }}>
            {displayFrame ? (
              <img src={displayFrame.image} alt="Browser snapshot" className="w-full h-full object-contain" />
            ) : (
              <PlaceholderView isLive={isLive} sessionEnded={sessionEnded} />
            )}
          </div>

          {/* Agent status bar */}
          {agentName && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-tertiary)] border-t border-[var(--border)] shrink-0">
              <div className="w-5 h-5 rounded-full bg-[var(--accent-bg)] border border-[var(--accent)] flex items-center justify-center text-[10px]">🤖</div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-[var(--text-primary)]">{agentName}</span>
                <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                <span className="text-xs text-[var(--text-secondary)] truncate">{displayFrame?.action ?? "Initializing…"}</span>
              </div>
            </div>
          )}

          {/* Filmstrip */}
          {frames.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] border-t border-[var(--border)] overflow-x-auto shrink-0">
              <button aria-label="Previous"
                onClick={() => setSelectedFrame(Math.max(0, (selectedFrame ?? frames.length - 1) - 1))}
                className="shrink-0 p-1 hover:text-[var(--text-primary)] text-[var(--text-tertiary)]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {frames.slice(-10).map((frame, i) => {
                const absIdx = Math.max(0, frames.length - 10) + i;
                const isSel = selectedFrame === absIdx || (selectedFrame === null && absIdx === frames.length - 1);
                return (
                  <button key={absIdx} onClick={() => setSelectedFrame(absIdx)}
                    className={`shrink-0 w-14 h-9 rounded overflow-hidden border transition-colors ${isSel ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                    <img src={frame.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                );
              })}
              <button aria-label="Jump to latest frame" onClick={() => setSelectedFrame(null)}
                className="shrink-0 p-1 hover:text-[var(--text-primary)] text-[var(--text-tertiary)]"
                title="Jump to latest (auto-follow)">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── LOGS TAB ── */}
      {activeTab === "logs" && (
        <div
          ref={logsContainerRef}
          onScroll={handleLogsScroll}
          className="h-72 overflow-y-auto bg-[#0c0c10] font-mono text-xs p-3 space-y-0.5"
        >
          {logs.length === 0 ? (
            <div className="flex items-center gap-2 text-[var(--text-tertiary)] mt-6 justify-center">
              <Terminal className="w-4 h-4" />
              <span>{sessionEnded ? "Logs not stored for completed sessions" : "Waiting for logs…"}</span>
            </div>
          ) : (
            logs.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} className="flex gap-2 leading-5">
                <span className="text-[var(--text-tertiary)] shrink-0 select-none">{formatTime(entry.timestamp)}</span>
                <span className={`${logColor(entry.level)} shrink-0`}>
                  {entry.level === "warn" ? "⚠" : entry.level === "error" ? "✕" : "›"}
                </span>
                <span className={`${logColor(entry.level)} break-all whitespace-pre-wrap`}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* ── POPUPS TAB ── */}
      {activeTab === "popups" && (
        <div className="max-h-72 overflow-y-auto">
          {popupReports.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] p-4">No popups or cookie banners detected yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {popupReports.map((report) => (
                <div key={report.url} className="p-3 space-y-2">
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">{report.url}</p>
                  {report.popups.map((popup, j) => (
                    <PopupBadge key={`${popup.selector}-${j}`} popup={popup} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlaceholderView({ isLive, sessionEnded }: { isLive: boolean; sessionEnded: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]">
      {sessionEnded ? (
        <span>Snapshots not stored for completed sessions</span>
      ) : isLive ? (
        <>
          <div className="w-7 h-7 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <span>Initializing browser session…</span>
        </>
      ) : (
        <span>No browser activity yet</span>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: import("react").ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
        active
          ? "border-[var(--accent)] text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      }`}>
      {children}
    </button>
  );
}

function PopupBadge({ popup }: { popup: PopupDetection }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg p-2 text-xs ${popup.blocksContent ? "bg-yellow-950/40" : "bg-[var(--bg-tertiary)]"}`}>
      {popup.blocksContent && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />}
      <div className="min-w-0 space-y-0.5">
        <div>
          <span className="font-medium text-[var(--text-primary)] capitalize">{popup.bannerType} banner</span>
          <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
          <span className="text-[var(--text-tertiary)]">{popup.viewportCoveragePercent}% viewport · {popup.position}</span>
          {popup.blocksContent && <span className="ml-1.5 text-yellow-400 font-semibold">blocks content</span>}
        </div>
        <p className="font-mono text-[10px] text-[var(--text-tertiary)] truncate">{popup.selector}</p>
      </div>
    </div>
  );
}

function logColor(level: LogEntry["level"]): string {
  if (level === "warn") return "text-yellow-400";
  if (level === "error") return "text-red-400";
  return "text-[#8b8ba7]";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n: number) { return String(n).padStart(2, "0"); }
