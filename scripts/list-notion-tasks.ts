import { Client } from "@notionhq/client";
import dotenv from "dotenv";

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function main() {
  const dbId = process.env.NOTION_DATABASE_ID!;
  const res = await notion.databases.query({ database_id: dbId });
  console.log(`Found ${res.results.length} tasks in database:`);
  
  for (const page of res.results as any[]) {
    const rawId = page.id;
    const shortId = rawId.replace(/-/g, "");
    const title = page.properties?.["Task Name"]?.title?.[0]?.plain_text || "Untitled";
    const status = page.properties?.["Status"]?.status?.name || "No status";
    console.log(`\n📌 Task: "${title}"`);
    console.log(`   Full ID: ${rawId}`);
    console.log(`   Status: ${status}`);
    console.log(`   Command to confirm: /confirm_${shortId.slice(-6)}`);
  }
}

main().catch(console.error);
