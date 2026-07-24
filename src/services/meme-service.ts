// ============================================
// Meme Service — Fetches trending memes from Reddit
// (via meme-api.com) across many categorized buckets,
// plus AI meme generation
// ============================================
import axios from "axios";
import FormData from "form-data";
import type { MemeCandidate } from "../types/index.js";

interface RedditMeme {
  postLink: string;
  subreddit: string;
  title: string;
  url: string;
  nsfw: boolean;
  spoiler: boolean;
  author: string;
  ups: number;
  preview: string[];
}

interface MemeResult {
  title: string;
  imageUrl: string;
  source: string;
  upvotes: number;
  subreddit: string;
  postLink: string;
  category: string;
}

// Wide, categorized subreddit pool for real variety + trending scope.
// Each bucket is a themed audience segment rather than a literal platform —
// meme-api.com only proxies Reddit, so "Facebook/Instagram/YouTube flavor"
// buckets below are curated communities that mimic that content style
// without actually scraping those platforms (which would violate their ToS).
export const MEME_CATEGORIES: Record<string, string[]> = {
  Trending: ["memes", "dankmemes", "funny", "MemeEconomy"],
  Wholesome: ["wholesomememes", "MadeMeSmile", "aww"],
  Programmer: ["ProgrammerHumor", "softwaregore", "techsupportgore"],
  Desi: ["IndianDankMemes", "SaimanSays", "bollywoodmemes"],
  Gaming: ["pcmasterrace", "gamingmemes", "gaming"],
  Corporate: ["antiwork", "ExpectationVsReality", "corporatelife"],
  Animals: ["AnimalsBeingBros", "AnimalsBeingDerps", "aww"],
  Relationship: ["relationship_memes", "wholesomememes"],
  BoomerHumor: ["terriblefacebookmemes", "insanepeoplefacebook", "oldpeoplefacebook"],
  Random: ["me_irl", "meirl", "Instagramreality", "youngpeopleyoutube", "youtubehaiku"],
};

export class MemeService {
  /**
   * Fetches trending memes from a category's subreddit pool. Tries a random
   * sub in the bucket first, and falls back to the next sub (then r/memes)
   * if that one 404s or is empty, so a single dead subreddit can't break
   * the whole pipeline.
   * @param count Number of memes to fetch (1-10)
   * @param category Optional bucket key from MEME_CATEGORIES (random if omitted)
   */
  async fetchTrending(count: number = 5, category?: string): Promise<MemeResult[]> {
    const categories = Object.keys(MEME_CATEGORIES);
    const selectedCategory = category && MEME_CATEGORIES[category]
      ? category
      : categories[Math.floor(Math.random() * categories.length)];

    const subs = [...MEME_CATEGORIES[selectedCategory]].sort(() => Math.random() - 0.5);
    const fallbackChain = [...subs, "memes"];

    for (const sub of fallbackChain) {
      try {
        const url = `https://meme-api.com/gimme/${sub}/${Math.min(count, 10)}`;
        console.log(`📡 Fetching ${count} memes from r/${sub} (Category: ${selectedCategory})...`);
        const res = await fetch(url);
        if (!res.ok) continue;

        const data: { count: number; memes: RedditMeme[] } = await res.json() as any;
        const safeMemes = (data.memes || []).filter((m) => !m.nsfw && !m.spoiler);
        if (safeMemes.length === 0) continue;

        return safeMemes.map((m) => ({
          title: m.title,
          imageUrl: m.url,
          source: selectedCategory,
          upvotes: m.ups,
          subreddit: m.subreddit,
          postLink: m.postLink,
          category: selectedCategory,
        }));
      } catch {
        continue;
      }
    }

    return [];
  }

  /**
   * Fetches a single random trending meme
   * @param category Optional bucket key from MEME_CATEGORIES (random if omitted)
   */
  async fetchRandom(category?: string): Promise<MemeResult> {
    const memes = await this.fetchTrending(5, category);
    if (memes.length === 0) {
      throw new Error("No safe memes found");
    }
    // Pick the one with most upvotes
    return memes.sort((a, b) => b.upvotes - a.upvotes)[0];
  }

