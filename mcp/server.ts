#!/usr/bin/env -S npx tsx
// 3fqik admin MCP server (stdio). Launched as a subprocess by hermes-agent;
// drives the app's admin HTTP API as the bot-admin player. See
// docs/superpowers/specs/2026-06-23-admin-mcp-server-design.md.
//
// Required env: APP_BASE_URL (default http://127.0.0.1:3000), MCP_ADMIN_TOKEN.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";

async function main() {
  const server = new McpServer({
    name: "3fqik-admin",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport keeps the process alive; never log to stdout (it carries
  // the protocol). Diagnostics go to stderr.
  process.stderr.write("3fqik-admin MCP server ready on stdio\n");
}

main().catch((e) => {
  process.stderr.write(
    `fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
  );
  process.exit(1);
});
