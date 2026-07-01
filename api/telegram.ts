import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NotionClient } from "../src/services/notion-client.js";
import { GitHubClient } from "../src/services/github-client.js";
import { InstagramClient } from "../src/services/instagram-client.js";
import { TelegramClient } from "../src/services/telegram-client.js";

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

🤖 <b>AI Usage</b>
• <code>/credits</code> - View AI service usage & credit status

📧 <b>Reports</b>
• <code>/email</code> - Send full dashboard report to your email (charts included!)

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
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const emailTo = process.env.EMAIL_TO;

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

        default:
          await telegram.sendMessage("❓ Unknown command. Type <code>/help</code> to see available commands.");
      }
    } else {
      // 2. Natural language message — detect Instagram/AI art intent
      const lower = text.toLowerCase();
      const isInstagramIntent =
        lower.includes("instagram") ||
        lower.includes("post to ig") ||
        lower.includes("ig post") ||
        lower.includes("insta");
      const isAIArtIntent =
        lower.includes("create image") ||
        lower.includes("generate image") ||
        lower.includes("make image") ||
        lower.includes("draw") ||
        lower.includes("ai art") ||
        lower.includes("ai image");
      const isReelIntent =
        lower.includes("reel") ||
        lower.includes("video") ||
        lower.includes("reels") ||
        lower.includes("movie") ||
        lower.includes("animation") ||
        lower.includes("animate");

      if (isReelIntent || (isInstagramIntent && (lower.includes("video") || lower.includes("reel")))) {
        // Strip common trigger phrases for reels
        const prompt = text
          .replace(/post (this |it |video )?to instagram/gi, "")
          .replace(/create (an? )?(animated |reels? )?video (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/generate (an? )?(animated |reels? )?video (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/make (an? )?(animated |reels? )?video (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/post (to )?(instagram|ig|insta)/gi, "")
          .replace(/(instagram|insta|ig) (reels?|video)/gi, "")
          .replace(/animated video/gi, "")
          .replace(/reels?/gi, "")
          .replace(/video/gi, "")
          .trim() || text;

        await telegram.sendMessage("🎬 Detected Reels intent! Generating animated video preview (takes ~30-45s)...");

        try {
          const { VideoGenerator } = await import("../src/services/video-generator.js");
          const generator = new VideoGenerator(process.env.GEMINI_API_KEY);
          const videoUrl = await generator.generateVideo(prompt);

          const igPage = await notion.createTask({
            name: prompt,
            platform: "Instagram",
            priority: "Medium",
            details: videoUrl,
          });

          const igShortId = igPage.id.replace(/-/g, "").slice(-8);

          await telegram.sendMessage(
            `🎬 <b>AI Reel Video Ready!</b>\n\n` +
            `• <b>Prompt:</b> ${prompt}\n` +
            `• <b>Platform:</b> Instagram Reels\n` +
            `• <b>Status:</b> Pending Confirm\n` +
            `🔗 <a href="${videoUrl}">Click to preview video Reel</a>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👉 Happy with it? Send to publish:\n` +
            `<code>/confirm_${igShortId}</code>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
          );
        } catch (err: any) {
          await telegram.sendMessage(`❌ <b>Video generation failed:</b> ${err.message}`);
        }
      } else if (isInstagramIntent || isAIArtIntent) {
        // Strip common trigger phrases to get the actual prompt
        const prompt = text
          .replace(/post (this |it |image )?to instagram/gi, "")
          .replace(/create (an? )?image (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/generate (an? )?image (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/make (an? )?image (and )?post (to )?(instagram|ig|insta)?/gi, "")
          .replace(/post (to )?(instagram|ig|insta)/gi, "")
          .replace(/(instagram|insta|ig) post/gi, "")
          .replace(/ai art/gi, "")
          .replace(/ai image/gi, "")
          .trim() || text;

        await telegram.sendMessage("🎨 Detected Instagram intent! Generating AI image preview...");

        let aiImageUrl = "";
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (geminiApiKey) {
          try {
            const { GeminiClient } = await import("../src/services/gemini-client.js");
            const gemini = new GeminiClient(geminiApiKey);
            aiImageUrl = await gemini.generateImage(prompt, { enhance: true });
          } catch (_) {}
        }
        if (!aiImageUrl) {
          const seed = Math.floor(Math.random() * 1000000);
          aiImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;
        }

        const igPage = await notion.createTask({
          name: prompt,
          platform: "Instagram",
          priority: "Medium",
          details: aiImageUrl,
        });

        const igShortId = igPage.id.replace(/-/g, "").slice(-8);

        await telegram.sendMessage(
          `🎨 <b>AI Image Preview Ready!</b>\n\n` +
          `• <b>Prompt:</b> ${prompt}\n` +
          `• <b>Platform:</b> Instagram\n` +
          `• <b>Status:</b> Pending Confirm\n` +
          `🔗 <a href="${aiImageUrl}">Click to preview image</a>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 Happy with it? Send to publish:\n` +
          `<code>/confirm_${igShortId}</code>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`
        );
      } else {
        // Generic task — save to Notion as General
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
    }

    return res.status(200).json({ status: "success" });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
