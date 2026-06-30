import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NotionClient } from "../src/services/notion-client.js";
import { GitHubClient } from "../src/services/github-client.js";
import { VSCodeClient } from "../src/services/vscode-client.js";
import type { NotionTask, TaskExecutionResult } from "../src/types/index.js";

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // 1. Optional security token check
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Load API credentials
  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!notionToken || !notionDbId || !githubToken) {
    return res.status(500).json({
      error: "Missing environment variables: NOTION_TOKEN, NOTION_DATABASE_ID, GITHUB_TOKEN",
    });
  }

  try {
    const notionClient = new NotionClient(notionToken, notionDbId);
    const githubClient = new GitHubClient(githubToken);
    const vscodeClient = new VSCodeClient("code");

    // 3. Find pending tasks
    const tasks = await notionClient.listTasks({ status: "Todo" });

    if (tasks.length === 0) {
      return res.status(200).json({ message: "No pending tasks found" });
    }

    const summary: string[] = [];

    for (const task of tasks) {
      await notionClient.updateTaskStatus(task.id, "In Progress");
      let result: TaskExecutionResult;

      try {
        switch (task.platform) {
          case "GitHub":
            result = await executeGitHubTask(task, githubClient);
            break;
          case "VSCode":
            result = {
              success: false,
              message:
                "VS Code execution requires a local environment. Cannot run in Vercel serverless cloud.",
            };
            break;
          case "Instagram":
            result = {
              success: false,
              message:
                "Instagram task execution requires a locally running ig-mcp setup. Skipping in Vercel cloud cron.",
            };
            break;
          default:
            result = {
              success: true,
              message: `General task acknowledged: ${task.details || ""}`,
            };
        }
      } catch (err: any) {
        result = { success: false, message: err.message || String(err) };
      }

      await notionClient.updateTaskStatus(
        task.id,
        result.success ? "Done" : "Failed"
      );
      await notionClient.writeResult(
        task.id,
        result.success ? `✅ ${result.message}` : `❌ ${result.message}`
      );
      summary.push(
        `[${task.platform}] "${task.name}": ${
          result.success ? "Success" : "Failed"
        } - ${result.message}`
      );
    }

    return res
      .status(200)
      .json({ message: "Processed tasks successfully", summary });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
