// server/routes/audit.ts — SSE streaming audit endpoint
// Supervisor runs in the background regardless of client connection.
// Events are persisted to Supabase so reconnecting clients get full history.
import { EventEmitter } from "events";
import { Router, type Request, type Response } from "express";
import type { DataStreamWriter, JSONValue } from "ai";
import { runSupervisor } from "../../src/agents/supervisor";
import { getAuditById, storeAuditEvent, getAuditEvents } from "../../src/lib/db";

export const auditRouter = Router();

// In-memory registry of running audits — maps auditId → EventEmitter
const runningAudits = new Map<string, EventEmitter>();

auditRouter.post("/audit", async (req: Request, res: Response): Promise<void> => {
  const { domain, auditId } = req.body as { domain?: string; auditId?: string };

  if (!domain || !auditId) {
    res.status(400).json({ error: "domain and auditId are required" });
    return;
  }

  // SSE headers — same Vercel AI SDK wire format (2:[...]\n) so frontend is unchanged
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // ── 1. Replay persisted events so reconnecting clients catch up ──────────────
  const pastEvents = await getAuditEvents(auditId);
  for (const event of pastEvents) {
    try { res.write(`2:${JSON.stringify([event])}\n`); } catch { /* client gone */ }
  }

  // ── 2. If audit already finished, close the stream ───────────────────────────
  const audit = await getAuditById(auditId);
  if (audit?.status === "completed" || audit?.status === "failed") {
    res.end();
    return;
  }

  // ── 3. Start supervisor in background if not already running ─────────────────
  if (!runningAudits.has(auditId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    runningAudits.set(auditId, emitter);

    // DataStream shim: persists every event to Supabase + broadcasts to all listeners
    // browser_frame events (JPEG screenshots) are emitted live but NOT persisted (too large)
    const dataStream = {
      writeData(event: JSONValue) {
        const e = event as Record<string, unknown>;
        if (e?.type !== "browser_frame") {
          storeAuditEvent(auditId, e).catch(console.error);
        }
        emitter.emit("event", event);
      },
    } as unknown as DataStreamWriter;

    // Fire-and-forget — supervisor runs until completion regardless of SSE clients
    runSupervisor(domain, auditId, dataStream)
      .catch((err) => console.error("[audit route] Supervisor error:", err))
      .finally(() => {
        emitter.emit("done");
        runningAudits.delete(auditId);
      });
  }

  // ── 4. Attach this SSE client to the running audit's emitter ─────────────────
  const emitter = runningAudits.get(auditId);
  if (!emitter) {
    // Supervisor finished between checks — stream is already over
    res.end();
    return;
  }

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 20_000);

  const onEvent = (event: JSONValue) => {
    try { res.write(`2:${JSON.stringify([event])}\n`); } catch { /* client gone */ }
  };
  const onDone = () => {
    clearInterval(keepAlive);
    try { res.end(); } catch { /* already ended */ }
  };

  emitter.on("event", onEvent);
  emitter.on("done", onDone);

  // Client disconnects — detach listeners but DO NOT stop the supervisor
  req.on("close", () => {
    clearInterval(keepAlive);
    emitter.off("event", onEvent);
    emitter.off("done", onDone);
  });
});
