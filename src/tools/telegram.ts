// ============================================
// Telegram MCP Tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TelegramClient } from "../services/telegram-client.js";

export function registerTelegramTools(
  server: McpServer,
  client: TelegramClient | undefined
) {
  // ---- telegram_send_message ----
  server.tool(
    "telegram_send_message",
    "Send a message via the Telegram Bot to your registered Chat ID.",
    {
      message: z.string().describe("The text message to send"),
      chat_id: z
        .string()
        .optional()
        .describe("Target Chat ID (optional, defaults to config)"),
    },
    async ({ message, chat_id }) => {
      if (!client) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
            },
          ],
          isError: true,
        };
      }

      try {
        const res = await client.sendMessage(message, chat_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Message sent successfully (ID: ${res.messageId})`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Error sending message: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
