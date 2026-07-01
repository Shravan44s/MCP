// ============================================
// Instagram API Client Wrapper
// Publishes feed posts using Meta Graph API
// ============================================

export interface InstagramAccountStats {
  username: string;
  followers: number;
  following: number;
  mediaCount: number;
  biography: string;
}

export interface InstagramInsights {
  impressions: number;
  reach: number;
  profileViews: number;
}

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  likes: number;
  comments: number;
  timestamp: string;
  mediaType: string;
}

export class InstagramClient {
  private accessToken: string;
  private userId: string;
  private baseUrl = "https://graph.facebook.com/v20.0";

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
  }

  /**
   * Publish a photo to Instagram feed (2-step container workflow)
   */
  async publishPhoto(
    imageUrl: string,
    caption?: string
  ): Promise<{ success: boolean; mediaId: string }> {
    if (!this.accessToken || !this.userId) {
      throw new Error("Instagram access token or User ID is missing");
    }

    // Step 1: Create media container
    const containerUrl = `${this.baseUrl}/${this.userId}/media`;
    const containerRes = await fetch(containerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption || "",
        access_token: this.accessToken,
      }),
    });

    const containerData: any = await containerRes.json();
    if (!containerRes.ok || !containerData.id) {
      throw new Error(
        containerData.error?.message ||
          "Failed to create Instagram media container"
      );
    }

    const creationId = containerData.id;

    // Step 2: Publish the media container
    const publishUrl = `${this.baseUrl}/${this.userId}/media_publish`;
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: this.accessToken,
      }),
    });

    const publishData: any = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      throw new Error(
        publishData.error?.message ||
          "Failed to publish Instagram media container"
      );
    }

    return {
      success: true,
      mediaId: publishData.id,
    };
  }

  /**
   * Publish a Reel (video) to Instagram (3-step flow: create, poll status, publish)
   */
  async publishReel(
    videoUrl: string,
    caption?: string
  ): Promise<{ success: boolean; mediaId: string }> {
    if (!this.accessToken || !this.userId) {
      throw new Error("Instagram access token or User ID is missing");
    }

    // Step 1: Create reels container
    const containerUrl = `${this.baseUrl}/${this.userId}/media`;
    const containerRes = await fetch(containerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: caption || "",
        share_to_feed: true,
        access_token: this.accessToken,
      }),
    });

    const containerData: any = await containerRes.json();
    if (!containerRes.ok || !containerData.id) {
      throw new Error(
        containerData.error?.message ||
          "Failed to create Instagram Reels container"
      );
    }

    const creationId = containerData.id;

    // Step 2: Poll status of the container until finished
    console.log(`📡 Reels container created: ${creationId}. Polling status...`);
    const statusUrl = `${this.baseUrl}/${creationId}?fields=status_code,status&access_token=${this.accessToken}`;
    
    let isFinished = false;
    let attempts = 0;
    const maxAttempts = 30; // Max 5 minutes (30 * 10 seconds)

    while (!isFinished && attempts < maxAttempts) {
      attempts++;
      await new Promise((r) => setTimeout(r, 10000)); // Wait 10s between checks

      const statusRes = await fetch(statusUrl);
      const statusData: any = await statusRes.json();

      if (!statusRes.ok) {
        throw new Error(
          statusData.error?.message || "Failed to poll Reels container status"
        );
      }

      console.log(`   └ Attempt ${attempts}/${maxAttempts}: status_code=${statusData.status_code}`);

      if (statusData.status_code === "FINISHED") {
        isFinished = true;
      } else if (statusData.status_code === "ERROR") {
        throw new Error(`Reels processing failed: ${statusData.error || "unknown error"}`);
      }
    }

    if (!isFinished) {
      throw new Error("Reels processing timed out on Meta servers.");
    }

    // Step 3: Publish the container
    const publishUrl = `${this.baseUrl}/${this.userId}/media_publish`;
    const publishRes = await fetch(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: this.accessToken,
      }),
    });

    const publishData: any = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      throw new Error(
        publishData.error?.message ||
          "Failed to publish Instagram Reels container"
      );
    }

    return {
      success: true,
      mediaId: publishData.id,
    };
  }


  /**
   * Fetch account stats: followers, following, media count, bio
   */
  async getAccountStats(): Promise<InstagramAccountStats> {
    const url = `${this.baseUrl}/${this.userId}?fields=username,followers_count,follows_count,media_count,biography&access_token=${this.accessToken}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Failed to fetch account stats");
    return {
      username: data.username || "",
      followers: data.followers_count || 0,
      following: data.follows_count || 0,
      mediaCount: data.media_count || 0,
      biography: data.biography || "",
    };
  }

  /**
   * Fetch account insights: impressions, reach, profile views (last 7 days)
   */
  async getInsights(): Promise<InstagramInsights> {
    const since = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    const url = `${this.baseUrl}/${this.userId}/insights?metric=impressions,reach,profile_views&period=day&since=${since}&until=${until}&access_token=${this.accessToken}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Failed to fetch insights");

    const get = (metric: string) => {
      const item = data.data?.find((d: any) => d.name === metric);
      return item?.values?.reduce((sum: number, v: any) => sum + (v.value || 0), 0) || 0;
    };

    return {
      impressions: get("impressions"),
      reach: get("reach"),
      profileViews: get("profile_views"),
    };
  }

  /**
   * Fetch the 5 most recent feed posts with like and comment counts
   */
  async getRecentMedia(limit = 5): Promise<InstagramMediaItem[]> {
    const url = `${this.baseUrl}/${this.userId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type&limit=${limit}&access_token=${this.accessToken}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Failed to fetch media");

    return (data.data || []).map((m: any) => ({
      id: m.id,
      caption: m.caption,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      timestamp: m.timestamp,
      mediaType: m.media_type,
    }));
  }
}
