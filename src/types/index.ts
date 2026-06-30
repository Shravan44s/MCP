// ============================================
// Shared Types for Notion MCP Task Orchestrator
// ============================================

/** The platforms a Notion task can target */
export type Platform = "GitHub" | "Instagram" | "VSCode" | "General";

/** Task status in the Notion database */
export type TaskStatus = "Todo" | "In Progress" | "Done" | "Failed";

/** Priority levels */
export type Priority = "High" | "Medium" | "Low";

/** GitHub-specific actions that can be dispatched */
export type GitHubAction =
  | "Create Repo"
  | "Create Issue"
  | "Create PR"
  | "Commit File"
  | "List Issues"
  | "List Repos"
  | "Get Repo";

/** VS Code-specific actions */
export type VSCodeAction =
  | "Open Project"
  | "Open File"
  | "Run Command"
  | "Install Extension"
  | "List Extensions";

/**
 * Represents a task row parsed from the Notion database.
 * Every field maps to a column in the structured Notion DB.
 */
export interface NotionTask {
  /** Notion page ID */
  id: string;
  /** Task Name (Title column) */
  name: string;
  /** Target platform */
  platform: Platform;
  /** Current status */
  status: TaskStatus;
  /** Priority level */
  priority: Priority;
  /** Full description / body text */
  details: string;

  // --- GitHub-specific fields ---
  githubRepo?: string; // "owner/repo"
  githubAction?: GitHubAction;

  // --- VS Code-specific fields ---
  vscodeProjectPath?: string;
  vscodeCommand?: string;

  // --- Result (written back after execution) ---
  result?: string;
}

/**
 * The result returned after a task is executed
 */
export interface TaskExecutionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Configuration loaded from environment variables
 */
export interface AppConfig {
  notion: {
    token: string;
    databaseId: string;
  };
  github: {
    token: string;
  };
  vscode: {
    cliPath: string;
  };
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  const githubToken = process.env.GITHUB_TOKEN;
  const vscodeCli = process.env.VSCODE_CLI_PATH || "code";

  if (!notionToken) {
    throw new Error("NOTION_TOKEN environment variable is required");
  }
  if (!notionDbId) {
    throw new Error("NOTION_DATABASE_ID environment variable is required");
  }
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  return {
    notion: { token: notionToken, databaseId: notionDbId },
    github: { token: githubToken },
    vscode: { cliPath: vscodeCli },
  };
}
