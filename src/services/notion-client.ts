// ============================================
// Notion API Client Wrapper
// ============================================
import { Client } from "@notionhq/client";
import type {
  NotionTask,
  Platform,
  TaskStatus,
  Priority,
  GitHubAction,
} from "../types/index.js";

export class NotionClient {
  private client: Client;
  private databaseId: string;

  constructor(token: string, databaseId: string) {
    this.client = new Client({ auth: token });
    this.databaseId = databaseId;
  }

  // ---- Helpers to extract typed values from Notion properties ----

  private getText(prop: any): string {
    if (!prop) return "";
    if (prop.type === "title") {
      return prop.title?.map((t: any) => t.plain_text).join("") || "";
    }
    if (prop.type === "rich_text") {
      return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
    }
    if (prop.type === "url") {
      return prop.url || "";
    }
    return "";
  }

  private getSelect(prop: any): string {
    return prop?.select?.name || "";
  }

  private getStatus(prop: any): string {
    return prop?.status?.name || "";
  }

  /**
   * Parse a Notion page into our typed NotionTask
   */
  private parseTask(page: any): NotionTask {
    const props = page.properties;
    return {
      id: page.id,
      name: this.getText(props["Task Name"]),
      platform: (this.getSelect(props["Platform"]) || "General") as Platform,
      status: (this.getStatus(props["Status"]) || "Todo") as TaskStatus,
      priority: (this.getSelect(props["Priority"]) || "Medium") as Priority,
      details: this.getText(props["Details"]),
      githubRepo: this.getText(props["GitHub Repo"]),
      githubAction: (this.getSelect(props["GitHub Action"]) ||
        undefined) as GitHubAction | undefined,
      vscodeProjectPath: this.getText(props["VSCode Project Path"]),
      vscodeCommand: this.getText(props["VSCode Command"]),
      result: this.getText(props["Result"]),
    };
  }

  /**
   * Query tasks from the database, with optional filters
   */
  async listTasks(options?: {
    status?: TaskStatus;
    platform?: Platform;
    limit?: number;
  }): Promise<NotionTask[]> {
    const filters: any[] = [];

    if (options?.status) {
      filters.push({
        property: "Status",
        status: { equals: options.status },
      });
    }
    if (options?.platform) {
      filters.push({
        property: "Platform",
        select: { equals: options.platform },
      });
    }

    const queryParams: any = {
      database_id: this.databaseId,
      page_size: options?.limit || 50,
    };

    if (filters.length === 1) {
      queryParams.filter = filters[0];
    } else if (filters.length > 1) {
      queryParams.filter = { and: filters };
    }

    const response = await this.client.databases.query(queryParams);
    return response.results.map((page: any) => this.parseTask(page));
  }

  /**
   * Get a single task by its page ID
   */
  async getTask(pageId: string): Promise<NotionTask> {
    const page = await this.client.pages.retrieve({ page_id: pageId });
    return this.parseTask(page);
  }

  /**
   * Create a new task in the database
   */
  async createTask(task: {
    name: string;
    platform: Platform;
    details?: string;
    priority?: Priority;
    githubRepo?: string;
    githubAction?: GitHubAction;
    vscodeProjectPath?: string;
    vscodeCommand?: string;
  }): Promise<NotionTask> {
    const properties: any = {
      "Task Name": {
        title: [{ text: { content: task.name } }],
      },
      Platform: {
        select: { name: task.platform },
      },
      Status: {
        status: { name: "Todo" },
      },
    };

    if (task.priority) {
      properties["Priority"] = { select: { name: task.priority } };
    }
    if (task.details) {
      properties["Details"] = {
        rich_text: [{ text: { content: task.details } }],
      };
    }
    if (task.githubRepo) {
      properties["GitHub Repo"] = {
        rich_text: [{ text: { content: task.githubRepo } }],
      };
    }
    if (task.githubAction) {
      properties["GitHub Action"] = {
        select: { name: task.githubAction },
      };
    }
    if (task.vscodeProjectPath) {
      properties["VSCode Project Path"] = {
        rich_text: [{ text: { content: task.vscodeProjectPath } }],
      };
    }
    if (task.vscodeCommand) {
      properties["VSCode Command"] = {
        rich_text: [{ text: { content: task.vscodeCommand } }],
      };
    }

    const page = await this.client.pages.create({
      parent: { database_id: this.databaseId },
      properties,
    });

    return this.parseTask(page);
  }

  /**
   * Update the status of a task
   */
  async updateTaskStatus(pageId: string, status: TaskStatus): Promise<void> {
    await this.client.pages.update({
      page_id: pageId,
      properties: {
        Status: { status: { name: status } },
      },
    });
  }

  /**
   * Write execution result back to the task
   */
  async writeResult(pageId: string, result: string): Promise<void> {
    // Notion rich_text max is 2000 chars
    const truncated =
      result.length > 1900 ? result.substring(0, 1900) + "…" : result;
    await this.client.pages.update({
      page_id: pageId,
      properties: {
        Result: {
          rich_text: [{ text: { content: truncated } }],
        },
      },
    });
  }

  /**
   * Search across Notion pages by keyword
   */
  async search(query: string): Promise<{ id: string; title: string }[]> {
    const response = await this.client.search({
      query,
      page_size: 20,
    });

    return response.results.map((page: any) => {
      const titleProp = Object.values(page.properties || {}).find(
        (p: any) => p.type === "title"
      ) as any;
      const title =
        titleProp?.title?.map((t: any) => t.plain_text).join("") ||
        "Untitled";
      return { id: page.id, title };
    });
  }
}
