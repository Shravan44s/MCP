import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NotionClient } from "../src/services/notion-client.js";
import { GitHubClient } from "../src/services/github-client.js";
import { InstagramClient } from "../src/services/instagram-client.js";
import { TelegramClient } from "../src/services/telegram-client.js";
import { GeminiClient } from "../src/services/gemini-client.js";
import { OpenCodeChatClient } from "../src/services/opencode-client.js";
import { MemeService } from "../src/services/meme-service.js";

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
• <code>/aiart [Post Caption]</code> - Generate AI art, review, then confirm to post
• <code>/reel [Video Prompt]</code> - Generate an animated video Reel, review, then confirm to post
• <code>/igstats</code> - 📊 Instagram analytics dashboard

😂 <b>Memes</b>
• <code>/meme</code> - Fetch a random trending meme (preview + confirm)
• <code>/meme [topic]</code> - Search memes about a topic (e.g. /meme marriage)
• <code>/aiimage [concept]</code> - AI-generate a meme image (preview + confirm)

🤖 <b>AI Usage</b>
• <code>/credits</code> - View AI service usage & credit status

📧 <b>Reports</b>
• <code>/email</code> - Send full dashboard report to your email (charts included!)

<i>Type normally to chat with AI. Prefix with "task" or "todo" to add to Notion.</i>
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
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const emailTo = process.env.EMAIL_TO;
  const geminiApiKey = process.env.GEMINI_API_KEY;

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

      if (command.startsWith("/confirm_")) {
        const shortId = command.replace("/confirm_", "");
        await telegram.sendMessage("⏳ Verifying task and publishing to Instagram...");

        try {
          const tasks = await notion.listTasks({ status: "Todo" });
          const task = tasks.find((t) => t.id.replace(/-/g, "").endsWith(shortId));

          if (!task) {
            await telegram.sendMessage("❌ Pending task not found or already processed.");
            return res.status(200).json({ status: "not_found" });
          }

          if (!instagram) {
            await telegram.sendMessage("❌ Instagram client is not configured on this server.");
            return res.status(200).json({ status: "unconfigured" });
          }

          const imageUrl = task.details;
          if (!imageUrl || !imageUrl.startsWith("http")) {
            await telegram.sendMessage("❌ Invalid image URL found in task details.");
            return res.status(200).json({ status: "invalid_details" });
          }

          await notion.updateTaskStatus(task.id, "In Progress");
          
          let publishRes;
          if (imageUrl.endsWith(".mp4") || imageUrl.includes(".mp4")) {
            await telegram.sendMessage("🎬 Processing and rendering video Reel on Instagram servers (this takes ~1-2 mins)...");
            publishRes = await instagram.publishReel(imageUrl, task.name);
          } else {
            publishRes = await instagram.publishPhoto(imageUrl, task.name);
          }
          
          await notion.updateTaskStatus(task.id, "Done");
          await notion.writeResult(task.id, `✅ Published to Instagram. Media ID: ${publishRes.mediaId}`);

          await telegram.sendMessage(
            `🚀 <b>Instagram Post Deployed!</b>\n\n` +
            `• <b>Caption:</b> ${task.name}\n` +
            `• <b>Media ID:</b> <code>${publishRes.mediaId}</code>\n` +
            `🔗 <a href="https://instagram.com/">View on Instagram</a>`
          );
        } catch (err: any) {
          await telegram.sendMessage(`❌ <b>Failed to publish post:</b> ${err.message}`);
        }
        return res.status(200).json({ status: "success" });
      }

      switch (command) {
        case "/start":
        case "/help": {
          await telegram.sendMessage(HELP_MESSAGE);
          break;
        }

        case "/email": {
          if (!gmailUser || !gmailAppPassword || !emailTo) {
            await telegram.sendMessage(
              `❌ <b>Email not configured.</b> Add these to your <code>.env</code>:\n\n` +
              `<code>GMAIL_USER=you@gmail.com</code>\n` +
              `<code>GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx</code>\n` +
              `<code>EMAIL_TO=recipient@email.com</code>\n\n` +
              `<a href="https://myaccount.google.com/apppasswords">Generate Gmail App Password →</a>`
            );
            break;
          }

          await telegram.sendMessage("⏳ Building your dashboard report... This may take ~10 seconds.");

          try {
            const { sendDashboardEmail } = await import("../src/services/email-client.js");
            const notionSvc = new NotionClient(notionToken, notionDbId);

            // Gather all data in parallel
            const [todoTasks, inProgressTasks, doneTasks, failedTasks] = await Promise.all([
              notionSvc.listTasks({ status: "Todo" }),
              notionSvc.listTasks({ status: "In Progress" }),
              notionSvc.listTasks({ status: "Done" }),
              notionSvc.listTasks({ status: "Failed" }),
            ]);

            const allTasks = [...doneTasks, ...inProgressTasks, ...todoTasks, ...failedTasks];
            const recentTasks = allTasks.slice(0, 8).map(t => ({
              name: t.name,
              platform: t.platform,
              status: t.status,
            }));

            // Instagram stats
            let igData: any = undefined;
            if (instagram) {
              try {
                const [stats, insights, media] = await Promise.all([
                  instagram.getAccountStats(),
                  instagram.getInsights().catch(() => ({ impressions: 0, reach: 0, profileViews: 0 })),
                  instagram.getRecentMedia(5).catch(() => []),
                ]);
                igData = {
                  username: stats.username,
                  followers: stats.followers,
                  following: stats.following,
                  mediaCount: stats.mediaCount,
                  impressions: insights.impressions,
                  reach: insights.reach,
                  profileViews: insights.profileViews,
                  recentMedia: media.map(m => ({
                    caption: m.caption,
                    likes: m.likes,
                    comments: m.comments,
                    timestamp: m.timestamp,
                  })),
                };
              } catch (_) {}
            }

            // OpenCode stats from SQLite
            let opencodeTokensTotal = 0;
            let opencodeSessions = 0;
            let opencodeModel = "deepseek-v4-flash-free";
            try {
              const Database = (await import("better-sqlite3")).default;
              const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
              const db = new Database(dbPath, { readonly: true, fileMustExist: true });
              const totals = db.prepare("SELECT SUM(tokens_input) as ti, SUM(tokens_output) as to2, SUM(tokens_reasoning) as tr, COUNT(*) as cnt FROM session").get() as any;
              const topModel = db.prepare("SELECT model FROM session WHERE model IS NOT NULL GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1").get() as any;
              db.close();
              opencodeTokensTotal = (totals?.ti || 0) + (totals?.to2 || 0) + (totals?.tr || 0);
              opencodeSessions = totals?.cnt || 0;
              try { opencodeModel = JSON.parse(topModel?.model || "{}").id || opencodeModel; } catch (_) {}
            } catch (_) {}

            const geminiReqsToday = doneTasks.filter(t => t.platform === "Instagram").length + todoTasks.filter(t => t.platform === "Instagram").length;
            const geminiTokensUsed = geminiReqsToday * 800;
            const geminiRemaining = Math.max(0, 1_000_000 - geminiTokensUsed);

            await sendDashboardEmail(emailTo, {
              instagram: igData,
              notion: {
                todo: todoTasks.length,
                inProgress: inProgressTasks.length,
                done: doneTasks.length,
                failed: failedTasks.length,
                recentTasks,
              },
              credits: {
                geminiReqsToday,
                geminiTokensUsed,
                geminiRemaining,
                opencodeTokensTotal,
                opencodeSessions,
                opencodeModel,
              },
            }, gmailUser, gmailAppPassword);

            await telegram.sendMessage(
              `📧 <b>Dashboard Report Sent!</b>\n\n` +
              `✅ Email delivered to <code>${emailTo}</code>\n\n` +
              `📊 Report includes:\n` +
              `  • Instagram analytics + bar chart\n` +
              `  • Notion tasks breakdown + pie chart\n` +
              `  • AI credits & usage (Gemini, OpenCode)\n` +
              `  • Recent ${recentTasks.length} tasks list`
            );
          } catch (emailErr: any) {
            await telegram.sendMessage(`❌ <b>Failed to send email:</b> ${emailErr.message}`);
          }
          break;
        }

        case "/igstats": {
          if (!instagram) {
            await telegram.sendMessage("❌ Instagram client is not configured.");
            break;
          }
          await telegram.sendMessage("⏳ Fetching Instagram analytics...");
          try {
            const [stats, insights, media] = await Promise.all([
              instagram.getAccountStats(),
              instagram.getInsights().catch(() => null),
              instagram.getRecentMedia(5).catch(() => []),
            ]);

            const fmt = (n: number) => n.toLocaleString("en-IN");
            const ago = (ts: string) => {
              const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
              return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
            };

            let msg =
              `📊 <b>Instagram Dashboard</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👤 <b>@${stats.username}</b>\n\n` +
              `👥 <b>Followers:</b>  ${fmt(stats.followers)}\n` +
              `➡️ <b>Following:</b>  ${fmt(stats.following)}\n` +
              `🖼️ <b>Total Posts:</b> ${fmt(stats.mediaCount)}\n`;

            if (insights) {
              msg +=
                `\n📈 <b>Last 7 Days</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👁️ <b>Impressions:</b>    ${fmt(insights.impressions)}\n` +
                `🌐 <b>Reach:</b>          ${fmt(insights.reach)}\n` +
                `🔍 <b>Profile Views:</b>  ${fmt(insights.profileViews)}\n`;
            }

            if (media.length > 0) {
              msg += `\n🕒 <b>Recent Posts</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
              for (const m of media) {
                const cap = (m.caption || "No caption").substring(0, 35);
                msg += `• ${ago(m.timestamp)} | ❤️ ${m.likes} 💬 ${m.comments} | <i>${cap}...</i>\n`;
              }
            }

            msg += `\n🔗 <a href="https://instagram.com/${stats.username}">View Profile</a>`;
            await telegram.sendMessage(msg);
          } catch (e: any) {
            await telegram.sendMessage(`❌ <b>Failed to fetch stats:</b> ${e.message}`);
          }
          break;
        }

        case "/credits": {
          await telegram.sendMessage("⏳ Fetching AI service status...");
          try {
            const notion = new NotionClient(notionToken, notionDbId);

            const [doneTasks, todoTasks] = await Promise.all([
              notion.listTasks({ status: "Done", platform: "Instagram" }),
              notion.listTasks({ status: "Todo", platform: "Instagram" }),
            ]);

            const geminiKey = process.env.GEMINI_API_KEY;
            const geminiStatus = geminiKey ? "✅ Configured" : "⚠️ Not Set";

            // Read OpenCode usage directly via native SQLite (better-sqlite3)
            let opencodeSection = "";
            try {
              const Database = (await import("better-sqlite3")).default;
              const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
              const db = new Database(dbPath, { readonly: true, fileMustExist: true });

              // All-time totals
              const totals = db.prepare(
                "SELECT SUM(tokens_input) as ti, SUM(tokens_output) as to2, SUM(tokens_reasoning) as tr, SUM(cost) as cost, COUNT(*) as cnt FROM session"
              ).get() as any;

              // Today's usage (midnight UTC in ms)
              const todayMs = new Date().setHours(0, 0, 0, 0);
              const today = db.prepare(
                "SELECT SUM(tokens_input) as ti, SUM(tokens_output) as to2, SUM(tokens_reasoning) as tr, COUNT(*) as cnt FROM session WHERE time_created >= ?"
              ).get(todayMs) as any;

              const topModel = db.prepare(
                "SELECT model, COUNT(*) as cnt FROM session WHERE model IS NOT NULL GROUP BY model ORDER BY cnt DESC LIMIT 1"
              ).get() as any;

              db.close();

              let modelId = "unknown";
              try { modelId = JSON.parse(topModel?.model || "{}").id || "unknown"; } catch (_) {}

              const fmtN = (n: number) => (n || 0).toLocaleString("en-IN");
              const todayTotal = (today?.ti || 0) + (today?.to2 || 0) + (today?.tr || 0);
              const allTimeTotal = (totals?.ti || 0) + (totals?.to2 || 0) + (totals?.tr || 0);

              // Progress bar helper (10 blocks)
              const bar = (used: number, max: number) => {
                const pct = Math.min(used / max, 1);
                const filled = Math.round(pct * 10);
                return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${(pct * 100).toFixed(1)}%`;
              };

              opencodeSection =
                `\n💻 <b>OpenCode (AI Coding Assistant)</b>\n` +
                `   • Model: <code>${modelId}</code> (Free)\n` +
                `   • Limit: Dynamic (no fixed daily cap)\n` +
                `   📅 <b>Today</b>\n` +
                `      ├ Sessions: <b>${today?.cnt || 0}</b>\n` +
                `      ├ Tokens In:  <b>${fmtN(today?.ti)}</b>\n` +
                `      ├ Tokens Out: <b>${fmtN(today?.to2)}</b>\n` +
                `      └ Total:      <b>${fmtN(todayTotal)}</b>\n` +
                `   📊 <b>All-Time</b>\n` +
                `      ├ Sessions: <b>${fmtN(totals?.cnt)}</b>\n` +
                `      └ Total Tokens: <b>${fmtN(allTimeTotal)}</b>\n` +
                `   💰 Cost: <b>$${(totals?.cost || 0).toFixed(4)}</b>\n`;
            } catch (err: any) {
              opencodeSection = `\n💻 <b>OpenCode</b>: ⚠️ DB error: ${err.message}\n`;
            }

            // Gemini free-tier: 1M tokens/day, 250 req/day
            // Track today's /aiart requests as Gemini calls (each aiart = 1 Gemini call)
            const GEMINI_DAILY_TOKEN_LIMIT = 1_000_000;
            const GEMINI_DAILY_REQ_LIMIT = 250;
            const geminiReqsToday = doneTasks.filter(() => true).length + todoTasks.length; // approx
            const geminiTokensEstimate = geminiReqsToday * 800; // ~800 tokens avg per enhance call
            const geminiRemaining = Math.max(0, GEMINI_DAILY_TOKEN_LIMIT - geminiTokensEstimate);
            const geminiPct = Math.min((geminiTokensEstimate / GEMINI_DAILY_TOKEN_LIMIT) * 100, 100).toFixed(1);



            const fmtBig = (n: number) => n.toLocaleString("en-IN");
            const usageBar = (used: number, max: number) => {
              const pct = Math.min(used / max, 1);
              const filled = Math.round(pct * 10);
              return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
            };

            const msg =
              `🤖 <b>AI Credits Dashboard</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `🧠 <b>Gemini 2.5 Flash</b> (Prompt Enhancer)\n` +
              `   • Status: ${geminiStatus}\n` +
              `   • Limit: 1,000,000 tokens/day · 250 req/day\n` +
              `   📅 Today (~est.)\n` +
              `      ├ Requests used: <b>${geminiReqsToday}</b> / 250\n` +
              `      ├ Tokens used: <b>~${fmtBig(geminiTokensEstimate)}</b>\n` +
              `      ├ Remaining: <b>~${fmtBig(geminiRemaining)}</b>\n` +
              `      └ [${usageBar(geminiTokensEstimate, GEMINI_DAILY_TOKEN_LIMIT)}] ${geminiPct}%\n` +
              `   💰 Cost: <b>$0.00</b>\n\n` +
              `🎨 <b>Pollinations.ai FLUX</b> (Image Gen)\n` +
              `   • Status: ✅ Active · Free (Unlimited)\n` +
              `   • Remaining: <b>∞ Unlimited</b>\n` +
              `   💰 Cost: <b>$0.00</b>\n\n` +
              `☁️ <b>Catbox.moe</b> (Image Hosting)\n` +
              `   • Status: ✅ Active · Free\n` +
              `   • Remaining: <b>∞ Unlimited</b>\n` +
              `   💰 Cost: <b>$0.00</b>\n` +

              opencodeSection +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📊 <b>Instagram Bot Stats</b>\n` +
              `   • Total Posts Published: <b>${doneTasks.length}</b>\n` +
              `   • Pending Tasks: <b>${todoTasks.length}</b>\n\n` +
              `💰 <b>Total AI Spend: $0.00</b> (All free!)`;

            await telegram.sendMessage(msg);
          } catch (e: any) {
            await telegram.sendMessage(`❌ <b>Failed to fetch credit info:</b> ${e.message}`);
          }
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

          // Always require confirmation before posting — never post directly
          await telegram.sendMessage("⏳ Creating Instagram task for review...");

          const postTask = await notion.createTask({
            name: caption || "Instagram Post",
            platform: "Instagram",
            priority: "Medium",
            details: imageUrl,
          });

          const postShortId = postTask.id.replace(/-/g, "").slice(-8);

          await telegram.sendMessage(
            `📸 <b>Instagram Post Ready for Review!</b>\n\n` +
            `• <b>Caption:</b> ${caption || "None"}\n` +
            `• <b>Image:</b> <a href="${imageUrl}">Click to preview</a>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👉 To publish to Instagram, send:\n` +
            `<code>/confirm_${postShortId}</code>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
          );
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

          await telegram.sendMessage("🎨 Generating your AI image preview...");

          let imageUrl = "";
          const geminiApiKey = process.env.GEMINI_API_KEY;

          if (geminiApiKey) {
            try {
              const { GeminiClient } = await import("../src/services/gemini-client.js");
              const gemini = new GeminiClient(geminiApiKey);
              imageUrl = await gemini.generateImage(args, { enhance: true });
            } catch (err: any) {
              await telegram.sendMessage(`⚠️ Gemini generation failed: ${err.message}. Falling back to default generator.`);
            }
          }

          if (!imageUrl) {
            const seed = Math.floor(Math.random() * 1000000);
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;
          }

          // Create the task in Notion with the generated image URL in Details
          const page = await notion.createTask({
            name: args,
            platform: "Instagram",
            priority: "Medium",
            details: imageUrl,
          });

          const shortId = page.id.replace(/-/g, "").slice(-8);

          await telegram.sendMessage(
            `🎨 <b>AI Image Preview Generated!</b>\n\n` +
            `• <b>Prompt:</b> ${args}\n` +
            `• <b>Notion Status:</b> Todo (Pending Confirm)\n` +
            `🔗 <a href="${imageUrl}">Click here to see the image</a>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👉 To publish this photo to Instagram, send:\n` +
            `<code>/confirm_${shortId}</code>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
          );
          break;
        }

        case "/reel": {
          if (!instagram) {
            await telegram.sendMessage("❌ Instagram client is not configured on this server.");
            break;
          }

          if (!args) {
            await telegram.sendMessage("❌ Please provide a prompt. Format: <code>/reel A cool cyberpunk city</code>");
            break;
          }

          await telegram.sendMessage("🎬 Generating and compiling your animated Reel video (takes ~30-45s)...");

          try {
            const { VideoGenerator } = await import("../src/services/video-generator.js");
            const generator = new VideoGenerator(process.env.GEMINI_API_KEY);
            const videoUrl = await generator.generateVideo(args);

            const page = await notion.createTask({
              name: args,
              platform: "Instagram",
              priority: "Medium",
              details: videoUrl,
            });

            const shortId = page.id.replace(/-/g, "").slice(-8);

            await telegram.sendMessage(
              `🎬 <b>AI Reel Video Generated!</b>\n\n` +
              `• <b>Prompt:</b> ${args}\n` +
              `• <b>Notion Status:</b> Todo (Pending Confirm)\n` +
              `🔗 <a href="${videoUrl}">Click here to view the video Reel</a>\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👉 To publish this Reel to Instagram, send:\n` +
              `<code>/confirm_${shortId}</code>\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━`
            );
          } catch (err: any) {
            await telegram.sendMessage(`❌ <b>Video generation failed:</b> ${err.message}`);
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

        case "/meme": {
          const memeService = new MemeService();
          const memeQuery = args.trim();

          if (!memeQuery) {
            // No description: show a random trending meme as preview
            await telegram.sendMessage("😂 Fetching a random trending meme...");
            try {
              const meme = await memeService.fetchRandom();
              const caption = `${meme.title} 😂\n\n#memes #funny #viral #trending #relatable`;
              const page = await notion.createTask({
                name: caption,
                platform: "Instagram",
                priority: "Medium",
                details: meme.imageUrl,
              });
              const memeShortId = page.id.replace(/-/g, "").slice(-6);

              await telegram.sendMessage(
                `😂 <b>Trending Meme Preview</b>\n\n` +
                `📝 <b>Title:</b> ${meme.title}\n` +
                `⬆️ <b>Upvotes:</b> ${meme.upvotes} • ${meme.source} (r/${meme.subreddit})\n\n` +
                `🔗 <a href="${meme.imageUrl}">🖼 Preview Image</a>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👉 Happy with it? Confirm to post:\n` +
                `<code>/confirm_${memeShortId}</code>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`
              );
            } catch (memeErr: any) {
              await telegram.sendMessage(`❌ Failed to fetch meme: ${memeErr.message}`);
            }
          } else {
            // Search for memes related to the description
            await telegram.sendMessage(`🔍 Searching for memes about "<b>${memeQuery}</b>"...`);
            try {
              const memes = await memeService.searchByTopic(memeQuery, 5);

              if (memes.length === 0) {
                await telegram.sendMessage(`😢 No memes found for "${memeQuery}". Try a different topic!`);
                break;
              }

              const best = memes[0];
              const caption = `${best.title} 😂\n\n#memes #funny #${memeQuery.replace(/\s+/g, "").toLowerCase()} #viral #trending`;
              const page = await notion.createTask({
                name: caption,
                platform: "Instagram",
                priority: "Medium",
                details: best.imageUrl,
              });
              const memeShortId = page.id.replace(/-/g, "").slice(-6);

              let msg =
                `😂 <b>Found ${memes.length} meme${memes.length > 1 ? "s" : ""} about "${memeQuery}"</b>\n\n` +
                `🏆 <b>Top Pick:</b>\n` +
                `📝 ${best.title}\n` +
                `⬆️ ${best.upvotes} upvotes • ${best.source}\n` +
                `🔗 <a href="${best.imageUrl}">🖼 Preview Image</a>\n\n`;

              if (memes.length > 1) {
                msg += `📋 <b>Other results:</b>\n`;
                for (let i = 1; i < memes.length; i++) {
                  const m = memes[i];
                  msg += `${i + 1}. ${m.title} (⬆️${m.upvotes}) — <a href="${m.imageUrl}">View</a>\n`;
                }
                msg += `\n`;
              }

              msg +=
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `👉 Happy with the top pick? Confirm to post:\n` +
                `<code>/confirm_${memeShortId}</code>\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

              await telegram.sendMessage(msg);
            } catch (memeErr: any) {
              await telegram.sendMessage(`❌ Failed to search memes: ${memeErr.message}`);
            }
          }
          break;
        }

        case "/aiimage": {
          const aiMemeService = new MemeService();
          const aiConcept = args.trim() || "a funny programming meme about debugging at 3am";
          await telegram.sendMessage(`🎨 Generating AI meme about "<b>${aiConcept}</b>"...`);

          try {
            const result = await aiMemeService.generateAIMeme(aiConcept, geminiApiKey);

            const page = await notion.createTask({
              name: result.caption,
              platform: "Instagram",
              priority: "Medium",
              details: result.imageUrl,
            });
            const aiShortId = page.id.replace(/-/g, "").slice(-6);

            await telegram.sendMessage(
              `🎨 <b>AI Meme Preview Ready!</b>\n\n` +
              `📝 <b>Caption:</b> ${result.caption}\n\n` +
              `🔗 <a href="${result.imageUrl}">🖼 Preview Image</a>\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `👉 Happy with it? Confirm to post:\n` +
              `<code>/confirm_${aiShortId}</code>\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━`
            );
          } catch (aiMemeErr: any) {
            await telegram.sendMessage(`❌ Failed to generate AI meme: ${aiMemeErr.message}`);
          }
          break;
        }

        default:
          await telegram.sendMessage("❓ Unknown command. Type <code>/help</code> to see available commands.");
      }
    } else {
      // 2. Natural language message handling
      const lower = text.toLowerCase();

      // Check if explicitly requesting task creation
      const isExplicitTask = lower.startsWith("task ") || lower.startsWith("todo ");

      if (isExplicitTask) {
        const taskName = text.replace(/^(task|todo)\s+/gi, "").trim();
        const page = await notion.createTask({
          name: taskName,
          platform: "General",
          priority: "Medium",
          details: "Added via conversational task command.",
        });

        await telegram.sendMessage(
          `📝 <b>Added to Notion Inbox</b>\n\n` +
          `• <b>Task:</b> ${taskName}\n` +
          `🔗 <a href="https://notion.so/${page.id.replace(/-/g, "")}">Open in Notion</a>`
        );
      } else {
        // Respond back normally via conversational AI
        const chatSystemPrompt = "You are a helpful, witty, and concise coding & productivity assistant integrated as a Telegram bot. Keep your responses engaging and concise (under 200 words). Format your output in basic clean HTML styling if using bold, lists, or headers (e.g. <b>bold</b>, <i>italic</i>, <code>code</code>) so that it formats nicely on Telegram. Do NOT use markdown formatting.";

        let chatResponse: string | null = null;

        // Try OpenCode first (free, uses deepseek via local server)
        try {
          const opencode = new OpenCodeChatClient();
          chatResponse = await opencode.chat(text, chatSystemPrompt);
          console.log("✅ OpenCode responded successfully");
        } catch (ocErr: any) {
          console.warn("⚠️ OpenCode unavailable, trying Gemini fallback:", ocErr.message);
        }

        // Fallback to Gemini if OpenCode failed
        if (!chatResponse && geminiApiKey) {
          try {
            const gemini = new GeminiClient(geminiApiKey);
            chatResponse = await gemini.chat(text, chatSystemPrompt);
            console.log("✅ Gemini responded successfully");
          } catch (geminiErr: any) {
            console.warn("⚠️ Gemini also failed:", geminiErr.message);
          }
        }

        if (chatResponse) {
          await telegram.sendMessage(chatResponse);
        } else {
          await telegram.sendMessage(
            `🤖 <b>Notion MCP Task Assistant</b>\n\n` +
            `• To add a task, prefix with <code>task</code> or <code>todo</code>.\n` +
            `• Use <code>/meme [topic]</code> to find memes.\n` +
            `• Use <code>/aiimage [idea]</code> to generate AI memes.`
          );
        }
      }
    }

    return res.status(200).json({ status: "success" });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
