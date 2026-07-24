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

export class VideoGenerator {
  private geminiKey?: string;

  constructor(geminiKey?: string) {
    this.geminiKey = geminiKey;
  }

  /**
   * Main entry point to generate a free video clip (returns hosted URL on Catbox.moe)
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
    const gemini = new GeminiClient(this.geminiKey);
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
      console.log(`📥 Downloading base image: ${imageUrl} -> ${inputImagePath}`);
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Failed to download generated image");
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(inputImagePath, buffer);

      // Step D: Run FFmpeg to compile Zoom/Pan animated video
      if (!ffmpegPath) {
        throw new Error("Static FFmpeg binary path could not be resolved");
      }

      console.log("🎞️ Rendering Ken Burns zoom & panning animation (5 sec, 1080p, Reels ready)...");
      // Crop to vertical 9:16 aspect ratio (1080x1920) and apply slow zoom-in with high-quality presets
      const ffmpegCommand = `"${ffmpegPath}" -y -loop 1 -i "${inputImagePath}" -vf "scale=iw*2:ih*2:flags=lanczos,zoompan=z='zoom+0.0015':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -t 5 "${outputVideoPath}"`;


      await new Promise<void>((resolve, reject) => {
        exec(ffmpegCommand, (error, stdout, stderr) => {
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
   * Uploads a file buffer to a public host and returns its URL. Tries
   * Catbox first (no userhash field — an anonymous upload should omit it
   * entirely, not send it empty). Cloud/datacenter IPs (CI runners,
   * serverless functions) can get caught by Catbox's anti-abuse filtering
   * in ways a residential IP won't, so this falls back to 0x0.st rather
   * than hard-failing the whole pipeline.
   */
  private async uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    try {
      return await this.postMultipart("https://catbox.moe/user/api.php", "fileToUpload", buffer, filename, mimeType, { reqtype: "fileupload" });
    } catch (catboxErr: any) {
      console.warn(`⚠️ Catbox upload failed (${catboxErr.message}). Retrying via 0x0.st...`);
      try {
        return await this.postMultipart("https://0x0.st", "file", buffer, filename, mimeType, {});
      } catch (fallbackErr: any) {
        throw new Error(`Catbox: ${catboxErr.message} | 0x0.st: ${fallbackErr.message}`);
      }
    }
  }

  private async postMultipart(
    url: string,
    fileFieldName: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    extraFields: Record<string, string>
  ): Promise<string> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append(fileFieldName, blob, filename);

    const res = await fetch(url, { method: "POST", body: formData });
    const text = (await res.text()).trim();
    if (!res.ok || !text.startsWith("http")) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200) || "(empty response)"}`);
    }
    return text;
  }
}
