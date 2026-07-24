// ============================================
// Media Host — publicly hosts a rendered file via a
// throwaway GitHub Release asset.
//
// Free anonymous hosts (Catbox, 0x0.st) actively block
// cloud/datacenter IPs — exactly what both Vercel's
// serverless functions and GitHub Actions runners are —
// so uploads from this app's server-side code get
// rejected there even though the same code works fine
// from a residential IP. This repo's own GitHub API
// access doesn't have that problem, so a short-lived
// release asset is used as the public URL Meta's servers
// fetch the video/image from before publishing.
// ============================================

const GITHUB_API = "https://api.github.com";

/**
 * Uploads a buffer as a GitHub Release asset on the given repo and
 * returns its public download URL. The repo must be public (asset URLs
 * are unauthenticated) and the token needs `contents: write`.
 */
export async function hostFilePublicly(
  githubToken: string,
  ownerRepo: string,
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_MEDIA_REPO "${ownerRepo}" — expected "owner/repo"`);
  }

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const tag = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ tag_name: tag, name: "Temporary media upload", prerelease: true }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create temporary release: HTTP ${createRes.status} ${await createRes.text()}`);
  }
  const release: any = await createRes.json();

  const uploadRes = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": contentType, "Content-Length": String(buffer.length) },
      body: new Uint8Array(buffer),
    }
  );
  if (!uploadRes.ok) {
    throw new Error(`Failed to upload release asset: HTTP ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const asset: any = await uploadRes.json();

  return asset.browser_download_url as string;
}
