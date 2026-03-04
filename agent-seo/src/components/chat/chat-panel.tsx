// src/components/chat/chat-panel.tsx
"use client";
import { useChat } from "ai/react";
import { Send, Loader2, MessageSquareOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuditStore } from "@/stores/audit-store";

const QUICK_ACTIONS = ["Explain GEO gaps", "What schema is missing?", "Show critical issues"];

/**
 * Polls /api/embed/status until embeddings are ready.
 * If the audit is done but embeddings don't exist yet (historical audits),
 * automatically triggers /api/embed once before polling.
 */
function useEmbedStatus(auditId: string, auditDone: boolean) {
  const [ready, setReady] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (!auditDone || !auditId) return;

    let cancelled = false;

    const poll = async () => {
      // First check: if not ready and haven't triggered yet, call /api/embed
      // This handles historical audits that completed before the embed system existed
      try {
        const statusRes = await fetch(`/api/embed/status?auditId=${auditId}`);
        const statusData = await statusRes.json() as { ready: boolean };
        if (statusData.ready) { setReady(true); return; }
      } catch { /* ignore */ }

      // Not ready — trigger embed if not already triggered (handles historical audits)
      if (!triggered.current) {
        triggered.current = true;
        try {
          // Proxy through Vercel /api/embed which forwards to Railway backend
          await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ auditId }),
          });
        } catch { /* embedding trigger failed — will keep polling */ }
      }

      if (cancelled) return;

      // Poll every 2s until ready
      while (!cancelled) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await fetch(`/api/embed/status?auditId=${auditId}`);
          const data = await res.json() as { ready: boolean };
          if (data.ready) { setReady(true); return; }
        } catch { /* ignore network errors during poll */ }
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [auditId, auditDone]);

  return ready;
}

export function ChatPanel({ auditId }: { auditId: string }) {
  const status = useAuditStore(s => s.status);
  const auditDone = status === "completed" || status === "failed";
  const embedReady = useEmbedStatus(auditId, auditDone);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
    api: "/api/chat",
    body: { auditId },
  });

  const messagesRef = useRef<HTMLDivElement>(null);
  // Track whether the user has scrolled up — if so, don't force-scroll on new tokens
  const isAtBottomRef = useRef(true);

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const disabled = !auditDone || !embedReady || isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <h3 className="font-semibold">Chat</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          {!auditDone
            ? "Available after audit completes"
            : !embedReady
            ? "Preparing AI chat…"
            : "Ask about your audit"}
        </p>
        {embedReady && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                disabled={disabled}
                onClick={() => append({ role: "user", content: a })}
                className="text-xs px-2.5 py-1 rounded-full border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        onScroll={handleMessagesScroll}
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-tertiary)]">
            {!auditDone ? (
              <>
                <MessageSquareOff className="w-8 h-8 opacity-40" />
                <p className="text-xs text-center">Chat unlocks when the audit finishes</p>
              </>
            ) : !embedReady ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin opacity-60" />
                <p className="text-xs">Preparing AI chat…</p>
              </>
            ) : (
              <p className="text-xs text-center">Ask anything about the audit results</p>
            )}
          </div>
        )}

        {/* Message list */}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] prose prose-sm prose-invert max-w-none"
              }`}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div role="status" aria-label="Assistant is responding" className="flex gap-1">
            <span className="sr-only">Loading…</span>
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "0.1s" }} />
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "0.2s" }} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border)] flex gap-2">
        <input
          aria-label="Chat message"
          value={input}
          onChange={handleInputChange}
          placeholder={
            !auditDone
              ? "Waiting for audit to complete…"
              : !embedReady
              ? "Preparing AI context…"
              : "Ask about your audit results..."
          }
          disabled={disabled}
          className="flex-1 bg-[var(--bg-tertiary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={disabled || !input.trim()}
          className="p-2 rounded-lg bg-[var(--accent)] text-black disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
