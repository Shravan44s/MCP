// ============================================
// Audio Service — Trending Background Music Provider
// Provides curated trending audio tracks for Instagram Reels.
// ============================================

export interface AudioTrack {
  id: string;
  name: string;
  genre: string;
  url: string;
}

export const TRENDING_AUDIO_TRACKS: AudioTrack[] = [
  {
    id: "track-1",
    name: "Upbeat Synth & Electronic Beat",
    genre: "Synthwave",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: "track-2",
    name: "Energetic Pop & Dance Beat",
    genre: "Pop/Dance",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  },
  {
    id: "track-3",
    name: "Cool Lo-Fi Chill Groove",
    genre: "Lo-Fi",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  },
  {
    id: "track-4",
    name: "Funky Disco & Upbeat Rhythm",
    genre: "Funk",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  },
  {
    id: "track-5",
    name: "High Energy Electronic Phonk",
    genre: "Electronic",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  },
  {
    id: "track-6",
    name: "Upbeat Rock & Pop Groove",
    genre: "Upbeat Pop",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
  },
];

export class AudioService {
  /**
   * Returns a random trending background audio track.
   */
  getRandomTrack(): AudioTrack {
    const index = Math.floor(Math.random() * TRENDING_AUDIO_TRACKS.length);
    return TRENDING_AUDIO_TRACKS[index];
  }

  /**
   * Fetches the audio track buffer for the given track or a random one.
   */
  async fetchAudioBuffer(track?: AudioTrack): Promise<{ track: AudioTrack; buffer: Buffer }> {
    const selected = track || this.getRandomTrack();
    console.log(`🎵 Selected audio track: "${selected.name}" (${selected.genre})`);

    for (const item of [selected, ...TRENDING_AUDIO_TRACKS]) {
      try {
        const res = await fetch(item.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && (contentType.includes("audio") || contentType.includes("mpeg") || contentType.includes("octet-stream"))) {
          const buffer = Buffer.from(await res.arrayBuffer());
          if (buffer.length > 5000) {
            return { track: item, buffer };
          }
        }
      } catch (err) {
        console.warn(`⚠️ Download attempt failed for audio track "${item.name}":`, err);
      }
    }

    throw new Error("Failed to fetch background audio track from all providers");
  }
}
