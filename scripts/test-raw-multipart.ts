import "dotenv/config";

async function main() {
  const prompt = encodeURIComponent("test image");
  const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&model=flux&nologo=true`;
  console.log("📥 Fetching from Pollinations:", imageUrl);
  const imgRes = await fetch(imageUrl);
  const arrayBuffer = await imgRes.arrayBuffer();

  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="meme.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const suffix = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(prefix),
    Buffer.from(arrayBuffer),
    Buffer.from(suffix)
  ]);

  console.log("☁️ Uploading manually built multipart form-data to Catbox...");
  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  
  console.log("Status:", res.status, "Body:", await res.text());
}

main().catch(console.error);
