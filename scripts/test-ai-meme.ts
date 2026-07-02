import "dotenv/config";
import { MemeService } from "../src/services/meme-service.js";

async function main() {
  const memeService = new MemeService();
  const apiKey = process.env.GEMINI_API_KEY || "";
  console.log("Generating AI meme...");
  const result = await memeService.generateAIMeme("a funny programmer meme about bugs", apiKey);
  console.log("Generated:", result);
}

main().catch(console.error);
