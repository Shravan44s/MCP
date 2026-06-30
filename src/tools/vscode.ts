// ============================================
// VS Code MCP Tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VSCodeClient } from "../services/vscode-client.js";

export function registerVSCodeTools(server: McpServer, client: VSCodeClient) {
  // ---- vscode_open_project ----
  server.tool(
    "vscode_open_project",
    "Open a folder or workspace in VS Code.",
    {
      path: z
        .string()
        .describe("Absolute path to the folder or workspace file"),
    },
    async ({ path }) => {
      try {
        const result = await client.openProject(path);
        return {
          content: [{ type: "text" as const, text: `✅ ${result}` }],
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

  // ---- vscode_open_file ----
  server.tool(
    "vscode_open_file",
    "Open a specific file in VS Code, optionally at a given line number.",
    {
      path: z.string().describe("Absolute path to the file"),
      line: z.number().optional().describe("Line number to jump to"),
    },
    async ({ path, line }) => {
      try {
        const result = await client.openFile(path, line);
        return {
          content: [{ type: "text" as const, text: `✅ ${result}` }],
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

  // ---- vscode_run_command ----
  server.tool(
    "vscode_run_command",
    "Run a shell command in a specified working directory. Useful for build, test, lint, or any CLI tool.",
    {
      command: z.string().describe("The shell command to execute"),
      cwd: z.string().describe("Working directory for the command"),
    },
    async ({ command, cwd }) => {
      try {
        const output = await client.runCommand(command, cwd);
        return {
          content: [{ type: "text" as const, text: output }],
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

  // ---- vscode_list_extensions ----
  server.tool(
    "vscode_list_extensions",
    "List all installed VS Code extensions.",
    {},
    async () => {
      try {
        const extensions = await client.listExtensions();
        return {
          content: [
            {
              type: "text" as const,
              text: `Installed extensions (${extensions.length}):\n${extensions.join("\n")}`,
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

  // ---- vscode_install_extension ----
  server.tool(
    "vscode_install_extension",
    "Install a VS Code extension by its marketplace ID.",
    {
      extension_id: z
        .string()
        .describe(
          "Extension ID (e.g. 'ms-python.python', 'esbenp.prettier-vscode')"
        ),
    },
    async ({ extension_id }) => {
      try {
        const result = await client.installExtension(extension_id);
        return {
          content: [{ type: "text" as const, text: `✅ ${result}` }],
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
