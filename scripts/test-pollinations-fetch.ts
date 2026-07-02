import "dotenv/config";

async function main() {
  const prompt = encodeURIComponent("test image");
  const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&model=flux&nologo=true`;
  console.log("Fetching", imageUrl);
  const res = await fetch(imageUrl);
  console.log("Status:", res.status, "Redirected:", res.redirected, "URL:", res.url);
  const buf = await res.arrayBuffer();
  console.log("Buffer length:", buf.byteLength);
}

main().catch(console.error);
