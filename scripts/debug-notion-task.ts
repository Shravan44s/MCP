import "dotenv/config";
import { NotionClient } from "../src/services/notion-client.js";

async function main() {
  const notion = new NotionClient(
    process.env.NOTION_TOKEN!,
    process.env.NOTION_DATABASE_ID!
  );

  console.log("🔍 Fetching tasks with Platform = Instagram from Notion...");
  const tasks = await notion.listTasks({ platform: "Instagram" });

  console.log(`Found ${tasks.length} tasks.`);
  for (const t of tasks) {
    console.log(`- Task Name: "${t.name}"`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Details (parsed): "${t.details}"`);
    console.log(`  Status: "${t.status}"`);
    console.log(`  Platform: "${t.platform}"`);
    
    // Fetch raw page properties to see what's actually there
    const rawPage: any = await (notion as any).client.pages.retrieve({ page_id: t.id });
    console.log("  Raw Details Property:", JSON.stringify(rawPage.properties?.Details, null, 2));
    console.log("-----------------------------------------");
  }
}

main().catch(console.error);
