// ============================================
// GitHub MCP Tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitHubClient } from "../services/github-client.js";

export function registerGitHubTools(server: McpServer, client: GitHubClient) {
  // ---- github_create_repo ----
  server.tool(
    "github_create_repo",
    "Create a new GitHub repository for the authenticated user or an organization.",
    {
      name: z.string().describe("Repository name"),
      description: z.string().optional().describe("Repository description"),
      private: z.boolean().optional().describe("Whether the repository should be private (default false)"),
      org: z.string().optional().describe("Target organization (if creating in an org)"),
    },
    async ({ name, description, private: isPrivate, org }) => {
      try {
        const repo = await client.createRepo({
          name,
          description,
          private: isPrivate,
          org,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Repository "${repo.full_name}" created: ${repo.url}`,
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

  // ---- github_create_issue ----
  server.tool(
    "github_create_issue",
    "Create a new issue on a GitHub repository.",
    {
      owner: z.string().describe("Repository owner (username or org)"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("Issue title"),
      body: z.string().optional().describe("Issue body / description"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Labels to apply (e.g. ['bug', 'priority'])"),
    },
    async ({ owner, repo, title, body, labels }) => {
      try {
        const issue = await client.createIssue({
          owner,
          repo,
          title,
          body,
          labels,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Issue #${issue.number} created: ${issue.url}`,
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

  // ---- github_list_issues ----
  server.tool(
    "github_list_issues",
    "List issues for a GitHub repository.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("Issue state filter (default: open)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Max issues to return"),
    },
    async ({ owner, repo, state, limit }) => {
      try {
        const issues = await client.listIssues({ owner, repo, state, limit });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(issues, null, 2),
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

  // ---- github_create_pull_request ----
  server.tool(
    "github_create_pull_request",
    "Create a pull request on a GitHub repository.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("PR title"),
      head: z.string().describe("Source branch name"),
      base: z.string().describe("Target branch name (e.g. 'main')"),
      body: z.string().optional().describe("PR description"),
    },
    async ({ owner, repo, title, head, base, body }) => {
      try {
        const pr = await client.createPullRequest({
          owner,
          repo,
          title,
          head,
          base,
          body,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ PR #${pr.number} created: ${pr.url}`,
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

  // ---- github_commit_file ----
  server.tool(
    "github_commit_file",
    "Create or update a file in a GitHub repository and commit it.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().describe("File path in the repo (e.g. 'src/app.ts')"),
      content: z.string().describe("File content to write"),
      message: z.string().describe("Commit message"),
      branch: z
        .string()
        .optional()
        .describe("Branch name (defaults to repo default branch)"),
    },
    async ({ owner, repo, path, content, message, branch }) => {
      try {
        const result = await client.commitFile({
          owner,
          repo,
          path,
          content,
          message,
          branch,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Committed "${path}" — SHA: ${result.commit_sha}\n${result.commit_url}`,
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

  // ---- github_list_repos ----
  server.tool(
    "github_list_repos",
    "List repositories for the authenticated GitHub user.",
    {
      type: z
        .enum(["all", "owner", "member"])
        .optional()
        .describe("Filter by repo type"),
      sort: z
        .enum(["created", "updated", "pushed", "full_name"])
        .optional()
        .describe("Sort order"),
    },
    async ({ type, sort }) => {
      try {
        const repos = await client.listRepos({ type, sort });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(repos, null, 2),
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

  // ---- github_get_repo ----
  server.tool(
    "github_get_repo",
    "Get detailed information about a GitHub repository.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
    },
    async ({ owner, repo }) => {
      try {
        const repoInfo = await client.getRepo({ owner, repo });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(repoInfo, null, 2),
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
