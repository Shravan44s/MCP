import "dotenv/config";
import { TelegramClient } from "../src/services/telegram-client.js";

async function main() {
  console.log("✈️ Sending a test message to your Telegram Bot...");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env!");
    process.exit(1);
  }

  try {
    const client = new TelegramClient(token, chatId);
    const res = await client.sendMessage(
      "🚀 <b>Test successful!</b>\n\nYour Notion Task Orchestrator is successfully linked to your Telegram Bot."
    );
    console.log(`✅ Message sent! Message ID: ${res.messageId}`);
    console.log("Check your Telegram app, you should see the message now.");
  } catch (err: any) {
    console.error("❌ Failed to send message:", err.message);
  }
}

main();
