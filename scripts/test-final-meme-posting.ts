import "dotenv/config";
import { NotionClient } from "../src/services/notion-client.js";

const localUrl = "http://localhost:3000/api/telegram";
const chatId = parseInt(process.env.TELEGRAM_CHAT_ID!);

async function postCommand(text: string) {
  const res = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { chat: { id: chatId }, text } }),
  });
  return res.json();
}

async function main() {
  const notion = new NotionClient(
    process.env.NOTION_TOKEN!,
    process.env.NOTION_DATABASE_ID!
  );

  console.log("🚀 Testing final meme queueing logic with fixed Blob upload...");

  console.log("💬 Sending /meme post...");
  await postCommand("/meme post");

  console.log("💬 Sending /meme generate coding at 3am...");
  await postCommand("/meme generate coding at 3am");

  console.log("\n🔍 Querying Notion database to verify details field is populated...");
  // Sleep 3 seconds for Notion writes to settle
  await new Promise(r => setTimeout(r, 3000));
  const tasks = await notion.listTasks({ platform: "Instagram" });
  
  console.log(`\n📊 Total tasks found: ${tasks.length}`);
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    console.log(`${i + 1}. Task Name: "${t.name}"`);
    console.log(`   Details URL: "${t.details}"`);
    console.log(`   Platform: "${t.platform}"`);
    console.log(`   Status: "${t.status}"`);
  }
}

main().catch(console.error);
