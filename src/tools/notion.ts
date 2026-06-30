// ============================================
// Notion MCP Tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NotionClient } from "../services/notion-client.js";

export function registerNotionTools(server: McpServer, client: NotionClient) {
  // ---- notion_list_tasks ----
  server.tool(
    "notion_list_tasks",
    "Query tasks from the Notion database. Optionally filter by status (Todo, In Progress, Done, Failed) and/or platform (GitHub, Instagram, VSCode, General).",
    {
      status: z
        .enum(["Todo", "In Progress", "Done", "Failed"])
        .optional()
        .describe("Filter tasks by status"),
      platform: z
        .enum(["GitHub", "Instagram", "VSCode", "General"])
        .optional()
        .describe("Filter tasks by target platform"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Max number of tasks to return (default 50)"),
    },
    async ({ status, platform, limit }) => {
      try {
        const tasks = await client.listTasks({ status, platform, limit });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(tasks, null, 2),
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

  // ---- notion_get_task ----
  server.tool(
    "notion_get_task",
    "Get the full details of a specific Notion task by its page ID.",
    {
      page_id: z.string().describe("The Notion page ID of the task"),
    },
    async ({ page_id }) => {
      try {
        const task = await client.getTask(page_id);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(task, null, 2) },
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

  // ---- notion_create_task ----
  server.tool(
    "notion_create_task",
    "Create a new task in the Notion database with platform-specific fields.",
    {
      name: z.string().describe("Task name / title"),
      platform: z
        .enum(["GitHub", "Instagram", "VSCode", "General"])
        .describe("Target platform"),
      details: z.string().optional().describe("Full description of the task"),
      priority: z
        .enum(["High", "Medium", "Low"])
        .optional()
        .describe("Priority level"),
      github_repo: z
        .string()
        .optional()
        .describe("GitHub repo in 'owner/repo' format"),
      github_action: z
        .enum([
          "Create Issue",
          "Create PR",
          "Commit File",
          "List Issues",
          "List Repos",
          "Get Repo",
        ])
        .optional()
        .describe("GitHub action to perform"),
      vscode_project_path: z
        .string()
        .optional()
        .describe("VS Code project folder path"),
      vscode_command: z
        .string()
        .optional()
        .describe("Shell command to run in VS Code"),
    },
    async ({
      name,
      platform,
      details,
      priority,
      github_repo,
      github_action,
      vscode_project_path,
      vscode_command,
    }) => {
      try {
        const task = await client.createTask({
          name,
          platform,
          details,
          priority,
          githubRepo: github_repo,
          githubAction: github_action,
          vscodeProjectPath: vscode_project_path,
          vscodeCommand: vscode_command,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Task created: "${task.name}" (ID: ${task.id})`,
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

  // ---- notion_update_task_status ----
  server.tool(
    "notion_update_task_status",
    "Update the status of a Notion task (Todo → In Progress → Done / Failed).",
    {
      page_id: z.string().describe("The Notion page ID"),
      status: z
        .enum(["Todo", "In Progress", "Done", "Failed"])
        .describe("New status"),
    },
    async ({ page_id, status }) => {
      try {
        await client.updateTaskStatus(page_id, status);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Task ${page_id} status updated to "${status}"`,
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

  // ---- notion_search ----
  server.tool(
    "notion_search",
    "Search across Notion pages by keyword.",
    {
      query: z.string().describe("Search query"),
    },
    async ({ query }) => {
      try {
        const results = await client.search(query);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results, null, 2),
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
