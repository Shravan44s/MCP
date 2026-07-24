// ============================================
// Imgflip Service — Optional third source: takes a
// popular blank meme template + Gemini-written caption
// text and renders an ORIGINAL captioned meme image via
// Imgflip's caption_image API (not a repost of anyone's
// existing post, unlike the Reddit/Giphy sources).
// Gated on IMGFLIP_USERNAME/IMGFLIP_PASSWORD — skipped
// gracefully when not configured, same pattern as the
// optional Telegram/Instagram clients elsewhere.
// ============================================
import { GeminiClient } from "./gemini-client.js";
import type { MemeCandidate } from "../types/index.js";

interface ImgflipTemplate {
  id: string;
  name: string;
  url: string;
  box_count: number;
}

export class ImgflipService {
  constructor(
    private username: string,
    private password: string
  ) {}

  private async getTopTemplates(limit: number = 20): Promise<ImgflipTemplate[]> {
    const res = await fetch("https://api.imgflip.com/get_memes");
    if (!res.ok) throw new Error(`Imgflip get_memes returned ${res.status}`);
    const data: any = await res.json();
    if (!data.success) throw new Error("Imgflip get_memes request failed");

    // Classic top/bottom-text templates only — keeps caption generation simple
    return (data.data.memes as ImgflipTemplate[])
      .filter((t) => t.box_count === 2)
      .slice(0, limit);
  }

  /**
   * Picks a random popular template, asks Gemini to write top/bottom text
   * for the given theme, and renders it into a finished meme image.
   */
  async generateCaptionedMeme(
    theme: string,
    geminiApiKey?: string
  ): Promise<MemeCandidate | null> {
    try {
      const templates = await this.getTopTemplates();
      if (templates.length === 0) return null;
      const template = templates[Math.floor(Math.random() * templates.length)];

      let topText = "";
      let bottomText = "";

      if (geminiApiKey) {
        const gemini = new GeminiClient(geminiApiKey);
        const raw = await gemini.chat(
          `Write a funny two-line meme caption for the "${template.name}" meme template, themed around: ${theme}. ` +
            `Return ONLY a JSON object like {"top":"...","bottom":"..."} with short punchy phrases (under 8 words each). No markdown, no explanation.`
        );
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            topText = (parsed.top || "").slice(0, 80);
            bottomText = (parsed.bottom || "").slice(0, 80);
          }
        } catch {
          console.warn("⚠️ Could not parse Imgflip caption JSON from Gemini");
        }
      }

      if (!topText && !bottomText) return null; // no Gemini available or parsing failed — skip this source

      const params = new URLSearchParams({
        template_id: template.id,
        username: this.username,
        password: this.password,
        text0: topText,
        text1: bottomText,
      });

      const captionRes = await fetch("https://api.imgflip.com/caption_image", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const captionData: any = await captionRes.json();
      if (!captionData.success) {
        console.warn("⚠️ Imgflip caption_image failed:", captionData.error_message);
        return null;
      }

      return {
        id: `imgflip:${template.id}:${topText}:${bottomText}`,
        title: `${topText} / ${bottomText}`.trim() || template.name,
        imageUrl: captionData.data.url,
        source: "imgflip",
        category: "Original",
        score: 500,
      };
    } catch (err) {
      console.warn("⚠️ Imgflip meme generation failed:", err);
      return null;
    }
  }
}
