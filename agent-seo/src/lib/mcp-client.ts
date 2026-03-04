// src/lib/mcp-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

let client: Client | null = null;

export async function getMCPClient(): Promise<Client> {
  if (client) return client;

  const mcpUrl = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:3001";
  const transport = new SSEClientTransport(new URL(`${mcpUrl}/sse`));
  const c = new Client({ name: "agent-seo", version: "1.0.0" }, { capabilities: {} });
  await c.connect(transport);
  client = c;
  return client;
}

export async function callMCPTool(toolName: string, args: Record<string, unknown>) {
  const c = await getMCPClient();
  const result = await c.callTool({ name: toolName, arguments: args });
  return result;
}
