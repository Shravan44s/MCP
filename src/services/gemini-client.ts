// ============================================
// Google Gemini & Imagen API Client Wrapper
// Generates high-quality images and enhances prompts
// ============================================

export class GeminiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Enhances a basic user prompt into a high-quality descriptive prompt for Imagen 3
   */
  async enhancePrompt(originalPrompt: string): Promise<string> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Enhance this image generation prompt to make it highly detailed, artistic, and visually stunning. Keep the prompt under 100 words. Focus on composition, lighting, camera style, color palette, and textures. Respond ONLY with the enhanced prompt text. Do not include any quotes, markdown formatting, greetings, or extra explanations.\n\nOriginal prompt: ${originalPrompt}`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini enhance API returned status ${response.status}`);
      }

      const data: any = await response.json();
      const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!enhancedText) {
        return originalPrompt; // Fallback
      }

      return enhancedText.trim();
    } catch (err) {
      console.warn("⚠️ Failed to enhance prompt using Gemini, using original prompt:", err);
      return originalPrompt;
    }
  }

  /**
   * Generates a conversational text response using Gemini 2.5 Flash
   */
  async chat(message: string, systemPrompt?: string): Promise<string> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
      
      const contents: any[] = [];
      if (systemPrompt) {
        contents.push({
          role: "user",
          parts: [{ text: `System Instructions: ${systemPrompt}` }]
        });
      }
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (!response.ok) {
        throw new Error(`Gemini chat API returned status ${response.status}`);
      }

      const data: any = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!responseText) {
        throw new Error("No text candidates returned from Gemini");
      }

      return responseText.trim();
    } catch (err: any) {
      console.error("❌ Gemini Chat error:", err);
      return `🤖 I'm sorry, I encountered an issue chatting: ${err.message}`;
    }
  }


  async generateImage(prompt: string, options?: { enhance?: boolean }): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    let finalPrompt = prompt;
    if (options?.enhance !== false) {
      console.log(`✨ Enhancing prompt: "${prompt}"`);
      finalPrompt = await this.enhancePrompt(prompt);
      console.log(`🎨 Enhanced prompt: "${finalPrompt}"`);
    }

    // Since Google's image generation models require paid billing plans on Google AI Studio, 
    // we use the free Gemini 2.5 Flash model to enhance the prompt, and then generate
    // the high-quality image using the FLUX model on Pollinations.ai for free!
    console.log("📡 Generating image via Pollinations.ai using enhanced prompt...");
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

    // Fetch the image and upload to Catbox to keep the URL extremely short and compatible with Notion's 2000 char limit
    console.log("📡 Downloading generated image from Pollinations.ai...");
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image from Pollinations: ${imageRes.statusText}`);
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("☁️ Uploading generated image to Catbox.moe...");
    const fileUrl = await this.uploadToCatbox(arrayBuffer);
    console.log(`🔗 Short hosted image URL ready: ${fileUrl}`);

    return fileUrl;
  }

  /**
   * Helper to upload image ArrayBuffer anonymously to Catbox.moe
   */
  private async uploadToCatbox(arrayBuffer: ArrayBuffer): Promise<string> {
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    
    const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
    formData.append("fileToUpload", blob, "image.jpg");

    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Catbox upload failed: ${res.statusText}`);
    }

    const fileUrl = await res.text();
    return fileUrl.trim();
  }
}
