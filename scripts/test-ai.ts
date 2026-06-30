async function main() {
  console.log("🎨 Generating a test image via keyless AI...");
  const prompt = "A cute fluffy kitten playing with a ball of red yarn, highly detailed, photorealistic";

  try {
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

    console.log("📡 Sending validation request to Pollinations.ai...");
    const verify = await fetch(imageUrl, { method: "HEAD" });

    if (!verify.ok) {
      throw new Error(`Pollinations API returned status: ${verify.status}`);
    }

    console.log("\n✅ AI Generation Verification Successful!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🔗 Generated Image Link:\n${imageUrl}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("Open the link above in your browser to view your generated AI image!");
  } catch (err: any) {
    console.error("\n❌ AI Generation Verification Failed:", err.message);
  }
}

main();
