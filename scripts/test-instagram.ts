import "dotenv/config";

async function main() {
  console.log("📸 Verifying Instagram Connection...");
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;

  if (!token || !userId) {
    console.error("❌ Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID in .env!");
    process.exit(1);
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${userId}?fields=username,name&access_token=${token}`;
    const res = await fetch(url);
    const data: any = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || "Verification failed");
    }

    console.log("\n✅ Instagram Connection Successful!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`👤 Name:     ${data.name || "N/A"}`);
    console.log(`🏷️ Username: @${data.username}`);
    console.log(`📎 ID:       ${data.id}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (err: any) {
    console.error("\n❌ Instagram Verification Failed:", err.message);
    process.exit(1);
  }
}

main();
