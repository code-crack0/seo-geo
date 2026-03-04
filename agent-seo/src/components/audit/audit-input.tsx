// src/components/audit/audit-input.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Globe, ArrowRight, Loader2 } from "lucide-react";
import { ensureHttps } from "@/lib/utils";

export function AuditInput() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/audit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: ensureHttps(domain.trim()) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data = await res.json() as { auditId?: string };
      if (!data.auditId) throw new Error("No audit ID returned");
      router.push(`/audit/${data.auditId}?domain=${encodeURIComponent(ensureHttps(domain.trim()))}`);
    } catch (err) {
      console.error("[AuditInput] audit start failed:", err);
      setError("Failed to start audit. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex items-center border border-[var(--border)] rounded-xl bg-[var(--bg-secondary)] focus-within:border-[var(--accent)] transition-colors overflow-hidden">
        <Globe className="ml-4 h-5 w-5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
        <input
          type="text"
          placeholder="Enter your domain (e.g., stripe.com)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="flex-1 bg-transparent px-4 py-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none text-lg"
        />
        <Button type="submit" disabled={loading || !domain.trim()} size="lg" className="m-1.5 rounded-lg" aria-label={loading ? "Starting audit, please wait" : undefined}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Start Audit <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <p className="mt-3 text-center text-sm text-[var(--text-tertiary)]">
        Free audit • No signup required • Results in ~60 seconds
      </p>
    </form>
  );
}
