// ============================================
// Task Processor Engine
// Reads Notion tasks → dispatches to the right
// platform → updates status + result
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotionClient } from "../services/notion-client.js";
import { GitHubClient } from "../services/github-client.js";
import { VSCodeClient } from "../services/vscode-client.js";
import { TelegramClient } from "../services/telegram-client.js";
import { InstagramClient } from "../services/instagram-client.js";
import type { NotionTask, TaskExecutionResult } from "../types/index.js";

export function registerTaskProcessorTools(
  server: McpServer,
  notionClient: NotionClient,
  githubClient: GitHubClient,
  vscodeClient: VSCodeClient,
  telegramClient: TelegramClient | undefined,
  instagramClient: InstagramClient | undefined
) {
  // ---- process_notion_task ----
  server.tool(
    "process_notion_task",
    "Read a single Notion task by ID, execute it on the target platform (GitHub / VSCode), and update the task status and result in Notion. Instagram tasks should be handled via the ig-mcp server.",
    {
      page_id: z.string().describe("The Notion page ID of the task to process"),
    },
    async ({ page_id }) => {
      try {
        // 1. Read the task
        const task = await notionClient.getTask(page_id);

        if (task.status === "Done") {
          return {
            content: [
              {
                type: "text" as const,
                text: `⏭️ Task "${task.name}" is already Done — skipping.`,
              },
            ],
          };
        }

        // 2. Mark as In Progress
        await notionClient.updateTaskStatus(page_id, "In Progress");

        // 3. Execute based on platform
        let result: TaskExecutionResult;
        try {
          switch (task.platform) {
            case "GitHub":
              result = await executeGitHubTask(task, githubClient);
              break;
            case "VSCode":
              result = await executeVSCodeTask(task, vscodeClient);
              break;
            case "Instagram":
              result = await executeInstagramTask(task, instagramClient);
              break;
            case "Telegram":
              result = await executeTelegramTask(task, telegramClient);
              break;
            default:
              result = {
                success: true,
                message: `General task "${task.name}" acknowledged. Details: ${task.details}`,
              };
          }
        } catch (execErr: any) {
          result = {
            success: false,
            message: `Execution error: ${execErr.message}`,
          };
        }

        // 4. Update status and write result
        await notionClient.updateTaskStatus(
          page_id,
          result.success ? "Done" : "Failed"
        );
        await notionClient.writeResult(
          page_id,
          result.success
            ? `✅ ${result.message}`
            : `❌ ${result.message}`
        );

        // Send a telegram notification alert if configured
        if (telegramClient) {
          try {
            await telegramClient.sendMessage(
              `🔔 <b>Notion Task Executed</b>\n\n` +
              `<b>Task:</b> ${task.name}\n` +
              `<b>Platform:</b> ${task.platform}\n` +
              `<b>Status:</b> ${result.success ? "✅ Done" : "❌ Failed"}\n` +
              `<b>Result:</b> ${result.message}`
            );
          } catch (telErr) {
            console.error("Telegram notification failed", telErr);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: result.success
                ? `✅ Task "${task.name}" completed: ${result.message}`
                : `❌ Task "${task.name}" failed: ${result.message}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Error processing task: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ---- process_all_pending_tasks ----
  server.tool(
    "process_all_pending_tasks",
    "Find all Notion tasks with status 'Todo', execute each one on its target platform, and update their status. Optionally filter by platform.",
    {
      platform: z
        .enum(["GitHub", "Instagram", "VSCode", "General"])
        .optional()
        .describe("Only process tasks for this platform"),
    },
    async ({ platform }) => {
      try {
        const tasks = await notionClient.listTasks({
          status: "Todo",
          platform,
        });

        if (tasks.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "📭 No pending tasks found.",
              },
            ],
          };
        }

        const results: string[] = [];

        for (const task of tasks) {
          try {
            // Mark In Progress
            await notionClient.updateTaskStatus(task.id, "In Progress");

            let result: TaskExecutionResult;
            try {
              switch (task.platform) {
                case "GitHub":
                  result = await executeGitHubTask(task, githubClient);
                  break;
                case "VSCode":
                  result = await executeVSCodeTask(task, vscodeClient);
                  break;
                case "Instagram":
                  result = await executeInstagramTask(task, instagramClient);
                  break;
                case "Telegram":
                  result = await executeTelegramTask(task, telegramClient);
                  break;
                default:
                  result = {
                    success: true,
                    message: `General task acknowledged: ${task.details}`,
                  };
              }
            } catch (execErr: any) {
              result = {
                success: false,
                message: execErr.message,
              };
            }

            await notionClient.updateTaskStatus(
              task.id,
              result.success ? "Done" : "Failed"
            );
            await notionClient.writeResult(
              task.id,
              result.success
                ? `✅ ${result.message}`
                : `❌ ${result.message}`
            );

            // Send a telegram notification alert if configured
            if (telegramClient) {
              try {
                await telegramClient.sendMessage(
                  `🔔 <b>Notion Task Executed (Batch)</b>\n\n` +
                  `<b>Task:</b> ${task.name}\n` +
                  `<b>Platform:</b> ${task.platform}\n` +
                  `<b>Status:</b> ${result.success ? "✅ Done" : "❌ Failed"}\n` +
                  `<b>Result:</b> ${result.message}`
                );
              } catch (telErr) {
                console.error("Telegram notification failed", telErr);
              }
            }

            results.push(
              `${result.success ? "✅" : "❌"} "${task.name}": ${result.message}`
            );
          } catch (taskErr: any) {
            results.push(`❌ "${task.name}": ${taskErr.message}`);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Processed ${tasks.length} tasks:\n\n${results.join("\n")}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}

// ============================================
// Platform-specific execution logic
// ============================================

async function executeGitHubTask(
  task: NotionTask,
  github: GitHubClient
): Promise<TaskExecutionResult> {
  if (task.githubAction === "Create Repo") {
    const isPrivate = task.details?.toLowerCase().includes("private") ?? false;
    let org: string | undefined;
    let name = task.githubRepo || task.name;

    if (name.includes("/")) {
      const parts = name.split("/");
      org = parts[0];
      name = parts[1];
    }

    const repo = await github.createRepo({
      name,
      description: task.details || undefined,
      private: isPrivate,
      org,
    });
    return {
      success: true,
      message: `Repository "${repo.full_name}" created: ${repo.url}`,
      data: repo,
    };
  }

  if (!task.githubRepo) {
    return {
      success: false,
      message: "GitHub Repo field is missing. Expected 'owner/repo' format.",
    };
  }

  const [owner, repo] = task.githubRepo.split("/");
  if (!owner || !repo) {
    return {
      success: false,
      message: `Invalid GitHub Repo format: "${task.githubRepo}". Expected 'owner/repo'.`,
    };
  }

  switch (task.githubAction) {
    case "Create Issue": {
      const issue = await github.createIssue({
        owner,
        repo,
        title: task.name,
        body: task.details || undefined,
      });
      return {
        success: true,
        message: `Issue #${issue.number} created: ${issue.url}`,
        data: issue,
      };
    }
    case "List Issues": {
      const issues = await github.listIssues({ owner, repo });
      return {
        success: true,
        message: `Found ${issues.length} open issues in ${task.githubRepo}`,
        data: { issues },
      };
    }
    case "Create PR": {
      // For PRs, we use details field to get head and base branch info
      // Expected format in details: "head:feature-branch base:main description text"
      const headMatch = task.details?.match(/head:(\S+)/);
      const baseMatch = task.details?.match(/base:(\S+)/);
      const head = headMatch?.[1] || "feature";
      const base = baseMatch?.[1] || "main";
      const body = task.details
        ?.replace(/head:\S+/, "")
        .replace(/base:\S+/, "")
        .trim();

      const pr = await github.createPullRequest({
        owner,
        repo,
        title: task.name,
        head,
        base,
        body: body || undefined,
      });
      return {
        success: true,
        message: `PR #${pr.number} created: ${pr.url}`,
        data: pr,
      };
    }
    case "Commit File": {
      // Expected details format: "path:src/file.ts\n---\nfile content here"
      const pathMatch = task.details?.match(/path:(\S+)/);
      const filePath = pathMatch?.[1];
      if (!filePath) {
        return {
          success: false,
          message:
            'Missing file path in Details. Expected format: "path:src/file.ts\\n---\\ncontent"',
        };
      }
      const contentParts = task.details?.split("---\n");
      const fileContent = contentParts?.[1] || "";

      const result = await github.commitFile({
        owner,
        repo,
        path: filePath,
        content: fileContent,
        message: task.name,
      });
      return {
        success: true,
        message: `Committed to ${filePath}: ${result.commit_url}`,
        data: result,
      };
    }
    case "Get Repo": {
      const repoInfo = await github.getRepo({ owner, repo });
      return {
        success: true,
        message: `Repo: ${repoInfo.full_name} — ⭐ ${repoInfo.stars} | 🍴 ${repoInfo.forks} | Issues: ${repoInfo.open_issues}`,
        data: repoInfo,
      };
    }
    case "List Repos": {
      const repos = await github.listRepos();
      return {
        success: true,
        message: `Found ${repos.length} repositories`,
        data: { repos },
      };
    }
    default:
      return {
        success: false,
        message: `Unknown GitHub Action: "${task.githubAction}". Set the "GitHub Action" column.`,
      };
  }
}

async function executeVSCodeTask(
  task: NotionTask,
  vscode: VSCodeClient
): Promise<TaskExecutionResult> {
  // Vercel serverless checks
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return {
      success: false,
      message: "VS Code execution requires a local environment. Cannot run in Vercel serverless cloud.",
    };
  }

  // If a command is specified, run it
  if (task.vscodeCommand) {
    const cwd = task.vscodeProjectPath || process.cwd();
    const output = await vscode.runCommand(task.vscodeCommand, cwd);
    return {
      success: true,
      message: `Command output:\n${output}`,
    };
  }

  // If only a project path is specified, open it
  if (task.vscodeProjectPath) {
    const result = await vscode.openProject(task.vscodeProjectPath);
    return {
      success: true,
      message: result,
    };
  }

  return {
    success: false,
    message:
      'No VSCode action configured. Set "VSCode Command" or "VSCode Project Path" in Notion.',
  };
}

async function executeTelegramTask(
  task: NotionTask,
  telegram: TelegramClient | undefined
): Promise<TaskExecutionResult> {
  if (!telegram) {
    return {
      success: false,
      message: "Telegram client is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.",
    };
  }

  const messageText = task.details
    ? `<b>${task.name}</b>\n\n${task.details}`
    : task.name;

  await telegram.sendMessage(messageText);

  return {
    success: true,
    message: "Message sent to Telegram successfully.",
  };
}

async function executeInstagramTask(
  task: NotionTask,
  instagram: InstagramClient | undefined
): Promise<TaskExecutionResult> {
  if (!instagram) {
    return {
      success: false,
      message: "Instagram client is not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID environment variables.",
    };
  }

  // Notion task details or extra fields can provide the image URL.
  // We can look for a URL in details or expect details to contain the image URL.
  const imageUrl = task.details?.trim();
  if (!imageUrl || !imageUrl.startsWith("http")) {
    return {
      success: false,
      message: "Invalid or missing image URL in Details. Expected a public HTTP/HTTPS image URL.",
    };
  }

  const res = await instagram.publishPhoto(imageUrl, task.name);
  return {
    success: true,
    message: `Post published successfully to Instagram! Media ID: ${res.mediaId}`,
    data: res,
  };
}
