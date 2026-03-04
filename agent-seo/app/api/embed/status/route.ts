// app/api/embed/status/route.ts
import { hasChunkEmbeddings } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const auditId = searchParams.get("auditId");
  if (!auditId) return Response.json({ ready: false });
  const ready = await hasChunkEmbeddings(auditId);
  return Response.json({ ready });
}
