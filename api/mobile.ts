import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NotionClient } from "../src/services/notion-client.js";
import { GitHubClient } from "../src/services/github-client.js";
import { InstagramClient } from "../src/services/instagram-client.js";
import { TelegramClient } from "../src/services/telegram-client.js";
import { GeminiClient } from "../src/services/gemini-client.js";
import { OpenCodeChatClient } from "../src/services/opencode-client.js";
import { MemeService } from "../src/services/meme-service.js";
import { VideoGenerator } from "../src/services/video-generator.js";
import { publishMemeAsReel } from "../src/services/publisher.js";
import { generateSmartCaption } from "../src/services/caption-service.js";
import { MemeLedger } from "../src/services/meme-ledger.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 1. Authenticate Request
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.MOBILE_API_KEY || "pami_mcp_secret_key_2026";

  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return res.status(401).json({ success: false, error: "Unauthorized mobile request" });
  }

  // 2. Load API credentials
  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  const githubToken = process.env.GITHUB_TOKEN;
  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const githubMediaRepo = process.env.GITHUB_MEDIA_REPO;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!notionToken || !notionDbId || !githubToken) {
    return res.status(500).json({
      success: false,
      error: "Missing environment variables: NOTION_TOKEN, NOTION_DATABASE_ID, GITHUB_TOKEN on backend host",
    });
  }

  const action = req.query.action as string;

  try {
    const notion = new NotionClient(notionToken, notionDbId);
    const github = new GitHubClient(githubToken);
    const instagram = instagramToken && instagramUserId ? new InstagramClient(instagramToken, instagramUserId) : undefined;
    const telegram = token && chatId ? new TelegramClient(token, chatId) : undefined;
    const memeService = new MemeService();
    const videoGenerator = new VideoGenerator(geminiApiKey, githubToken, githubMediaRepo);

    switch (action) {
      // ---- General Dashboard ----
      case "dashboard": {
        const [todo, inProgress, done, failed] = await Promise.all([
          notion.listTasks({ status: "Todo" }),
          notion.listTasks({ status: "In Progress" }),
          notion.listTasks({ status: "Done" }),
          notion.listTasks({ status: "Failed" }),
        ]);

        let igData = null;
        if (instagram) {
          try {
            igData = await instagram.getAccountStats();
          } catch (e: any) {
            console.error("IG fetch error on dashboard:", e.message);
          }
        }

        const recentTasks = [...done, ...inProgress, ...todo, ...failed]
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            name: t.name,
            platform: t.platform,
            status: t.status,
            priority: t.priority,
            details: t.details,
          }));

        return res.status(200).json({
          success: true,
          data: {
            tasksCount: {
              todo: todo.length,
              inProgress: inProgress.length,
              done: done.length,
              failed: failed.length,
            },
            instagram: igData,
            recentTasks,
          },
        });
      }

      // ---- Tasks ----
      case "tasks": {
        const status = req.query.status as any;
        const platform = req.query.platform as any;
        const tasks = await notion.listTasks({ status, platform });
        return res.status(200).json({ success: true, data: tasks });
      }

      case "createTask": {
        const { name, platform, details, priority, githubRepo, githubAction } = req.body;
        const task = await notion.createTask({
          name,
          platform,
          details,
          priority,
          githubRepo,
          githubAction,
        });
        return res.status(200).json({ success: true, data: task });
      }

      case "updateTask": {
        const { taskId, status } = req.body;
        await notion.updateTaskStatus(taskId, status);
        return res.status(200).json({ success: true, data: { taskId, status } });
      }

      case "runOrchestrator": {
        // Trigger /api/cron locally (simulated)
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host;
        const cronUrl = `${protocol}://${host}/api/cron`;

        const cronRes = await fetch(cronUrl, {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
          },
        });
        const data: any = await cronRes.json();
        if (!cronRes.ok) {
          throw new Error(data.error || "Failed to trigger cron orchestrator");
        }
        return res.status(200).json({ success: true, data });
      }

      // ---- Memes ----
      case "memes": {
        const meme = await memeService.fetchRandom();
        return res.status(200).json({ success: true, data: meme });
      }

      // Dynamic browse feed: pulls trending memes across every category
      // concurrently so the Memes screen has something fresh to show as
      // soon as it opens, not just on-demand search results.
      case "trendingFeed": {
        const ledger = new MemeLedger();
        const memes = await memeService.fetchAllCategoriesTrending(2);

        const memeEntries: any[] = [];
        for (const m of memes) {
          const caption = await generateSmartCaption(m.title, m.category, geminiApiKey);
          const page = await notion.createTask({
            name: caption,
            platform: "Instagram",
            priority: "Medium",
            details: m.imageUrl,
          });
          memeEntries.push({
            title: m.title,
            imageUrl: m.imageUrl,
            upvotes: m.upvotes,
            source: m.category,
            taskId: page.id,
            shortId: page.id.replace(/-/g, "").slice(-6),
            alreadyPosted: ledger.has(m.postLink),
          });
        }

        return res.status(200).json({ success: true, data: memeEntries });
      }

      case "searchMemes": {
        const query = req.query.q as string;
        const memes = await memeService.searchByTopic(query || "memes", 5);

        // Pre-create Notion tasks for each meme result so we get stable confirm IDs in the app
        const memeEntries: any[] = [];
        for (const m of memes) {
          const caption = await generateSmartCaption(m.title, query || "memes", geminiApiKey);
          const page = await notion.createTask({
            name: caption,
            platform: "Instagram",
            priority: "Medium",
            details: m.imageUrl,
          });
          memeEntries.push({
            title: m.title,
            imageUrl: m.imageUrl,
            upvotes: m.upvotes,
            source: m.source,
            taskId: page.id,
            shortId: page.id.replace(/-/g, "").slice(-6),
          });
        }

        return res.status(200).json({ success: true, data: memeEntries });
      }

      case "generateAIMeme": {
        const { concept, style } = req.body;
        const result = await memeService.generateAIMeme(concept, geminiApiKey, style);
        const task = await notion.createTask({
          name: result.caption,
          platform: "Instagram",
          priority: "Medium",
          details: result.imageUrl,
        });

        return res.status(200).json({
          success: true,
          data: {
            imageUrl: result.imageUrl,
            caption: result.caption,
            taskId: task.id,
            shortId: task.id.replace(/-/g, "").slice(-6),
          },
        });
      }

      // ---- Confirm Media Publishing ----
      case "confirmPost": {
        const { taskId } = req.body;
        if (!instagram) {
          throw new Error("Instagram access token or User ID is missing on backend");
        }

        const task = await notion.getTask(taskId);
        if (!task) {
          throw new Error("Pending task not found");
        }

        const imageUrl = task.details;
        if (!imageUrl || !imageUrl.startsWith("http")) {
          throw new Error("Invalid image URL found in task details");
        }

        await notion.updateTaskStatus(task.id, "In Progress");

        const publishRes = await publishMemeAsReel(instagram, videoGenerator, imageUrl, task.name);

        await notion.updateTaskStatus(task.id, "Done");
        await notion.writeResult(task.id, `✅ Published to Instagram. Media ID: ${publishRes.mediaId}`);

        if (telegram) {
          await telegram.sendMessage(
            `🚀 <b>Instagram Post Deployed via Mobile!</b>\n\n` +
            `• <b>Caption:</b> ${task.name}\n` +
            `🔗 <a href="https://instagram.com/">View on Instagram</a>`
          );
        }

        return res.status(200).json({ success: true, data: publishRes });
      }

      // ---- AI Chat ----
      case "chat": {
        const { message } = req.body;
        const text = (message || "").trim();
        let chatResponse: string | null = null;

        if (text.startsWith("/")) {
          const commandParts = text.split(" ");
          const command = commandParts[0].toLowerCase();
          const args = text.slice(command.length).trim();

          if (command.startsWith("/confirm_")) {
            const shortId = command.replace("/confirm_", "");
            try {
              const tasks = await notion.listTasks({ status: "Todo" });
              const task = tasks.find((t) => t.id.replace(/-/g, "").endsWith(shortId));

              if (!task) {
                chatResponse = "❌ Pending task not found or already processed.";
              } else if (!instagram) {
                chatResponse = "❌ Instagram client is not configured on this server.";
              } else {
                const imageUrl = task.details;
                if (!imageUrl || !imageUrl.startsWith("http")) {
                  chatResponse = "❌ Invalid image URL found in task details.";
                } else {
                  await notion.updateTaskStatus(task.id, "In Progress");
                  const publishRes = await publishMemeAsReel(instagram, videoGenerator, imageUrl, task.name);
                  await notion.updateTaskStatus(task.id, "Done");
                  await notion.writeResult(task.id, `✅ Published to Instagram. Media ID: ${publishRes.mediaId}`);
                  chatResponse = `🚀 <b>Instagram Post Deployed!</b>\n\n• <b>Caption:</b> ${task.name}\n• <b>Media ID:</b> <code>${publishRes.mediaId}</code>`;
                }
              }
            } catch (err: any) {
              chatResponse = `❌ <b>Failed to publish post:</b> ${err.message}`;
            }
          } else {
            switch (command) {
              case "/start":
              case "/help": {
                chatResponse = `🤖 <b>Pami AI Task Orchestrator Bot</b>\n\nManage your automated workspace directly from chat!\n\n🚀 <b>Available Commands:</b>\n\n📝 <b>Notion</b>\n• <code>/todo [Task Name]</code> - Create a new General Notion task\n• <code>/run</code> - Run the orchestrator on all pending Notion tasks\n\n🐙 <b>GitHub</b>\n• <code>/repo [Repo Name]</code> - Create a new GitHub repository\n• <code>/issue [Title] | [owner/repo] | [Body]</code> - Create a GitHub issue\n\n📸 <b>Instagram</b>\n• <code>/post [Image URL] | [Caption]</code> - Post an image to Instagram\n• <code>/aiart [Post Caption]</code> - Generate AI art, review, then confirm to post\n• <code>/reel [Video Prompt]</code> - Generate an animated video Reel, review, then confirm to post\n• <code>/igstats</code> - 📊 Instagram analytics dashboard\n\n😂 <b>Memes</b>\n• <code>/meme</code> - Fetch a random trending meme (preview + confirm)\n• <code>/meme [topic]</code> - Search memes about a topic\n• <code>/aiimage [concept]</code> - AI-generate a meme image\n\n🤖 <b>AI Usage</b>\n• <code>/credits</code> - View AI service usage & credit status\n\n📧 <b>Reports</b>\n• <code>/email</code> - Send full dashboard report to your email\n\n<i>Prefix normal chat messages with task or todo to add to Notion.</i>`;
                break;
              }
              case "/email": {
                try {
                  const gmailUser = process.env.GMAIL_USER;
                  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
                  const emailTo = process.env.EMAIL_TO;
                  if (!gmailUser || !gmailAppPassword || !emailTo) {
                    chatResponse = "❌ <b>Email not configured on backend.</b>";
                    break;
                  }
                  const { sendDashboardEmail } = await import("../src/services/email-client.js");
                  const [todoTasks, inProgressTasks, doneTasks, failedTasks] = await Promise.all([
                    notion.listTasks({ status: "Todo" }),
                    notion.listTasks({ status: "In Progress" }),
                    notion.listTasks({ status: "Done" }),
                    notion.listTasks({ status: "Failed" }),
                  ]);
                  const allTasks = [...doneTasks, ...inProgressTasks, ...todoTasks, ...failedTasks];
                  const recentTasks = allTasks.slice(0, 8).map(t => ({
                    name: t.name,
                    platform: t.platform,
                    status: t.status,
                  }));
                  let igData: any = undefined;
                  if (instagram) {
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
                  }
                  await sendDashboardEmail(emailTo, {
                    instagram: igData,
                    notion: { todo: todoTasks.length, inProgress: inProgressTasks.length, done: doneTasks.length, failed: failedTasks.length, recentTasks },
                    credits: { geminiReqsToday: doneTasks.length, geminiTokensUsed: doneTasks.length * 800, geminiRemaining: 1000000, opencodeTokensTotal: 0, opencodeSessions: 0, opencodeModel: "deepseek-v4-flash-free" }
                  }, gmailUser, gmailAppPassword);
                  chatResponse = `📧 <b>Dashboard Report Sent!</b>\n\n✅ Email delivered to <code>${emailTo}</code>`;
                } catch (e: any) {
                  chatResponse = `❌ <b>Failed to send email:</b> ${e.message}`;
                }
                break;
              }
              case "/igstats": {
                if (!instagram) {
                  chatResponse = "❌ Instagram client is not configured.";
                  break;
                }
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
                  let msg = `📊 <b>Instagram Dashboard</b>\n👤 <b>@${stats.username}</b>\n👥 <b>Followers:</b> ${fmt(stats.followers)}\n➡️ <b>Following:</b> ${fmt(stats.following)}\n🖼️ <b>Total Posts:</b> ${fmt(stats.mediaCount)}\n`;
                  if (insights) {
                    msg += `\n📈 <b>Last 7 Days</b>\n👁️ <b>Impressions:</b> ${fmt(insights.impressions)}\n🌐 <b>Reach:</b> ${fmt(insights.reach)}\n🔍 <b>Profile Views:</b> ${fmt(insights.profileViews)}\n`;
                  }
                  if (media.length > 0) {
                    msg += `\n🕒 <b>Recent Posts</b>\n`;
                    for (const m of media) {
                      const cap = (m.caption || "No caption").substring(0, 35);
                      msg += `• ${ago(m.timestamp)} | ❤️ ${m.likes} 💬 ${m.comments} | <i>${cap}...</i>\n`;
                    }
                  }
                  chatResponse = msg;
                } catch (e: any) {
                  chatResponse = `❌ <b>Failed to fetch stats:</b> ${e.message}`;
                }
                break;
              }
              case "/credits": {
                try {
                  const [doneTasks, todoTasks] = await Promise.all([
                    notion.listTasks({ status: "Done", platform: "Instagram" }),
                    notion.listTasks({ status: "Todo", platform: "Instagram" }),
                  ]);
                  const geminiStatus = geminiApiKey ? "✅ Configured" : "⚠️ Not Set";
                  const geminiReqsToday = doneTasks.length + todoTasks.length;
                  const geminiTokensEstimate = geminiReqsToday * 800;
                  const geminiRemaining = Math.max(0, 1000000 - geminiTokensEstimate);
                  chatResponse = `🤖 <b>AI Credits Dashboard</b>\n\n🧠 <b>Gemini 2.5 Flash</b>\n• Status: ${geminiStatus}\n• Requests used today: <b>${geminiReqsToday}</b> / 250\n• Tokens used: <b>~${geminiTokensEstimate.toLocaleString()}</b>\n• Remaining: <b>~${geminiRemaining.toLocaleString()}</b>\n\n🎨 <b>Pollinations.ai FLUX</b>\n• Status: ✅ Active · Free\n• Remaining: <b>∞ Unlimited</b>\n\n☁️ <b>Catbox.moe</b>\n• Status: ✅ Active · Free`;
                } catch (e: any) {
                  chatResponse = `❌ <b>Failed to fetch credits:</b> ${e.message}`;
                }
                break;
              }
              case "/todo": {
                if (!args) {
                  chatResponse = "❌ Please provide a task name. Format: <code>/todo Clean my workspace</code>";
                  break;
                }
                const page = await notion.createTask({
                  name: args,
                  platform: "General",
                  priority: "Medium",
                  details: "Added via Pami AI Mobile app chat.",
                });
                chatResponse = `✅ <b>Notion Task Created!</b>\n\n• <b>Task:</b> ${args}\n• <b>Status:</b> Todo\n• <b>Short ID:</b> <code>${page.id.replace(/-/g, "").slice(-6)}</code>`;
                break;
              }
              case "/repo": {
                if (!args) {
                  chatResponse = "❌ Please provide a repository name. Format: <code>/repo my-new-project</code>";
                  break;
                }
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
                  chatResponse = `🐙 <b>GitHub Repository Created!</b>\n\n• <b>Name:</b> ${repo.name}\n• <b>URL:</b> ${repo.url}`;
                } catch (gitErr: any) {
                  await notion.updateTaskStatus(task.id, "Failed");
                  await notion.writeResult(task.id, `❌ Failed: ${gitErr.message}`);
                  chatResponse = `❌ <b>Failed to create repository:</b> ${gitErr.message}`;
                }
                break;
              }
              case "/issue": {
                const parts = args.split("|").map((p: string) => p.trim());
                const [title, repoPath, body] = parts;
                if (!title || !repoPath) {
                  chatResponse = "❌ Invalid format. Please use:\n<code>/issue Issue Title | owner/repo | Issue Description</code>";
                  break;
                }
                const [owner, repo] = repoPath.split("/");
                if (!owner || !repo) {
                  chatResponse = "❌ Invalid repo format. Must be <code>owner/repo</code>.";
                  break;
                }
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
                  const issue = await github.createIssue({ owner, repo, title, body: body || undefined });
                  await notion.updateTaskStatus(task.id, "Done");
                  await notion.writeResult(task.id, `✅ Created issue #${issue.number}: ${issue.url}`);
                  chatResponse = `🐙 <b>GitHub Issue Created!</b>\n\n• <b>Issue:</b> #${issue.number} ${issue.title}\n• <b>URL:</b> ${issue.url}`;
                } catch (gitErr: any) {
                  await notion.updateTaskStatus(task.id, "Failed");
                  await notion.writeResult(task.id, `❌ Failed: ${gitErr.message}`);
                  chatResponse = `❌ <b>Failed to create issue:</b> ${gitErr.message}`;
                }
                break;
              }
              case "/post": {
                if (!instagram) {
                  chatResponse = "❌ Instagram client is not configured.";
                  break;
                }
                const parts = args.split("|").map((p: string) => p.trim());
                const [imageUrl, caption] = parts;
                if (!imageUrl || !imageUrl.startsWith("http")) {
                  chatResponse = "❌ Invalid image URL. Format: <code>/post https://example.com/photo.jpg | My caption</code>";
                  break;
                }
                const postTask = await notion.createTask({
                  name: caption || "Instagram Post",
                  platform: "Instagram",
                  priority: "Medium",
                  details: imageUrl,
                });
                const postShortId = postTask.id.replace(/-/g, "").slice(-6);
                chatResponse = `📸 <b>Instagram Post Ready for Review!</b>\n\n• <b>Caption:</b> ${caption || "None"}\n• <b>Image:</b> <a href="${imageUrl}">Click to preview</a>\n\n👉 To publish, send: <code>/confirm_${postShortId}</code>`;
                break;
              }
              case "/aiart": {
                if (!instagram) {
                  chatResponse = "❌ Instagram client is not configured.";
                  break;
                }
                if (!args) {
                  chatResponse = "❌ Please provide a caption prompt. Format: <code>/aiart A beautiful sunset</code>";
                  break;
                }
                let imageUrl = "";
                if (geminiApiKey) {
                  try {
                    const gemini = new GeminiClient(geminiApiKey, githubToken, githubMediaRepo);
                    imageUrl = await gemini.generateImage(args, { enhance: true });
                  } catch (err: any) {
                    console.warn("Gemini generation failed on mobile command:", err.message);
                  }
                }
                if (!imageUrl) {
                  const seed = Math.floor(Math.random() * 1000000);
                  imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;
                }
                const page = await notion.createTask({ name: args, platform: "Instagram", priority: "Medium", details: imageUrl });
                const shortId = page.id.replace(/-/g, "").slice(-6);
                chatResponse = `🎨 <b>AI Image Preview Generated!</b>\n\n• <b>Prompt:</b> ${args}\n• <b>Image:</b> <a href="${imageUrl}">Click here to see the image</a>\n\n👉 To publish, send: <code>/confirm_${shortId}</code>`;
                break;
              }
              case "/run": {
                const protocol = req.headers["x-forwarded-proto"] || "http";
                const host = req.headers.host;
                const cronUrl = `${protocol}://${host}/api/cron`;
                try {
                  const cronRes = await fetch(cronUrl, {
                    headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
                  });
                  const data: any = await cronRes.json();
                  chatResponse = `✅ <b>Task Processor Finished!</b>\n\n• <b>Summary:</b>\n${data.summary?.join("\n") || "No tasks processed."}`;
                } catch (cronErr: any) {
                  chatResponse = `❌ <b>Task Processor Error:</b> ${cronErr.message}`;
                }
                break;
              }
              case "/meme": {
                const memeQuery = args.trim();
                if (!memeQuery) {
                  try {
                    const meme = await memeService.fetchRandom();
                    const caption = `${meme.title} 😂\n\n#memes #funny #viral #trending #relatable`;
                    const page = await notion.createTask({ name: caption, platform: "Instagram", priority: "Medium", details: meme.imageUrl });
                    const memeShortId = page.id.replace(/-/g, "").slice(-6);
                    chatResponse = `😂 <b>Trending Meme Preview</b>\n\n📝 <b>Title:</b> ${meme.title}\n⬆️ <b>Upvotes:</b> ${meme.upvotes}\n\n👉 Confirm to post: <code>/confirm_${memeShortId}</code>`;
                  } catch (memeErr: any) {
                    chatResponse = `❌ Failed to fetch meme: ${memeErr.message}`;
                  }
                } else {
                  try {
                    const memes = await memeService.searchByTopic(memeQuery, 5);
                    if (memes.length === 0) {
                      chatResponse = `😢 No memes found for "${memeQuery}".`;
                      break;
                    }
                    const memeEntries = [];
                    for (const m of memes) {
                      const caption = `${m.title} 😂\n\n#memes #funny #${memeQuery.replace(/\s+/g, "").toLowerCase()} #viral #trending`;
                      const page = await notion.createTask({ name: caption, platform: "Instagram", priority: "Medium", details: m.imageUrl });
                      memeEntries.push({ meme: m, shortId: page.id.replace(/-/g, "").slice(-6) });
                    }
                    const best = memeEntries[0];
                    let msg = `😂 <b>Found ${memes.length} memes about "${memeQuery}"</b>\n\n🏆 <b>#1 — Top Pick</b>\n📝 ${best.meme.title}\n⬆️ ${best.meme.upvotes} upvotes\n👉 <code>/confirm_${best.shortId}</code>\n`;
                    if (memeEntries.length > 1) {
                      msg += `\n📋 <b>Other options:</b>\n`;
                      for (let i = 1; i < memeEntries.length; i++) {
                        const entry = memeEntries[i];
                        msg += `\n${i + 1}. <b>${entry.meme.title}</b>\n   👉 <code>/confirm_${entry.shortId}</code>\n`;
                      }
                    }
                    chatResponse = msg;
                  } catch (memeErr: any) {
                    chatResponse = `❌ Failed to search memes: ${memeErr.message}`;
                  }
                }
                break;
              }
              case "/aiimage": {
                const aiConcept = args.trim() || "a funny programming meme about debugging at 3am";
                try {
                  const result = await memeService.generateAIMeme(aiConcept, geminiApiKey);
                  const page = await notion.createTask({ name: result.caption, platform: "Instagram", priority: "Medium", details: result.imageUrl });
                  const aiShortId = page.id.replace(/-/g, "").slice(-6);
                  chatResponse = `🎨 <b>AI Meme Preview Ready!</b>\n\n📝 <b>Caption:</b> ${result.caption}\n\n👉 Confirm to post: <code>/confirm_${aiShortId}</code>`;
                } catch (aiMemeErr: any) {
                  chatResponse = `❌ Failed to generate AI meme: ${aiMemeErr.message}`;
                }
                break;
              }
              default:
                chatResponse = `❓ Unknown command: <code>${command}</code>. Send <code>/help</code> for available commands.`;
            }
          }
        } else {
          const lower = text.toLowerCase();
          const isExplicitTask = lower.startsWith("task ") || lower.startsWith("todo ");
          if (isExplicitTask) {
            const taskName = text.replace(/^(task|todo)\s+/gi, "").trim();
            const page = await notion.createTask({
              name: taskName,
              platform: "General",
              priority: "Medium",
              details: "Added via conversational task command from mobile.",
            });
            chatResponse = `📝 <b>Added to Notion Inbox</b>\n\n• <b>Task:</b> ${taskName}\n• <b>Short ID:</b> <code>${page.id.replace(/-/g, "").slice(-6)}</code>`;
          } else {
            const chatSystemPrompt = "You are a helpful, witty, and concise coding & productivity assistant integrated in the Pami AI Mobile app. Keep responses engaging and under 150 words. Format with clean HTML standard styling.";
            try {
              const opencode = new OpenCodeChatClient();
              chatResponse = await opencode.chat(text, chatSystemPrompt);
            } catch (ocErr: any) {
              console.warn("OpenCode unavailable on mobile chat fallback:", ocErr.message);
            }

            if (!chatResponse && geminiApiKey) {
              const gemini = new GeminiClient(geminiApiKey);
              chatResponse = await gemini.chat(text, chatSystemPrompt);
            }
          }
        }

        return res.status(200).json({
          success: true,
          data: chatResponse || "🤖 Pami AI Assistant is currently offline.",
        });
      }

      // ---- Credits ----
      case "credits": {
        const [done, todo] = await Promise.all([
          notion.listTasks({ status: "Done", platform: "Instagram" }),
          notion.listTasks({ status: "Todo", platform: "Instagram" }),
        ]);

        let opencodeStats = { sessions: 0, tokens: 0 };
        try {
          const Database = (await import("better-sqlite3")).default;
          const dbPath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
          const db = new Database(dbPath, { readonly: true, fileMustExist: true });
          const totals = db.prepare("SELECT SUM(tokens_input) as ti, SUM(tokens_output) as to2, SUM(tokens_reasoning) as tr, COUNT(*) as cnt FROM session").get() as any;
          db.close();
          opencodeStats = {
            sessions: totals?.cnt || 0,
            tokens: (totals?.ti || 0) + (totals?.to2 || 0) + (totals?.tr || 0),
          };
        } catch {}

        return res.status(200).json({
          success: true,
          data: {
            gemini: {
              used: (done.length + todo.length) * 800,
              requests: done.length + todo.length,
            },
            opencode: opencodeStats,
          },
        });
      }

      // ---- Trigger Email Report ----
      case "sendEmail": {
        const gmailUser = process.env.GMAIL_USER;
        const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
        const emailTo = process.env.EMAIL_TO;

        if (!gmailUser || !gmailAppPassword || !emailTo) {
          throw new Error("GMAIL_USER, GMAIL_APP_PASSWORD, or EMAIL_TO environment variables not set on backend");
        }

        const { sendDashboardEmail } = await import("../src/services/email-client.js");

        const [todo, inProgress, done, failed] = await Promise.all([
          notion.listTasks({ status: "Todo" }),
          notion.listTasks({ status: "In Progress" }),
          notion.listTasks({ status: "Done" }),
          notion.listTasks({ status: "Failed" }),
        ]);

        const recentTasks = [...done, ...inProgress, ...todo, ...failed].slice(0, 8).map(t => ({
          name: t.name,
          platform: t.platform,
          status: t.status,
        }));

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
          } catch {}
        }

        await sendDashboardEmail(emailTo, {
          instagram: igData,
          notion: {
            todo: todo.length,
            inProgress: inProgress.length,
            done: done.length,
            failed: failed.length,
            recentTasks,
          },
          credits: {
            geminiReqsToday: todo.length + done.length,
            geminiTokensUsed: (todo.length + done.length) * 800,
            geminiRemaining: Math.max(0, 1000000 - (todo.length + done.length) * 800),
            opencodeTokensTotal: 0,
            opencodeSessions: 0,
            opencodeModel: "deepseek-v4-flash-free",
          },
        }, gmailUser, gmailAppPassword);

        return res.status(200).json({ success: true, data: { sentTo: emailTo } });
      }

      // ---- GitHub Integrations ----
      case "createRepo": {
        const { name, description, isPrivate } = req.body;
        const repo = await github.createRepo({ name, description, private: isPrivate });
        return res.status(200).json({ success: true, data: repo });
      }

      case "createIssue": {
        const { owner, repo, title, body } = req.body;
        const issue = await github.createIssue({ owner, repo, title, body });
        return res.status(200).json({ success: true, data: issue });
      }

      default:
        return res.status(400).json({ success: false, error: `Invalid action requested: ${action}` });
    }
  } catch (err: any) {
    console.error("Mobile API handler error:", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
