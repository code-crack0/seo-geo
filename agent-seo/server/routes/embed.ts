// server/routes/embed.ts — Embedding generation + status endpoints
import { Router, type Request, type Response } from "express";
import { getAuditById, hasChunkEmbeddings } from "../../src/lib/db";
import { buildChunks, embedAndStore } from "../../src/lib/embeddings";
import type { AuditState } from "../../src/lib/types";

export const embedRouter = Router();

/** POST /api/embed — build + store embeddings for a completed audit */
embedRouter.post("/embed", async (req: Request, res: Response): Promise<void> => {
  const { auditId } = req.body as { auditId?: string };
  if (!auditId) {
    res.status(400).json({ error: "auditId required" });
    return;
  }

  try {
    const audit = await getAuditById(auditId);
    if (!audit?.results) {
      res.status(404).json({ error: "audit not found or has no results" });
      return;
    }

    const state = (typeof audit.results === "string"
      ? JSON.parse(audit.results)
      : audit.results) as AuditState;

    const chunks = await buildChunks(auditId, state);
    const count = await embedAndStore(auditId, chunks);

    res.json({ chunksCreated: count });
  } catch (err) {
    console.error("[embed] Error:", err);
    res.status(500).json({ error: String(err) });
  }
});

/** GET /api/embed/status?auditId=... — check if embeddings are ready */
embedRouter.get("/embed/status", async (req: Request, res: Response): Promise<void> => {
  const auditId = req.query.auditId as string | undefined;
  if (!auditId) {
    res.json({ ready: false });
    return;
  }
  try {
    const ready = await hasChunkEmbeddings(auditId);
    res.json({ ready });
  } catch {
    res.json({ ready: false });
  }
});