  /**
   * Fetches trending memes across ALL categories concurrently — used for the
   * mobile app's dynamic browse feed and the auto-post pipeline's candidate pool.
   * @param perCategory How many memes to pull from each bucket
   */
  async fetchAllCategoriesTrending(perCategory: number = 3): Promise<MemeResult[]> {
    const categories = Object.keys(MEME_CATEGORIES);
    const results = await Promise.allSettled(
      categories.map((cat) => this.fetchTrending(perCategory, cat))
    );

    const all: MemeResult[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
    return all.sort((a, b) => b.upvotes - a.upvotes);
  }

  /**
   * Searches for memes related to a specific topic/keyword.
   * Fetches from topic-specific subreddits first, then falls back to general ones,
   * filtering results whose titles match the search query.
   * @param query The topic to search for (e.g. "marriage", "coding", "cats")
   * @param count How many results to return (default 5)
   */
  async searchByTopic(query: string, count: number = 5): Promise<MemeResult[]> {
    const topicSubs = [
      query.toLowerCase().replace(/\s+/g, ""),
      `${query.toLowerCase().replace(/\s+/g, "")}memes`,
      "memes",
      "dankmemes",
      "me_irl",
      "funny",
    ];

    console.log(`🔍 Concurrent search initiated for "${query}" across ${topicSubs.length} subreddits...`);
    const queryWords = query.toLowerCase().split(/\s+/);

    // Fetch all subreddits concurrently
    const promises = topicSubs.map(async (sub) => {
      try {
        const url = `https://meme-api.com/gimme/${sub}/${Math.min(10, count * 2)}`;
        const res = await fetch(url);
        if (!res.ok) return [];

        const data: { count: number; memes: RedditMeme[] } = await res.json() as any;
        const safeMemes = data.memes.filter((m) => !m.nsfw && !m.spoiler);

        const isTopicSub = sub !== "memes" && sub !== "dankmemes" && sub !== "me_irl" && sub !== "funny";
        const matches = isTopicSub
          ? safeMemes
          : safeMemes.filter((m) =>
              queryWords.some((w) => m.title.toLowerCase().includes(w))
            );

        return matches.map((m) => ({
          title: m.title,
          imageUrl: m.url,
          source: `r/${sub}`,
          upvotes: m.ups,
          subreddit: m.subreddit || sub,
          postLink: m.postLink,
          category: "Search",
        }));
      } catch {
        return [];
      }
    });

    const results = await Promise.allSettled(promises);
    const allResults: MemeResult[] = [];

    // Aggregate and filter duplicates
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const item of r.value) {
          if (!allResults.some((existing) => existing.postLink === item.postLink)) {
            allResults.push(item);
          }
        }
      }
    }

    // Sort by upvotes descending and limit count
    return allResults.sort((a, b) => b.upvotes - a.upvotes).slice(0, count);
  }

  /**
   * Generates a custom AI meme image using Pollinations.ai
   * Uses Gemini to enhance the meme concept into a visual prompt
   */
  async generateAIMeme(concept: string, geminiApiKey?: string, style?: string): Promise<{ imageUrl: string; caption: string }> {
    let visualPrompt = concept;
    let caption = concept;

    // If Gemini is available, use it to create a better meme prompt
    if (geminiApiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const styleInstruction = style ? `Render the visual scene in a distinct "${style}" artistic style. ` : "";

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Create a viral Instagram meme concept. Return ONLY a JSON object with two fields:
1. "visual": A detailed image generation prompt for a funny meme image (no text overlays, just the visual scene). ${styleInstruction}Under 80 words.
2. "caption": A short, funny Instagram caption with emojis and hashtags. Under 150 characters.

Meme concept: ${concept}

Respond with ONLY the JSON, no markdown, no explanation.`
              }]
            }]
          }),
        });

        if (response.ok) {
          const data: any = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          try {
            // Try to parse the JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              visualPrompt = parsed.visual || concept;
              caption = parsed.caption || concept;
            }
          } catch {
            console.warn("⚠️ Could not parse Gemini meme JSON, using raw concept");
          }
        }
      } catch (err) {
        console.warn("⚠️ Gemini meme enhancement failed, using raw concept");
      }
    }

    // Generate the image via Pollinations.ai
    console.log(`🎨 Generating AI meme image: "${visualPrompt}"`);
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=1080&height=1080&model=flux&seed=${seed}&nologo=true`;

    return { imageUrl, caption };
  }

  /**
   * Upload image to Catbox.moe for short permanent URL
   */
  private async uploadToCatbox(arrayBuffer: ArrayBuffer): Promise<string> {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="meme.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const suffix = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(prefix),
      Buffer.from(arrayBuffer),
      Buffer.from(suffix)
    ]);

    const res = await axios.post("https://catbox.moe/user/api.php", body, {
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      responseType: "text"
    });

    const text = res.data;
    console.log("Catbox upload response status:", res.status, "body:", text);
    return text.trim();
  }
}

/** Normalize a Reddit MemeResult into the shared MemeCandidate shape */
export function toMemeCandidate(m: MemeResult): MemeCandidate {
  return {
    id: m.postLink,
    title: m.title,
    imageUrl: m.imageUrl,
    source: "reddit",
    category: m.category,
    score: m.upvotes,
  };
}
