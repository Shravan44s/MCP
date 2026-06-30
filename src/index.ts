// ============================================
// Entry Point — Notion MCP Task Orchestrator
// ============================================
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { loadConfig } from "./types/index.js";

async function main() {
  // Load and validate environment variables
  const config = loadConfig();

  // Create the MCP server with all tools
  const server = createServer(config);

  // Connect via stdio transport (for OpenCode)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with the MCP JSON-RPC on stdout
  console.error("🚀 Notion Task Orchestrator MCP server is running");
  console.error(
    `   Tools: Notion (5) + GitHub (6) + VS Code (5) + Task Engine (2) = 18 tools`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
