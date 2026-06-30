// ============================================
// Instagram MCP Tools
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InstagramClient } from "../services/instagram-client.js";

export function registerInstagramTools(
  server: McpServer,
  client: InstagramClient | undefined
) {
  // ---- instagram_publish_photo ----
  server.tool(
    "instagram_publish_photo",
    "Publish a photo to your connected Instagram Business or Creator Feed.",
    {
      image_url: z.string().describe("Publicly accessible URL of the image to post"),
      caption: z.string().optional().describe("Post caption"),
    },
    async ({ image_url, caption }) => {
      if (!client) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Instagram is not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID environment variables.",
            },
          ],
          isError: true,
        };
      }

      try {
        const res = await client.publishPhoto(image_url, caption);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Post published successfully to Instagram! Media ID: ${res.mediaId}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Error publishing post: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
