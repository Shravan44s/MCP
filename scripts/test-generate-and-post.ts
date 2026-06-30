import "dotenv/config";
import { InstagramClient } from "../src/services/instagram-client.js";

async function main() {
  console.log("🎨 Step 1: Generating a comic style image...");
  
  // Prompt for a comic style image
  const prompt = "A vibrant comic book panel showing a superhero looking over a futuristic city, pop art style, bold lines";
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;
  
  console.log(`🔗 Generated Image URL: ${imageUrl}`);
  
  // Load credentials
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  
  if (!token || !userId) {
    console.error("❌ Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID in .env!");
    process.exit(1);
  }
  
  console.log("\n📸 Step 2: Publishing the image to Instagram feed...");
  
  try {
    const instagram = new InstagramClient(token, userId);
    
    // Publish post with caption
    const caption = "Testing my new Notion MCP Task Orchestrator automated posting loop! 🚀 #AIArt #ComicBook #Automation";
    const res = await instagram.publishPhoto(imageUrl, caption);
    
    console.log("\n✅ Success! Post published successfully.");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📎 Media ID: ${res.mediaId}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Check your Instagram account (@symic_originals) to see the new post!");
  } catch (err: any) {
    console.error("\n❌ Failed to publish to Instagram:", err.message);
  }
}

main();
