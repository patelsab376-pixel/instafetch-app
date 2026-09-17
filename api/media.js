export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const permalink = String(req.query?.permalink || "").trim();

  if (!permalink) {
    return res.status(400).json({
      error: "Instagram URL is required."
    });
  }

  let url;

  try {
    url = new URL(permalink);
  } catch {
    return res.status(400).json({
      error: "Invalid Instagram URL."
    });
  }

  // Only Instagram Reel/Post URLs
  if (
    !/(^|\.)instagram\.com$/i.test(url.hostname) ||
    !/^\/(reel|reels|p|tv)\b/i.test(url.pathname)
  ) {
    return res.status(400).json({
      error: "Please enter a valid Instagram Reel URL."
    });
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Instagram could not be reached. Please try again."
      });
    }

    const html = await response.text();

    // Try Open Graph video metadata
    const videoMatch =
      html.match(
        /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i
      );

    // Try thumbnail
    const imageMatch =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );

    if (!videoMatch) {
      return res.status(404).json({
        error:
          "Instagram did not expose a downloadable video URL for this Reel. The Reel may be private or Instagram may have changed its page data."
      });
    }

    const videoUrl = videoMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&#x2F;/g, "/");

    const thumbnail = imageMatch
      ? imageMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&#x2F;/g, "/")
      : null;

    return res.status(200).json({
      success: true,
      videoUrl,
      thumbnail,
      originalUrl: permalink
    });
  } catch (error) {
    console.error("Instagram fetch error:", error);

    return res.status(500).json({
      error: "Unable to fetch this Instagram Reel right now."
    });
  }
}
