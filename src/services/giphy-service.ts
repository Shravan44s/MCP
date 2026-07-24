// ============================================
// Giphy Service — Free, keyed, ToS-compliant source
// of trending funny GIFs that already ship as .mp4,
// so no ffmpeg conversion is needed before posting.
// ============================================
import type { MemeCandidate } from "../types/index.js";

interface GiphyGif {
  id: string;
  title: string;
  images: {
    original: { mp4?: string; url?: string };
  };
}

export class GiphyService {
  private apiKey: string;
  private baseUrl = "https://api.giphy.com/v1/gifs";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchTrending(limit: number = 10, category: string = "Trending"): Promise<MemeCandidate[]> {
    const url = `${this.baseUrl}/trending?api_key=${this.apiKey}&limit=${limit}&rating=g`;
    return this.fetchAndMap(url, category);
  }

  async search(query: string, limit: number = 10): Promise<MemeCandidate[]> {
    const url = `${this.baseUrl}/search?api_key=${this.apiKey}&q=${encodeURIComponent(query)}&limit=${limit}&rating=g`;
    return this.fetchAndMap(url, "Search");
  }

  private async fetchAndMap(url: string, category: string): Promise<MemeCandidate[]> {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: { data: GiphyGif[] } = (await res.json()) as any;

      return (data.data || [])
        .filter((g) => g.images?.original?.mp4)
        .map((g, i) => ({
          id: `giphy:${g.id}`,
          title: g.title || "Trending GIF",
          videoUrl: g.images.original.mp4!,
          source: "giphy" as const,
          category,
          // Giphy doesn't expose vote counts on this tier — rank by trending position instead
          score: 1000 - i,
        }));
    } catch (err) {
      console.warn("⚠️ Giphy fetch failed:", err);
      return [];
    }
  }
}
