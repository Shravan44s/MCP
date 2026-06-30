// ============================================
// Setup Script — Auto-creates the Notion DB
// Run: npx tsx scripts/setup-notion-db.ts
// ============================================
import "dotenv/config";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function main() {
  console.log("\n🔧 Notion Task Orchestrator — Database Setup\n");
  console.log("━".repeat(50));

  // Step 1: Find a parent page to place the database in
  console.log("\n📄 Searching for your Notion pages...\n");

  const searchResult = await notion.search({
    filter: { property: "object", value: "page" },
    page_size: 20,
  });

  const pages = searchResult.results.filter(
    (r: any) => r.object === "page"
  ) as any[];

  if (pages.length === 0) {
    console.error(
      "❌ No pages found! Make sure your Notion integration is connected to at least one page."
    );
    console.error(
      "   Go to a Notion page → ⋯ → Connections → Add your integration."
    );
    process.exit(1);
  }

  // List pages and use the first one
  console.log("Found pages your integration can access:\n");
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const titleProp = Object.values(page.properties || {}).find(
      (p: any) => p.type === "title"
    ) as any;
    const title =
      titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled";
    console.log(`  ${i + 1}. "${title}" (ID: ${page.id})`);
  }

  // Use the first page as the parent
  const parentPage = pages[0];
  const parentTitle = (() => {
    const titleProp = Object.values(parentPage.properties || {}).find(
      (p: any) => p.type === "title"
    ) as any;
    return (
      titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled"
    );
  })();

  console.log(`\n📌 Creating database inside: "${parentTitle}"\n`);

  // Step 2: Create the database with all required columns
  const database = await notion.databases.create({
    parent: { page_id: parentPage.id },
    title: [
      {
        type: "text",
        text: { content: "🚀 MCP Task Orchestrator" },
      },
    ],
    icon: { type: "emoji", emoji: "🚀" },
    properties: {
      // Title column (required)
      "Task Name": {
        title: {},
      },

      // Platform selector
      Platform: {
        select: {
          options: [
            { name: "GitHub", color: "gray" },
            { name: "Instagram", color: "pink" },
            { name: "VSCode", color: "blue" },
            { name: "General", color: "default" },
          ],
        },
      },

      // Status column
      Status: {
        status: {
          options: [
            { name: "Todo", color: "default" },
            { name: "In Progress", color: "blue" },
            { name: "Done", color: "green" },
            { name: "Failed", color: "red" },
          ],
          groups: [
            {
              name: "To-do",
              color: "gray",
              option_ids: [] as string[],
            },
            {
              name: "In progress",
              color: "blue",
              option_ids: [] as string[],
            },
            {
              name: "Complete",
              color: "green",
              option_ids: [] as string[],
            },
          ],
        },
      },

      // Priority
      Priority: {
        select: {
          options: [
            { name: "High", color: "red" },
            { name: "Medium", color: "yellow" },
            { name: "Low", color: "green" },
          ],
        },
      },

      // GitHub-specific fields
      "GitHub Repo": {
        rich_text: {},
      },
      "GitHub Action": {
        select: {
          options: [
            { name: "Create Issue", color: "purple" },
            { name: "Create PR", color: "blue" },
            { name: "Commit File", color: "green" },
            { name: "List Issues", color: "gray" },
            { name: "List Repos", color: "default" },
            { name: "Get Repo", color: "orange" },
          ],
        },
      },

      // VS Code-specific fields
      "VSCode Project Path": {
        rich_text: {},
      },
      "VSCode Command": {
        rich_text: {},
      },

      // General fields
      Details: {
        rich_text: {},
      },
      Result: {
        rich_text: {},
      },
    },
  });

  console.log("✅ Database created successfully!\n");
  console.log("━".repeat(50));
  console.log(`\n📋 Database Name: 🚀 MCP Task Orchestrator`);
  console.log(`📎 Database ID:   ${database.id}`);
  console.log(
    `🔗 Open in Notion: https://notion.so/${database.id.replace(/-/g, "")}`
  );
  console.log("\n━".repeat(50));

  console.log(`\n📝 Next step: Update your .env file:\n`);
  console.log(`   NOTION_DATABASE_ID=${database.id}`);
  console.log("");

  // Step 3: Create a sample task so the user sees the structure
  console.log("📦 Creating sample tasks so you can see the structure...\n");

  await notion.pages.create({
    parent: { database_id: database.id },
    icon: { type: "emoji", emoji: "🐙" },
    properties: {
      "Task Name": {
        title: [
          { text: { content: "Create a bug report issue on my repo" } },
        ],
      },
      Platform: { select: { name: "GitHub" } },
      Status: { status: { name: "Todo" } },
      Priority: { select: { name: "High" } },
      "GitHub Repo": {
        rich_text: [{ text: { content: "your-username/your-repo" } }],
      },
      "GitHub Action": { select: { name: "Create Issue" } },
      Details: {
        rich_text: [
          {
            text: {
              content:
                "There is a login bug where users get logged out after 5 minutes. This needs to be fixed ASAP.",
            },
          },
        ],
      },
    },
  });

  await notion.pages.create({
    parent: { database_id: database.id },
    icon: { type: "emoji", emoji: "💻" },
    properties: {
      "Task Name": {
        title: [{ text: { content: "Run tests on my project" } }],
      },
      Platform: { select: { name: "VSCode" } },
      Status: { status: { name: "Todo" } },
      Priority: { select: { name: "Medium" } },
      "VSCode Project Path": {
        rich_text: [{ text: { content: "/Users/shravanhajare/Desktop/MCP" } }],
      },
      "VSCode Command": {
        rich_text: [{ text: { content: "npm run build" } }],
      },
      Details: {
        rich_text: [
          {
            text: {
              content:
                "Build the project to make sure everything compiles correctly.",
            },
          },
        ],
      },
    },
  });

  await notion.pages.create({
    parent: { database_id: database.id },
    icon: { type: "emoji", emoji: "📸" },
    properties: {
      "Task Name": {
        title: [
          { text: { content: "Post project launch announcement on Instagram" } },
        ],
      },
      Platform: { select: { name: "Instagram" } },
      Status: { status: { name: "Todo" } },
      Priority: { select: { name: "Low" } },
      Details: {
        rich_text: [
          {
            text: {
              content:
                "Share a screenshot of the project with a caption about the launch. Use ig-mcp tools to publish.",
            },
          },
        ],
      },
    },
  });

  console.log("   ✅ Sample GitHub task created");
  console.log("   ✅ Sample VS Code task created");
  console.log("   ✅ Sample Instagram task created");

  console.log("\n🎉 All done! Your Notion database is ready to use.\n");
  console.log("━".repeat(50));
  console.log(`\n🔑 Don't forget to update .env with:\n`);
  console.log(`   NOTION_DATABASE_ID=${database.id}\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  if (err.code === "unauthorized") {
    console.error(
      "\n   Your NOTION_TOKEN might be invalid. Get a new one from:"
    );
    console.error("   https://www.notion.so/my-integrations\n");
  }
  if (err.code === "validation_error") {
    console.error("\n   Make sure your integration is connected to a page:");
    console.error(
      "   Open a Notion page → ⋯ → Connections → Add your integration\n"
    );
  }
  process.exit(1);
});
