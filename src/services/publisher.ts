// ============================================
// Publisher — the single place a meme becomes an
// Instagram Reel. Every posting path (mobile app
// confirm-post, Telegram /confirm_, the general Notion
// task processor, and the auto-post pipeline) now routes
// through here so nothing goes out as a static photo —
// wider organic reach than a static post.
// ============================================
import { InstagramClient } from "./instagram-client.js";
import { VideoGenerator } from "./video-generator.js";

/**
 * Turns a source asset into a Reel-ready video URL.
 * - Already a video (e.g. Giphy's .mp4, or a previously-generated Reel) → passed through unchanged.
 * - A static image (Reddit meme, Imgflip render, AI art) → animated via Ken Burns.
 */
export async function ensureVideo(
  assetUrl: string,
  videoGenerator: VideoGenerator
): Promise<string> {
  if (/\.mp4(\?.*)?$/i.test(assetUrl)) {
    return assetUrl;
  }
  return videoGenerator.animateImageUrl(assetUrl);
}

/**
 * Converts the given image/video asset to a Reel (if needed) and publishes
 * it to Instagram. This replaces the old "publishPhoto if not .mp4 else
 * publishReel" branching that was duplicated across cron.ts/mobile.ts/telegram.ts.
 */
export async function publishMemeAsReel(
  instagram: InstagramClient,
  videoGenerator: VideoGenerator,
  assetUrl: string,
  caption: string
): Promise<{ success: boolean; mediaId: string; videoUrl: string }> {
  const videoUrl = await ensureVideo(assetUrl, videoGenerator);
  const res = await instagram.publishReel(videoUrl, caption);
  return { ...res, videoUrl };
}
