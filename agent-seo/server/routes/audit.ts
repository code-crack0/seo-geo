// server/routes/audit.ts — SSE streaming audit endpoint
import { Router, type Request, type Response } from "express";
import type { DataStreamWriter, JSONValue } from "ai";
import { runSupervisor } from "../../src/agents/supervisor";

export const auditRouter = Router();

auditRouter.post("/audit", async (req: Request, res: Response): Promise<void> => {
  const { domain, auditId } = req.body as { domain?: string; auditId?: string };

  if (!domain || !auditId) {
    res.status(400).json({ error: "domain and auditId are required" });
    return;
  }

  // Set up SSE — use same Vercel AI SDK data stream wire format so the
  // frontend parser (which looks for `2:[...]` lines) works unchanged.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering on Railway
  res.flushHeaders();

  // Minimal DataStreamWriter shim — only writeData() is used by supervisor
  const dataStream = {
    writeData(event: JSONValue) {
      try {
        res.write(`2:${JSON.stringify([event])}\n`);
      } catch {
        // Client disconnected — swallow write errors
      }
    },
  } as unknown as DataStreamWriter;

  // Keep connection alive while supervisor runs
  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 20_000);

  try {
    await runSupervisor(domain, auditId, dataStream);
  } catch (err) {
    console.error("[audit route] Supervisor error:", err);
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});
