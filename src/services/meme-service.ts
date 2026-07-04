// ============================================
// Meme Service — Fetches trending memes from
// Reddit and generates AI memes
// ============================================
import axios from "axios";
import FormData from "form-data";

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
}

// Subreddits mapping to simulate fetching memes from different platforms
const PLATFORM_SUBREDDITS: Record<string, string[]> = {
  Reddit: ["memes", "dankmemes", "ProgrammerHumor", "me_irl", "wholesomememes"],
  Instagram: ["Instagramreality", "comedyheaven", "me_irl"],
  Facebook: ["terriblefacebookmemes", "insanepeoplefacebook", "oldpeoplefacebook"],
  YouTube: ["youngpeopleyoutube", "youtubehaiku", "smoobypost"]
};

export class MemeService {
  /**
   * Fetches trending memes from Reddit via meme-api.com
   * @param count Number of memes to fetch (1-10)
   * @param platform Optional specific platform (Reddit, Instagram, Facebook, YouTube)
   */
  async fetchTrending(count: number = 5, platform?: string): Promise<MemeResult[]> {
    const platforms = Object.keys(PLATFORM_SUBREDDITS);
    const selectedPlatform = platform && PLATFORM_SUBREDDITS[platform] 
      ? platform 
      : platforms[Math.floor(Math.random() * platforms.length)];
    
    const subs = PLATFORM_SUBREDDITS[selectedPlatform];
    const sub = subs[Math.floor(Math.random() * subs.length)];
    
    const url = `https://meme-api.com/gimme/${sub}/${Math.min(count, 10)}`;

    console.log(`📡 Fetching ${count} memes from r/${sub} (Platform Proxy: ${selectedPlatform})...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meme API returned ${res.status}`);
    }

    const data: { count: number; memes: RedditMeme[] } = await res.json() as any;

    // Filter out NSFW and spoiler memes
    const safeMemes = data.memes.filter((m) => !m.nsfw && !m.spoiler);

    return safeMemes.map((m) => ({
      title: m.title,
      imageUrl: m.url,
      source: selectedPlatform,
      upvotes: m.ups,
      subreddit: m.subreddit,
      postLink: m.postLink,
    }));
  }

  /**
   * Fetches a single random trending meme
   * @param platform Optional specific platform (Reddit, Instagram, Facebook, YouTube)
   */
  async fetchRandom(platform?: string): Promise<MemeResult> {
    const memes = await this.fetchTrending(5, platform);
    if (memes.length === 0) {
      throw new Error("No safe memes found");
    }
    // Pick the one with most upvotes
    return memes.sort((a, b) => b.upvotes - a.upvotes)[0];
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
