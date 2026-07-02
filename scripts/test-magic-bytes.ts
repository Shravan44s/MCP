import "dotenv/config";

async function main() {
  const prompt = encodeURIComponent("test image");
  const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&model=flux&nologo=true`;
  const imgRes = await fetch(imageUrl);
  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log("Magic bytes:", buffer.subarray(0, 10).toString("hex"));
}

main().catch(console.error);
