export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (!token || !igUserId) {
    return res.status(500).json({
      error: "Instagram API is not configured. Add IG_ACCESS_TOKEN and IG_USER_ID in Vercel Environment Variables."
    });
  }

  const permalink = String(req.query?.permalink || "").trim();
  if (!permalink) {
    return res.status(400).json({ error: "Missing Instagram permalink." });
  }

  let requested;
  try {
    requested = new URL(permalink);
  } catch {
    return res.status(400).json({ error: "Invalid URL." });
  }

  if (!/(^|\.)instagram\.com$/i.test(requested.hostname) ||
      !/^\/(reel|reels|p|tv)\//i.test(requested.pathname)) {
    return res.status(400).json({ error: "Only Instagram Reel/post URLs are supported." });
  }

  // This endpoint searches media exposed by the connected Instagram account.
  // It does not scrape arbitrary accounts or bypass Instagram access controls.
  let url = new URL(`https://graph.instagram.com/${encodeURIComponent(igUserId)}/media`);
  url.searchParams.set("fields", "id,media_type,media_url,permalink,caption,timestamp,thumbnail_url");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);

  try {
    for (let page = 0; page < 5 && url; page++) {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error?.message || "Instagram API request failed."
        });
      }

      const item = (data.data || []).find((m) => {
        if (!m.permalink) return false;
        try {
          const a = new URL(m.permalink);
          const b = new URL(permalink);
          return a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
        } catch {
          return false;
        }
      });

      if (item) {
        if (!item.media_url) {
          return res.status(404).json({
            error: "Instagram returned this media item without a downloadable media URL."
          });
        }
        return res.status(200).json({
          id: item.id,
          media_type: item.media_type,
          media_url: item.media_url,
          thumbnail_url: item.thumbnail_url || null,
          caption: item.caption || "",
          permalink: item.permalink
        });
      }

      url = data?.paging?.next ? new URL(data.paging.next) : null;
    }

    return res.status(404).json({
      error: "That URL was not found in the connected Instagram account's available media."
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error while contacting Instagram." });
  }
}
