// ============================================
// Instagram API Client Wrapper
// Publishes feed posts using Meta Graph API
// ============================================

export class InstagramClient {
  private accessToken: string;
  private userId: string;

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
    const containerUrl = `https://graph.facebook.com/v20.0/${this.userId}/media`;
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
    const publishUrl = `https://graph.facebook.com/v20.0/${this.userId}/media_publish`;
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
}
