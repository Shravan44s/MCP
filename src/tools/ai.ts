// ============================================
// Keyless AI Generation Tools (via Pollinations.ai)
// No sign-up, no login, 100% free
// ============================================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAITools(server: McpServer) {
  // ---- ai_generate_image ----
  server.tool(
    "ai_generate_image",
    "Generate a high-quality AI image from a text prompt using Pollinations.ai. Returns a direct image URL.",
    {
      prompt: z.string().describe("Description of the image to generate"),
      width: z.number().optional().default(1024).describe("Width of the image (default 1024)"),
      height: z.number().optional().default(1024).describe("Height of the image (default 1024)"),
      model: z
        .enum(["flux", "flux-realism", "any-dark", "flux-anime"])
        .optional()
        .default("flux")
        .describe("The AI model style to use (default: flux)"),
    },
    async ({ prompt, width, height, model }) => {
      try {
        const seed = Math.floor(Math.random() * 1000000);
        const encodedPrompt = encodeURIComponent(prompt);
        
        // Construct the keyless hot-linkable image URL
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

        // Make a quick HEAD request to verify the service is responsive
        const verify = await fetch(imageUrl, { method: "HEAD" });
        if (!verify.ok) {
          throw new Error("Pollinations image generation service is currently busy or offline.");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `🎨 Image generated successfully!\n\n🔗 URL: ${imageUrl}\n\nThis URL is publicly accessible and can be posted directly to Instagram or downloaded.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Error generating image: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
