import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NotionClient } from "../dist/services/notion-client.js";
import { GitHubClient } from "../dist/services/github-client.js";
import { InstagramClient } from "../dist/services/instagram-client.js";
import { TelegramClient } from "../dist/services/telegram-client.js";

// Basic HTML styling for Telegram messages
const HELP_MESSAGE = `
🤖 <b>Notion MCP Task Orchestrator Bot</b>

Manage your automated workspace directly from chat!

🚀 <b>Available Commands:</b>

📝 <b>Notion</b>
• <code>/todo [Task Name]</code> - Create a new General Notion task
• <code>/run</code> - Run the orchestrator on all pending Notion tasks

🐙 <b>GitHub</b>
• <code>/repo [Repo Name]</code> - Create a new GitHub repository
• <code>/issue [Title] | [owner/repo] | [Body]</code> - Create a GitHub issue

📸 <b>Instagram</b>
• <code>/post [Image URL] | [Caption]</code> - Post an image to Instagram
• <code>/aiart [Post Caption]</code> - Generate a custom AI photo and post it directly to Instagram

<i>Or just type a message, and it will be added as a general task to your Notion database!</i>
`;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests from Telegram
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  const githubToken = process.env.GITHUB_TOKEN;
  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;

  if (!token || !chatId || !notionToken || !notionDbId || !githubToken) {
    return res.status(500).json({ error: "Missing required server credentials" });
  }

  // Initialize service clients
  const telegram = new TelegramClient(token, chatId);
  const notion = new NotionClient(notionToken, notionDbId);
  const github = new GitHubClient(githubToken);
  const instagram =
    instagramToken && instagramUserId
      ? new InstagramClient(instagramToken, instagramUserId)
      : undefined;

  try {
    const update = req.body;
    if (!update || !update.message) {
      return res.status(200).json({ status: "ok", message: "No message received" });
    }

    const message = update.message;
    const text = (message.text || "").trim();
    const senderChatId = String(message.chat.id);

    // Security: Only respond to the authorized chat ID configured in .env
    if (senderChatId !== chatId) {
      await telegram.sendMessage(
        "⚠️ Unauthorized user. You do not have permissions to trigger commands on this orchestrator.",
        senderChatId
      );
      return res.status(200).json({ status: "unauthorized" });
    }

    // 1. Handle commands
    if (text.startsWith("/")) {
      const commandParts = text.split(" ");
      const command = commandParts[0].toLowerCase();
      const args = text.slice(command.length).trim();

      switch (command) {
        case "/start":
        case "/help": {
          await telegram.sendMessage(HELP_MESSAGE);
          break;
        }

        case "/todo": {
          if (!args) {
            await telegram.sendMessage("❌ Please provide a task name. Format: <code>/todo Clean my workspace</code>");
            break;
          }

          const page = await notion.createTask({
            name: args,
            platform: "General",
            priority: "Medium",
            details: "Added via Telegram Bot chat.",
          });

          await telegram.sendMessage(
            `✅ <b>Notion Task Created!</b>\n\n` +
            `• <b>Task:</b> ${args}\n` +
            `• <b>Status:</b> Todo\n` +
            `🔗 <a href="https://notion.so/${page.id.replace(/-/g, "")}">Open in Notion</a>`
          );
          break;
        }

        case "/repo": {
          if (!args) {
            await telegram.sendMessage("❌ Please provide a repository name. Format: <code>/repo my-new-project</code>");
            break;
          }

          await telegram.sendMessage(`⏳ Creating GitHub repository <code>${args}</code>...`);
          
          // Log task to Notion
          const task = await notion.createTask({
            name: `Create repository: ${args}`,
            platform: "GitHub",
            priority: "High",
            githubRepo: args,
            githubAction: "Create Repo",
          });
          await notion.updateTaskStatus(task.id, "In Progress");

          try {
            const repo = await github.createRepo({ name: args });
            await notion.updateTaskStatus(task.id, "Done");
            await notion.writeResult(task.id, `✅ Repository created successfully: ${repo.url}`);

            await telegram.sendMessage(
              `🐙 <b>GitHub Repository Created!</b>\n\n` +
              `• <b>Name:</b> ${repo.name}\n` +
              `• <b>URL:</b> ${repo.url}`
            );
          } catch (gitErr: any) {
            await notion.updateTaskStatus(task.id, "Failed");
            await notion.writeResult(task.id, `❌ Failed: ${gitErr.message}`);
            await telegram.sendMessage(`❌ <b>Failed to create repository:</b> ${gitErr.message}`);
          }
          break;
        }

        case "/issue": {
          // Format: /issue Title | owner/repo | Body
          const parts = args.split("|").map((p: string) => p.trim());
          const [title, repoPath, body] = parts;

          if (!title || !repoPath) {
            await telegram.sendMessage(
              "❌ Invalid format. Please use:\n<code>/issue Issue Title | owner/repo | Issue Description</code>"
            );
            break;
          }

          const [owner, repo] = repoPath.split("/");
          if (!owner || !repo) {
            await telegram.sendMessage("❌ Invalid repo format. Must be <code>owner/repo</code>.");
            break;
          }

          await telegram.sendMessage(`⏳ Creating GitHub issue on <code>${repoPath}</code>...`);

          const task = await notion.createTask({
            name: title,
            platform: "GitHub",
            priority: "Medium",
            githubRepo: repoPath,
            githubAction: "Create Issue",
            details: body || "",
          });
          await notion.updateTaskStatus(task.id, "In Progress");

          try {
            const issue = await github.createIssue({
              owner,
              repo,
              title,
              body: body || undefined,
            });
            await notion.updateTaskStatus(task.id, "Done");
            await notion.writeResult(task.id, `✅ Created issue #${issue.number}: ${issue.url}`);

            await telegram.sendMessage(
              `🐙 <b>GitHub Issue Created!</b>\n\n` +
              `• <b>Issue:</b> #${issue.number} ${issue.title}\n` +
              `• <b>URL:</b> ${issue.url}`
            );
          } catch (gitErr: any) {
            await notion.updateTaskStatus(task.id, "Failed");
            await notion.writeResult(task.id, `❌ Failed: ${gitErr.message}`);
            await telegram.sendMessage(`❌ <b>Failed to create issue:</b> ${gitErr.message}`);
          }
          break;
        }

        case "/post": {
          if (!instagram) {
            await telegram.sendMessage("❌ Instagram client is not configured on this server.");
            break;
          }

          const parts = args.split("|").map((p: string) => p.trim());
          const [imageUrl, caption] = parts;

          if (!imageUrl || !imageUrl.startsWith("http")) {
            await telegram.sendMessage(
              "❌ Invalid image URL. Format: <code>/post https://example.com/photo.jpg | My caption</code>"
            );
            break;
          }

          await telegram.sendMessage("⏳ Uploading and publishing photo to Instagram...");

          const task = await notion.createTask({
            name: caption || "Instagram Post",
            platform: "Instagram",
            priority: "Medium",
            details: imageUrl,
          });
          await notion.updateTaskStatus(task.id, "In Progress");

          try {
            const res = await instagram.publishPhoto(imageUrl, caption || "");
            await notion.updateTaskStatus(task.id, "Done");
            await notion.writeResult(task.id, `✅ Instagram published. Media ID: ${res.mediaId}`);

            await telegram.sendMessage(
              `📸 <b>Instagram Post Published!</b>\n\n` +
              `• <b>Caption:</b> ${caption || "None"}\n` +
              `• <b>Media ID:</b> <code>${res.mediaId}</code>`
            );
          } catch (igErr: any) {
            await notion.updateTaskStatus(task.id, "Failed");
            await notion.writeResult(task.id, `❌ Failed: ${igErr.message}`);
            await telegram.sendMessage(`❌ <b>Instagram publishing failed:</b> ${igErr.message}`);
          }
          break;
        }

        case "/aiart": {
          if (!instagram) {
            await telegram.sendMessage("❌ Instagram client is not configured on this server.");
            break;
          }

          if (!args) {
            await telegram.sendMessage("❌ Please provide a caption prompt. Format: <code>/aiart A beautiful sunset</code>");
            break;
          }

          await telegram.sendMessage(`🎨 Generating AI image & posting to Instagram...`);

          const seed = Math.floor(Math.random() * 1000000);
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

          const task = await notion.createTask({
            name: args,
            platform: "Instagram",
            priority: "Medium",
            details: imageUrl,
          });
          await notion.updateTaskStatus(task.id, "In Progress");

          try {
            const res = await instagram.publishPhoto(imageUrl, args);
            await notion.updateTaskStatus(task.id, "Done");
            await notion.writeResult(task.id, `✅ Instagram published. Media ID: ${res.mediaId}`);

            await telegram.sendMessage(
              `🎨 <b>AI Art Generated & Posted to Instagram!</b>\n\n` +
              `• <b>Prompt / Caption:</b> ${args}\n` +
              `• <b>Media ID:</b> <code>${res.mediaId}</code>\n` +
              `• <b>Image Link:</b> <a href="${imageUrl}">Open image</a>`
            );
          } catch (igErr: any) {
            await notion.updateTaskStatus(task.id, "Failed");
            await notion.writeResult(task.id, `❌ Failed: ${igErr.message}`);
            await telegram.sendMessage(`❌ <b>Instagram publishing failed:</b> ${igErr.message}`);
          }
          break;
        }

        case "/run": {
          await telegram.sendMessage("⏳ Running orchestrator engine to check pending tasks...");

          // Simulate GET request to the local cron endpoint
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host;
          const cronUrl = `${protocol}://${host}/api/cron`;

          try {
            const cronRes = await fetch(cronUrl, {
              headers: {
                Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
              },
            });
            const data: any = await cronRes.json();

            if (!cronRes.ok) {
              throw new Error(data.error || "Failed to trigger cron processor");
            }

            await telegram.sendMessage(
              `✅ <b>Task Processor Finished!</b>\n\n` +
              `• <b>Message:</b> ${data.message}\n` +
              `• <b>Summary:</b>\n${data.summary?.join("\n") || "No tasks processed."}`
            );
          } catch (cronErr: any) {
            await telegram.sendMessage(`❌ <b>Task Processor Engine Error:</b> ${cronErr.message}`);
          }
          break;
        }

        default:
          await telegram.sendMessage("❓ Unknown command. Type <code>/help</code> to see available commands.");
      }
    } else {
      // 2. Normal text message (no slash command) -> Add as a General task in Notion
      const page = await notion.createTask({
        name: text,
        platform: "General",
        priority: "Medium",
        details: "Added via conversational Telegram message.",
      });

      await telegram.sendMessage(
        `📝 <b>Added to Notion Inbox</b>\n\n` +
        `• <b>Task:</b> ${text}\n` +
        `🔗 <a href="https://notion.so/${page.id.replace(/-/g, "")}">Open in Notion</a>`
      );
    }

    return res.status(200).json({ status: "success" });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
