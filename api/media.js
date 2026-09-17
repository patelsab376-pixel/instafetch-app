export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const permalink = String(req.query?.permalink || "").trim();

  if (!permalink) {
    return res.status(400).json({
      error: "Instagram URL is required."
    });
  }

  let pageUrl;

  try {
    pageUrl = new URL(permalink);
  } catch {
    return res.status(400).json({
      error: "Invalid Instagram URL."
    });
  }

  if (
    !/(^|\.)instagram\.com$/i.test(pageUrl.hostname) ||
    !/^\/(reel|reels|p|tv)\b/i.test(pageUrl.pathname)
  ) {
    return res.status(400).json({
      error: "Please enter a valid Instagram Reel URL."
    });
  }

  // Get the Reel shortcode
  const parts = pageUrl.pathname.split("/").filter(Boolean);
  const code = parts[1];

  if (!code) {
    return res.status(400).json({
      error: "Instagram Reel code could not be found."
    });
  }

  try {
    const response = await fetch(pageUrl.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Instagram could not be reached."
      });
    }

    const html = await response.text();

    let videoUrl = null;
    let thumbnail = null;

    /*
     * METHOD 1
     * Instagram Relay / embedded page data
     *
     * We look for the Reel shortcode and then
     * extract its video_versions array.
     */

    const codeMarker = `"code":"${code}"`;
    const codeIndex = html.indexOf(codeMarker);

    if (codeIndex !== -1) {
      const videoIndex = html.indexOf(
        '"video_versions":',
        codeIndex
      );

      if (videoIndex !== -1) {
        const afterVideo = html.slice(videoIndex);

        const match = afterVideo.match(
          /"video_versions":(\[[\s\S]*?\]),"has_audio"/
        );

        if (match && match[1]) {
          try {
            const versions = JSON.parse(match[1]);

            if (Array.isArray(versions) && versions.length > 0) {
              const validVersions = versions.filter(
                item => item && typeof item.url === "string"
              );

              if (validVersions.length > 0) {
                // Prefer the largest available video
                validVersions.sort((a, b) => {
                  const aSize = (a.width || 0) * (a.height || 0);
                  const bSize = (b.width || 0) * (b.height || 0);
                  return bSize - aSize;
                });

                videoUrl = validVersions[0].url;
              }
            }
          } catch (error) {
            console.log("video_versions JSON parse failed");
          }
        }
      }
    }

    /*
     * METHOD 2
     * Open Graph fallback
     */

    if (!videoUrl) {
      const ogVideo =
        html.match(
          /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video:secure_url["']/i
        ) ||
        html.match(
          /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i
        );

      if (ogVideo) {
        videoUrl = ogVideo[1];
      }
    }

    /*
     * Thumbnail
     */

    const ogImage =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );

    if (ogImage) {
      thumbnail = ogImage[1];
    }

    if (!videoUrl) {
      return res.status(404).json({
        error:
          "Instagram did not expose a downloadable video for this Reel. The Reel may be private, restricted, or Instagram may have changed its page data."
      });
    }

    return res.status(200).json({
      success: true,
      videoUrl,
      thumbnail,
      originalUrl: permalink,
      shortcode: code
    });

  } catch (error) {
    console.error("Instagram extraction error:", error);

    return res.status(500).json({
      error: "Unable to fetch this Instagram Reel right now."
    });
  }
}
