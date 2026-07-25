// ============================================
// Caption Service — writes a punchy caption line
// (via Gemini, when available) and picks a tiered mix
// of hashtags per category so posts reach different
// audience segments instead of the same ~5 fixed tags
// every time.
// ============================================
import { GeminiClient } from "./gemini-client.js";
import { GroqClient } from "./groq-client.js";

// Broad, high-volume tags every post gets a few of — maximizes initial discovery.
const MEGA_TAGS = ["#memes", "#funny", "#viral", "#trending", "#reels", "#explorepage", "#instagood"];

// Themed mid-tier tags per category — reach the audience segment that actually cares.
const CATEGORY_TAGS: Record<string, string[]> = {
  Trending: ["#dankmemes", "#relatable", "#lol", "#memesdaily"],
  Wholesome: ["#wholesomememes", "#feelgood", "#wholesome", "#positivevibes"],
  Programmer: ["#programmerhumor", "#coding", "#developerlife", "#techmemes"],
  Desi: ["#indianmemes", "#desimemes", "#bollywoodmemes", "#indianhumor"],
  Gaming: ["#gamingmemes", "#gamer", "#pcmasterrace", "#gaminglife"],
  Corporate: ["#corporatelife", "#worklife", "#officehumor", "#9to5"],
  Animals: ["#animalmemes", "#cutepets", "#animalsofinstagram", "#petmemes"],
  Relationship: ["#relationshipmemes", "#datinghumor", "#couplememes"],
  BoomerHumor: ["#facebookmemes", "#boomerhumor", "#oldschoolmemes"],
  Random: ["#meirl", "#randommemes", "#comedy"],
  Search: ["#trendingmemes", "#memepage"],
  Original: ["#originalmemes", "#aimemes", "#customcaption"],
};

// Lower-competition longtail tags — smaller pools, but posts surface faster & stick around longer.
const NICHE_TAGS = [
  "#memesofinstagram", "#dailymemes", "#memepage", "#funnyreels",
  "#viralreels", "#memecommunity", "#memez", "#relatablememes",
];

function sample<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function buildHashtags(category: string): string[] {
  const categoryTags = CATEGORY_TAGS[category] || [];
  const tags = [
    ...sample(MEGA_TAGS, 4),
    ...sample(categoryTags, Math.min(4, categoryTags.length)),
    ...sample(NICHE_TAGS, 5),
  ];
  return [...new Set(tags)];
}

export interface CaptionAiKeys {
  groqApiKey?: string;
  geminiApiKey?: string;
}

function cleanCaption(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

function isUsableCaption(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return !lower.includes("i'm sorry") && !lower.includes("encountered an issue");
}

export async function generateSmartCaption(
  title: string,
  category: string,
  aiKeys?: CaptionAiKeys | string
): Promise<string> {
  // Back-compat: a bare string used to mean "geminiApiKey".
  const keys: CaptionAiKeys = typeof aiKeys === "string" ? { geminiApiKey: aiKeys } : aiKeys || {};

  let line = `${title} 😂`;
  const prompt =
    `Write a punchy, funny 1-sentence Instagram Reel caption (1-2 emojis, no hashtags, no quotes) ` +
    `for a "${category}" meme titled: "${title}". Under 120 characters. Return ONLY the caption text.`;

  // Groq first — much higher free-tier rate limit than Gemini, so it
  // absorbs the per-meme caption calls without tripping 429s.
  if (keys.groqApiKey) {
    try {
      const groq = new GroqClient(keys.groqApiKey);
      const cleaned = cleanCaption(await groq.chat(prompt));
      if (isUsableCaption(cleaned)) line = cleaned;
    } catch {
      // fall through to Gemini / template
    }
  }

  // Gemini as a secondary fallback if Groq wasn't configured or failed.
  if (line === `${title} 😂` && keys.geminiApiKey) {
    try {
      const gemini = new GeminiClient(keys.geminiApiKey);
      const cleaned = cleanCaption(await gemini.chat(prompt));
      if (isUsableCaption(cleaned)) line = cleaned;
    } catch {
      // fall back to the template line above
    }
  }

  const hashtags = buildHashtags(category).join(" ");
  return `${line}\n\n${hashtags}`;
}
