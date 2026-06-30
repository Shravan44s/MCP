import "dotenv/config";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env!");
    process.exit(1);
  }

  console.log("📡 Checking Telegram Webhook status...");
  
  try {
    const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
    const res = await fetch(url);
    const data: any = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.description || "Failed to get webhook info");
    }

    const info = data.result;
    console.log("\n================ Webhook Status ================");
    console.log(`🔗 Webhook URL:        ${info.url || "❌ None (Webhook is not set!)"}`);
    console.log(`⏳ Pending Updates:     ${info.pending_update_count ?? 0}`);
    console.log(`❌ Last Error Date:     ${info.last_error_date ? new Date(info.last_error_date * 1000).toLocaleString() : "None"}`);
    console.log(`📝 Last Error Message:  ${info.last_error_message || "None"}`);
    console.log("================================================\n");

    if (!info.url) {
      console.log("💡 Webhook is not set. Telegram doesn't know where to send your messages.");
      console.log("To set it, you must deploy your code to Vercel, get your production URL, and run:");
      console.log(`curl "https://api.telegram.org/bot${token}/setWebhook?url=https://<YOUR-VERCEL-DOMAIN>.vercel.app/api/telegram"`);
    } else {
      console.log("💡 If the webhook URL is correct, make sure your Vercel deployment has completed and the environment variables match.");
    }
  } catch (err: any) {
    console.error("❌ Error fetching webhook info:", err.message);
  }
}

main();
