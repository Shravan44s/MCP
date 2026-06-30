// ============================================
// MCP Server Setup — registers all tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotionClient } from "./services/notion-client.js";
import { GitHubClient } from "./services/github-client.js";
import { VSCodeClient } from "./services/vscode-client.js";
import { registerNotionTools } from "./tools/notion.js";
import { registerGitHubTools } from "./tools/github.js";
import { registerVSCodeTools } from "./tools/vscode.js";
import { TelegramClient } from "./services/telegram-client.js";
import { registerTelegramTools } from "./tools/telegram.js";
import { InstagramClient } from "./services/instagram-client.js";
import { registerInstagramTools } from "./tools/instagram.js";
import { registerAITools } from "./tools/ai.js";
import { registerTaskProcessorTools } from "./engine/task-processor.js";
import type { AppConfig } from "./types/index.js";

/**
 * Create and configure the MCP server with all tools registered
 */
export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: "notion-task-orchestrator",
    version: "1.0.0",
  });

  // Initialize service clients
  const notionClient = new NotionClient(
    config.notion.token,
    config.notion.databaseId
  );
  const githubClient = new GitHubClient(config.github.token);
  const vscodeClient = new VSCodeClient(config.vscode.cliPath);
  const telegramClient =
    config.telegram?.token && config.telegram?.chatId
      ? new TelegramClient(config.telegram.token, config.telegram.chatId)
      : undefined;
  const instagramClient =
    config.instagram?.accessToken && config.instagram?.userId
      ? new InstagramClient(config.instagram.accessToken, config.instagram.userId)
      : undefined;

  // Register all tool groups
  registerNotionTools(server, notionClient);
  registerGitHubTools(server, githubClient);
  registerVSCodeTools(server, vscodeClient);
  registerTelegramTools(server, telegramClient);
  registerInstagramTools(server, instagramClient);
  registerAITools(server);
  registerTaskProcessorTools(
    server,
    notionClient,
    githubClient,
    vscodeClient,
    telegramClient,
    instagramClient
  );

  return server;
}
