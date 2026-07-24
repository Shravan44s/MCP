// ============================================
// Auto-Post Pipeline
// Run twice daily by .github/workflows/auto-post.yml
// directly on the Actions runner (no Vercel timeout
// risk). Picks a fresh, trending, non-repeated meme,
// turns it into a Reel, writes a reach-optimized
// caption, posts it, and updates the no-repeat ledger.
//
// Usage:
//   tsx scripts/auto-post.ts             (live — publishes for real)
//   tsx scripts/auto-post.ts --dry-run   (logs the pick, no publish/ledger write)
// ============================================
import "dotenv/config";
import { MemeService, MEME_CATEGORIES, toMemeCandidate } from "../src/services/meme-service.js";
import { GiphyService } from "../src/services/giphy-service.js";
import { ImgflipService } from "../src/services/imgflip-service.js";
import { MemeLedger } from "../src/services/meme-ledger.js";
import { generateSmartCaption } from "../src/services/caption-service.js";
import { VideoGenerator } from "../src/services/video-generator.js";
import { publishMemeAsReel } from "../src/services/publisher.js";
import { InstagramClient } from "../src/services/instagram-client.js";
import { NotionClient } from "../src/services/notion-client.js";
import { TelegramClient } from "../src/services/telegram-client.js";
import type { MemeCandidate } from "../src/types/index.js";

const DRY_RUN = process.argv.includes("--dry-run");

function pickWeightedCategory(recentlyUsed: string[]): string {
  const categories = Object.keys(MEME_CATEGORIES);
  const weighted = categories.flatMap((c) =>
    Array(recentlyUsed.includes(c) ? 1 : 3).fill(c)
  );
  return weighted[Math.floor(Math.random() * weighted.length)];
}

async function main() {
  console.log(`🚀 Auto-post pipeline starting${DRY_RUN ? " (DRY RUN)" : ""}...`);

  const notionToken = process.env.NOTION_TOKEN;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  const instagramToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const giphyApiKey = process.env.GIPHY_API_KEY;
  const imgflipUsername = process.env.IMGFLIP_USERNAME;
  const imgflipPassword = process.env.IMGFLIP_PASSWORD;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!instagramToken || !instagramUserId) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID are required");
  }

  const instagram = new InstagramClient(instagramToken, instagramUserId);
  const videoGenerator = new VideoGenerator(geminiApiKey);
  const memeService = new MemeService();
  const ledger = new MemeLedger();
  const telegram = telegramToken && telegramChatId ? new TelegramClient(telegramToken, telegramChatId) : undefined;
  const notion = notionToken && notionDbId ? new NotionClient(notionToken, notionDbId) : undefined;

  // 1. Pick a category, weighted away from recent runs for variety
  const recentCategories = ledger.recentCategories(4);
  const category = pickWeightedCategory(recentCategories);
  console.log(`🎯 Category: ${category} (recent: ${recentCategories.join(", ") || "none"})`);

  // 2. Fetch candidates concurrently across sources
  const candidatePromises: Promise<MemeCandidate[]>[] = [
    memeService.fetchTrending(8, category).then((memes) => memes.map(toMemeCandidate)),
  ];

  if (giphyApiKey) {
    const giphy = new GiphyService(giphyApiKey);
    candidatePromises.push(giphy.fetchTrending(8, category));
  }

  const settled = await Promise.allSettled(candidatePromises);
  let candidates: MemeCandidate[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Imgflip is a single generated candidate, not a pool — fetch separately (needs Gemini for captioning)
  if (imgflipUsername && imgflipPassword && geminiApiKey) {
    try {
      const imgflip = new ImgflipService(imgflipUsername, imgflipPassword);
      const generated = await imgflip.generateCaptionedMeme(category, geminiApiKey);
      if (generated) candidates.push(generated);
    } catch (err) {
      console.warn("⚠️ Imgflip source skipped:", err);
    }
  }

  // 3. Filter out anything already posted, rank by score
  const fresh = candidates.filter((c) => !ledger.has(c.id)).sort((a, b) => b.score - a.score);

  if (fresh.length === 0) {
    throw new Error(`No fresh (non-repeated) candidates found for category "${category}" — all ${candidates.length} were already posted recently`);
  }

  const chosen = fresh[0];
  console.log(`✅ Chosen: [${chosen.source}/${chosen.category}] "${chosen.title}" (score ${chosen.score})`);
  console.log(`   ${fresh.length - 1} other fresh candidates were available`);

  // 4. Caption
  const caption = await generateSmartCaption(chosen.title, chosen.category, geminiApiKey);
  console.log(`📝 Caption:\n${caption}`);

  if (DRY_RUN) {
    console.log("🧪 Dry run — rendering video to verify the pipeline, but skipping publish + ledger write.");
    const assetUrl = chosen.imageUrl || chosen.videoUrl!;
    const videoUrl = /\.mp4(\?.*)?$/i.test(assetUrl) ? assetUrl : await videoGenerator.animateImageUrl(assetUrl);
    console.log(`🎬 Video ready (not published): ${videoUrl}`);
    console.log("✅ Dry run complete.");
    return;
  }

  // 5. Log to Notion for dashboard visibility (best-effort, matches other posting flows)
  let notionTaskId: string | undefined;
  if (notion) {
    try {
      const task = await notion.createTask({
        name: caption,
        platform: "Instagram",
        priority: "Medium",
        details: chosen.imageUrl || chosen.videoUrl || "",
      });
      notionTaskId = task.id;
      await notion.updateTaskStatus(task.id, "In Progress");
    } catch (err) {
      console.warn("⚠️ Notion logging failed (continuing without it):", err);
    }
  }

  // 6. Publish
  try {
    const assetUrl = chosen.imageUrl || chosen.videoUrl!;
    const result = await publishMemeAsReel(instagram, videoGenerator, assetUrl, caption);
    console.log(`🎉 Published! Media ID: ${result.mediaId}`);

    if (notionTaskId && notion) {
      await notion.updateTaskStatus(notionTaskId, "Done");
      await notion.writeResult(notionTaskId, `✅ Auto-posted Reel. Media ID: ${result.mediaId}`);
    }

    // 7. Update the ledger (committed back to the repo by the workflow)
    ledger.add(chosen.id, chosen.source, chosen.category);
    ledger.prune();
    ledger.save();

    if (telegram) {
      await telegram.sendMessage(
        `🤖 <b>Auto-Posted Meme Reel</b>\n\n` +
        `• <b>Category:</b> ${chosen.category}\n` +
        `• <b>Source:</b> ${chosen.source}\n` +
        `• <b>Title:</b> ${chosen.title}\n` +
        `• <b>Media ID:</b> <code>${result.mediaId}</code>`
      );
    }
  } catch (err: any) {
    if (notionTaskId && notion) {
      await notion.updateTaskStatus(notionTaskId, "Failed");
      await notion.writeResult(notionTaskId, `❌ ${err.message || err}`);
    }
    if (telegram) {
      await telegram.sendMessage(`❌ <b>Auto-post failed:</b> ${err.message || err}`);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("❌ Auto-post pipeline failed:", err);
  process.exit(1);
});
