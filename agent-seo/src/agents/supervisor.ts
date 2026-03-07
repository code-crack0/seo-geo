// src/agents/supervisor.ts
import type { DataStreamWriter } from "ai";
import { auditGraph } from "./graph";
import { closeBrowser } from "@/lib/browserbase";

export async function runSupervisor(domain: string, auditId: string, dataStream: DataStreamWriter): Promise<void> {
  try {
    await auditGraph.invoke(
      { auditId, domain },
      { configurable: { dataStream, thread_id: auditId } },
    );
  } catch (error) {
    try {
      dataStream.writeData({ type: "agent_status", agent: "supervisor", status: "error", message: String(error) });
    } catch { /* stream may be closed */ }
  } finally {
    await closeBrowser(auditId);
  }
}
