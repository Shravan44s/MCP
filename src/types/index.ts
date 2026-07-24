// ============================================
// Shared Types for Notion MCP Task Orchestrator
// ============================================

/** The platforms a Notion task can target */
export type Platform = "GitHub" | "Instagram" | "VSCode" | "Telegram" | "General";

/** Where a meme candidate was sourced from */
export type MemeSource = "reddit" | "giphy" | "imgflip";

/**
 * A single meme/GIF candidate normalized across sources (Reddit, Giphy,
 * Imgflip) so the ledger, caption generator, publisher, and auto-post
 * pipeline can all work against one shape regardless of origin.
 */
export interface MemeCandidate {
  /** Stable unique id used for no-repeat ledger tracking (postLink / gif id / template+text hash) */
  id: string;
  title: string;
  /** Static image needing animation before it can be posted as a Reel (Reddit, Imgflip) */
  imageUrl?: string;
  /** Already-a-video asset that can be posted as-is (Giphy) */
  videoUrl?: string;
  source: MemeSource;
  /** Content bucket, e.g. "Trending", "Programmer", "Desi" — used for caption hashtags & variety rotation */
  category: string;
  /** Engagement/trending score used to rank candidates within a category */
  score: number;
}

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
  telegram?: {
    token?: string;
    chatId?: string;
  };
  instagram?: {
    accessToken?: string;
    userId?: string;
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
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;

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
    telegram: telegramToken && telegramChatId ? { token: telegramToken, chatId: telegramChatId } : undefined,
    instagram: instagramToken && instagramUserId ? { accessToken: instagramToken, userId: instagramUserId } : undefined,
  };
}
