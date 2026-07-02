import "dotenv/config";
import { MemeService } from "../src/services/meme-service.js";
import { NotionClient } from "../src/services/notion-client.js";

async function main() {
  console.log("🚀 Testing Meme Service + Notion createTask synchronously...");

  const memeService = new MemeService();
  const notion = new NotionClient(
    process.env.NOTION_TOKEN!,
    process.env.NOTION_DATABASE_ID!
  );

  console.log("1. Generating AI Meme...");
  const result = await memeService.generateAIMeme("a coding cat debugging at 3am", process.env.GEMINI_API_KEY);
  console.log("   → Generated URL:", result.imageUrl);
  console.log("   → Caption:", result.caption);

  console.log("\n2. Creating Notion Task...");
  const page = await notion.createTask({
    name: result.caption,
    platform: "Instagram",
    priority: "Medium",
    details: result.imageUrl,
  });

  console.log("   → Notion Page ID:", page.id);
  console.log("   → Notion Details field value:", page.details);

  // Double check by querying it back
  console.log("\n3. Refetching task from Notion...");
  const refetched = await notion.getTask(page.id);
  console.log("   → Refetched Details:", refetched.details);
}

main().catch((err) => {
  console.error("❌ Synced Execution Failed!");
  console.error(err);
});
