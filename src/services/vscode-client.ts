// ============================================
// VS Code CLI Client Wrapper
// ============================================
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

export class VSCodeClient {
  private cliPath: string;

  constructor(cliPath: string = "code") {
    this.cliPath = cliPath;
  }

  /**
   * Execute a VS Code CLI command and return stdout
   */
  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(this.cliPath, args, {
        timeout: 30_000,
      });
      if (stderr && !stdout) return stderr.trim();
      return stdout.trim();
    } catch (err: any) {
      throw new Error(
        `VS Code CLI error: ${err.message || err.stderr || String(err)}`
      );
    }
  }

  /**
   * Open a folder / workspace in VS Code
   */
  async openProject(path: string): Promise<string> {
    if (!existsSync(path)) {
      throw new Error(`Path does not exist: ${path}`);
    }
    await this.exec([path]);
    return `Opened project: ${path}`;
  }

  /**
   * Open a specific file, optionally at a given line
   */
  async openFile(path: string, line?: number): Promise<string> {
    if (!existsSync(path)) {
      throw new Error(`File does not exist: ${path}`);
    }
    const target = line ? `${path}:${line}` : path;
    await this.exec(["--goto", target]);
    return `Opened file: ${target}`;
  }

  /**
   * Run a shell command in a given working directory.
   * This executes the command directly (not through VS Code),
   * which is useful for build/test/lint commands.
   */
  async runCommand(command: string, cwd: string): Promise<string> {
    if (!existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    try {
      const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
        cwd,
        timeout: 120_000, // 2 minute timeout for builds etc.
        maxBuffer: 1024 * 1024, // 1 MB
      });

      let output = "";
      if (stdout) output += stdout.trim();
      if (stderr) output += (output ? "\n" : "") + stderr.trim();
      return output || "(command completed with no output)";
    } catch (err: any) {
      const msg = err.stdout || err.stderr || err.message || String(err);
      throw new Error(`Command failed: ${msg}`);
    }
  }

  /**
   * List installed VS Code extensions
   */
  async listExtensions(): Promise<string[]> {
    const output = await this.exec(["--list-extensions"]);
    return output.split("\n").filter(Boolean);
  }

  /**
   * Install a VS Code extension by its ID
   */
  async installExtension(extensionId: string): Promise<string> {
    const output = await this.exec([
      "--install-extension",
      extensionId,
      "--force",
    ]);
    return output || `Installed extension: ${extensionId}`;
  }
}
