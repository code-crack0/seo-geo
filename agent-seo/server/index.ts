// server/index.ts — Express backend for Railway
// Handles long-running audit SSE streaming and embedding generation.
import "dotenv/config";
import express from "express";
import cors from "cors";
import { auditRouter } from "./routes/audit";
import { embedRouter } from "./routes/embed";

const app = express();

// FRONTEND_URL can be comma-separated for multiple origins
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((o) => o.trim())
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use("/api", auditRouter);
app.use("/api", embedRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`[server] AgentSEO backend running on port ${PORT}`);
});
