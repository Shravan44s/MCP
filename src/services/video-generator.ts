// ============================================
// Dual-Engine Video Generator Service
// Generates high-quality animated videos for free
// Engine 1: Wan2.1 Fast (hosted on Hugging Face ZeroGPU) via Gradio Client
// Engine 2: Static Flux image animated via static FFmpeg (Ken Burns panning/zooming)
// ============================================

import { client } from "@gradio/client";
import ffmpegPath from "ffmpeg-static";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GeminiClient } from "./gemini-client.js";
import { hostFilePublicly } from "./media-host.js";

export class VideoGenerator {
  private geminiKey?: string;
  private githubToken?: string;
  private mediaRepo?: string;

  constructor(geminiKey?: string, githubToken?: string, mediaRepo?: string) {
    this.geminiKey = geminiKey;
    this.githubToken = githubToken;
    this.mediaRepo = mediaRepo;
  }

  /**
   * Main entry point to generate a free video clip (returns a publicly hosted URL)
   */
  async generateVideo(prompt: string): Promise<string> {
    console.log(`🎬 Video Generator received request for prompt: "${prompt}"`);

    // 1. Try Wan2.1-Fast Gradio Space first
    try {
      console.log("📡 [Engine 1] Trying Wan2.1-Fast video generation space...");
      const videoUrl = await this.generateWanVideo(prompt);
      if (videoUrl) {
        console.log(`✅ [Engine 1] Success! Hosted Wan2.1 video: ${videoUrl}`);
        return videoUrl;
      }
    } catch (err: any) {
      console.warn(`⚠️ [Engine 1] Wan2.1-Fast generation failed: ${err.message || err}. Falling back to FFmpeg...`);
    }

    // 2. Fallback to FFmpeg Zoom/Pan Animation Engine
    console.log("🎞️ [Engine 2] Running static image + FFmpeg Ken Burns animation fallback...");
    return await this.generateKenBurnsVideo(prompt);
  }

  /**
   * Engine 1: Wan2.1-Fast Gradio Space
   */
  private async generateWanVideo(prompt: string): Promise<string | null> {
    const app = await client("multimodalart/wan2-1-fast");
    const result = await app.predict("/generate_video", [
      null,                     // image input (null for text-to-video)
      prompt,                   // prompt text
      832,                      // width
      480,                      // height
      0.6,                      // strength
      "832x480 (16:9)",         // size configuration
      25,                       // inference steps
      6.0,                      // guidance scale
      -1,                       // random seed
      "ugly, blurry, low quality" // negative prompt
    ]);

    const videoData = (result as any).data?.[0];
    if (videoData && videoData.url) {
      // Since Gradio files are hosted on temporary Hugging Face URLs, 
      // let's pipe it through our Catbox host for permanent, short URLs.
      console.log(`📡 Downloading Wan2.1 clip from HF temp storage: ${videoData.url}`);
      return await this.uploadToCatboxFromUrl(videoData.url);
    }
    return null;
  }

  /**
   * Engine 2: Flux image generation + FFmpeg Ken Burns zoom/pan render
   */
  private async generateKenBurnsVideo(prompt: string): Promise<string> {
    if (!this.geminiKey) {
      throw new Error("Gemini API key is required for image generation fallback");
    }

    // Generate a brand-new Flux base image from the text prompt, then animate it
    const gemini = new GeminiClient(this.geminiKey, this.githubToken, this.mediaRepo);
    console.log("🎨 Generating high-quality Flux base image via Pollinations...");
    const imageUrl = await gemini.generateImage(prompt, { enhance: true });
    return this.animateImageUrl(imageUrl);
  }

  /**
   * Animates an EXISTING image (e.g. a fetched meme) into a Ken Burns
   * zoom/pan Reel-ready video, without generating any new visual content.
   * Use this for real meme images whose content must be preserved as-is —
   * `generateVideo`/`generateKenBurnsVideo` are for AI-concept prompts where
   * there's no source image yet.
   */
  async animateImageUrl(imageUrl: string): Promise<string> {
    // Setup temp file paths
    const tmpDir = os.tmpdir();
    const uniqueId = Math.random().toString(36).substring(7);
    const inputImagePath = path.join(tmpDir, `input_${uniqueId}.jpg`);
    const outputVideoPath = path.join(tmpDir, `output_${uniqueId}.mp4`);

    try {
      // Step C: Download image locally
      console.log(`📥 Downloading base image: ${imageUrl}`);
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Failed to download base image");
      const buffer = Buffer.from(await response.arrayBuffer());

      // Check magic bytes to detect if image is a GIF (GIFs require -ignore_loop 0 instead of -loop 1 in FFmpeg)
      const isGif = buffer.toString("ascii", 0, 3) === "GIF";
      const ext = isGif ? ".gif" : ".jpg";
      const inputImagePath = path.join(tmpDir, `input_${uniqueId}${ext}`);
      const outputVideoPath = path.join(tmpDir, `output_${uniqueId}.mp4`);
      fs.writeFileSync(inputImagePath, buffer);

      // Step D: Run FFmpeg to compile Zoom/Pan animated video
      if (!ffmpegPath) {
        throw new Error("Static FFmpeg binary path could not be resolved");
      }

      console.log(`🎞️ Rendering Ken Burns zoom & panning animation (5 sec, 1080p, Reels ready, format: ${isGif ? "GIF" : "static image"})...`);
      const loopFlag = isGif ? "-ignore_loop 0" : "-loop 1";
      // Crop to vertical 9:16 aspect ratio (1080x1920) and apply slow zoom-in with high-quality presets
      const ffmpegCommand = `"${ffmpegPath}" -y -loglevel error ${loopFlag} -i "${inputImagePath}" -vf "scale=iw*2:ih*2:flags=lanczos,zoompan=z='zoom+0.0015':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -t 5 "${outputVideoPath}"`;

      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCommand, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg Error details:", stderr);
            reject(new Error(`FFmpeg failed: ${error.message}`));
          } else {
            resolve();
          }
        });
      });

      console.log(`✅ Render complete! Output saved: ${outputVideoPath}`);

      // Step E: Upload to a public host
      console.log("☁️ Uploading animated MP4...");
      const hostedUrl = await this.uploadFile(fs.readFileSync(outputVideoPath), "reel.mp4", "video/mp4");

      console.log(`🔗 Reels video uploaded: ${hostedUrl}`);
      return hostedUrl;
    } finally {
      // Cleanup temp files
      try {
        if (fs.existsSync(inputImagePath)) fs.unlinkSync(inputImagePath);
        if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
      } catch (_) {}
    }
  }

  /**
   * Helper: Download remote URL and upload to a public host
   */
  private async uploadToCatboxFromUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch Gradio temporary video file: ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.uploadFile(buffer, "wan_video.mp4", "video/mp4");
  }

  /**
   * Uploads a file buffer to a public host and returns its URL.
   */
  private async uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    if (!this.githubToken || !this.mediaRepo) {
      throw new Error("GITHUB_TOKEN and GITHUB_MEDIA_REPO must be configured to host rendered media");
    }
    return hostFilePublicly(this.githubToken, this.mediaRepo, buffer, filename, mimeType);
  }
}
