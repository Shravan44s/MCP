import "dotenv/config";

async function main() {
  const imageUrl = "https://picsum.photos/1080/1080";
  console.log("📥 Fetching from Pollinations:", imageUrl);

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image: status ${imgRes.status} ${imgRes.statusText}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  console.log("ArrayBuffer byteLength:", arrayBuffer.byteLength);

  // Method 1: Using buffer from ArrayBuffer
  const buffer1 = Buffer.from(arrayBuffer);
  console.log("Buffer 1 length:", buffer1.length, "offset:", buffer1.byteOffset);

  const blob1 = new Blob([new Uint8Array(buffer1.buffer, buffer1.byteOffset, buffer1.byteLength) as any], { type: "image/jpeg" });
  const formData1 = new FormData();
  formData1.append("reqtype", "fileupload");
  formData1.append("fileToUpload", blob1, "meme.jpg");

  console.log("☁️ Uploading Method 1 to Catbox...");
  const res1 = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: formData1 });
  console.log("Method 1 Status:", res1.status, "Body:", await res1.text());

  // Method 2: Creating Blob directly from ArrayBuffer (no Buffer conversion!)
  const blob2 = new Blob([arrayBuffer], { type: "image/jpeg" });
  const formData2 = new FormData();
  formData2.append("reqtype", "fileupload");
  formData2.append("fileToUpload", blob2, "meme.jpg");

  console.log("\n☁️ Uploading Method 2 to Catbox...");
  const res2 = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: formData2 });
  console.log("Method 2 Status:", res2.status, "Body:", await res2.text());
}

main().catch(console.error);
