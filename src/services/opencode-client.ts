// ============================================
// OpenCode Chat Client — uses @opencode-ai/sdk
// Talks to a local `opencode serve` instance for
// free conversational AI via deepseek-v4-flash-free
// ============================================

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://localhost:4096";

export class OpenCodeChatClient {
  private client: OpencodeClient;

  constructor(serverUrl?: string) {
    this.client = createOpencodeClient({
      baseUrl: serverUrl || OPENCODE_SERVER_URL,
    });
  }

  /**
   * Sends a conversational message via OpenCode and returns the text response.
   * Creates a fresh session for each message to keep things stateless.
   */
  async chat(message: string, _systemPrompt?: string): Promise<string> {
    try {
      // Create a new session
      const sessionRes = await this.client.session.create();
      const session = sessionRes.data as any;
      if (!session?.id) {
        throw new Error("Failed to create OpenCode session");
      }

      // Prepend system-like instructions into the user message
      const fullPrompt = _systemPrompt
        ? `${_systemPrompt}\n\nUser message: ${message}`
        : message;

      // Send the prompt and wait for response
      const promptRes = await this.client.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{ type: "text" as const, text: fullPrompt }],
        },
      });

      const data = promptRes.data as any;
      if (!data?.parts) {
        throw new Error("No response parts returned from OpenCode");
      }

      // Extract text parts from the response
      const textParts = data.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");

      if (!textParts) {
        throw new Error("No text content in OpenCode response");
      }

      // Clean up session after use (fire-and-forget)
      this.client.session.delete({ path: { id: session.id } }).catch(() => {});

      return textParts.trim();
    } catch (err: any) {
      console.error("❌ OpenCode Chat error:", err);
      throw err;
    }
  }
}
