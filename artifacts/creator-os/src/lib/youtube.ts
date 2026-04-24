const apiKey = (import.meta as any).env.VITE_YOUTUBE_API_KEY as string | undefined;

if (!apiKey) {
  console.warn("Missing VITE_YOUTUBE_API_KEY — YouTube auto-fetch disabled.");
}

const BASE = "https://www.googleapis.com/youtube/v3";

export type YouTubeChannelData = {
  channelId: string;
  handle: string;
  customUrl: string;
  title: string;
  description: string;
  country: string;
  keywords: string[];
  logoUrl: string;
  bannerUrl: string;
  subscriberCount: number;
  totalVideos: number;
  totalViews: number;
  publishedAt: string;
  channelAge: string;
  uploadsPlaylistId: string;
};

export type YouTubeRecentVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  tags: string[];
  category: string;
  url: string;
};

function ageString(publishedAt: string): string {
  const start = new Date(publishedAt).getTime();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths ? `${years}y ${remMonths}mo` : `${years}y`;
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, mn, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(mn ?? 0) * 60) + Number(s ?? 0);
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Resolves a channel by handle (e.g. "@TechnicalWhiteHat"), channel ID (UCxxx),
 * or custom URL slug. Returns full channel data.
 */
export async function fetchChannel(input: string): Promise<YouTubeChannelData> {
  if (!apiKey) throw new Error("YouTube API key not configured.");

  const trimmed = input.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/$/, "");
  let query = "";
  if (trimmed.startsWith("UC") && trimmed.length >= 20) {
    query = `id=${encodeURIComponent(trimmed)}`;
  } else if (trimmed.startsWith("@")) {
    query = `forHandle=${encodeURIComponent(trimmed)}`;
  } else if (trimmed.startsWith("channel/")) {
    query = `id=${encodeURIComponent(trimmed.replace("channel/", ""))}`;
  } else if (trimmed.startsWith("c/") || trimmed.startsWith("user/")) {
    query = `forUsername=${encodeURIComponent(trimmed.replace(/^(c|user)\//, ""))}`;
  } else {
    // Plain text — assume it's a handle
    query = `forHandle=${encodeURIComponent("@" + trimmed)}`;
  }

  const url = `${BASE}/channels?part=snippet,statistics,contentDetails,brandingSettings&${query}&key=${apiKey}`;
  const data = await fetchJson(url);

  const item = data.items?.[0];
  if (!item) throw new Error(`No channel found for "${input}".`);

  const sn = item.snippet ?? {};
  const st = item.statistics ?? {};
  const cd = item.contentDetails?.relatedPlaylists ?? {};
  const bs = item.brandingSettings?.image ?? {};

  const channelSettings = item.brandingSettings?.channel ?? {};
  return {
    channelId: item.id,
    handle: sn.customUrl ?? "",
    customUrl: sn.customUrl ?? "",
    title: sn.title ?? "",
    description: sn.description ?? "",
    country: sn.country ?? "",
    keywords: (channelSettings.keywords ?? "")
      .split(/[\s,]+/)
      .map((k: string) => k.trim().replace(/^"|"$/g, ""))
      .filter(Boolean),
    logoUrl:
      sn.thumbnails?.high?.url ??
      sn.thumbnails?.medium?.url ??
      sn.thumbnails?.default?.url ??
      "",
    bannerUrl: bs.bannerExternalUrl ?? "",
    subscriberCount: Number(st.subscriberCount ?? 0),
    totalVideos: Number(st.videoCount ?? 0),
    totalViews: Number(st.viewCount ?? 0),
    publishedAt: sn.publishedAt ?? "",
    channelAge: sn.publishedAt ? ageString(sn.publishedAt) : "",
    uploadsPlaylistId: cd.uploads ?? "",
  };
}

function mapVideoItem(v: any): YouTubeRecentVideo {
  const sn = v.snippet ?? {};
  const st = v.statistics ?? {};
  const cd = v.contentDetails ?? {};
  return {
    id: v.id,
    title: sn.title ?? "",
    description: sn.description ?? "",
    publishedAt: sn.publishedAt ?? "",
    thumbnailUrl:
      sn.thumbnails?.maxres?.url ??
      sn.thumbnails?.high?.url ??
      sn.thumbnails?.medium?.url ??
      sn.thumbnails?.default?.url ??
      "",
    views: Number(st.viewCount ?? 0),
    likes: st.likeCount === undefined || st.likeCount === null ? -1 : Number(st.likeCount),
    comments: st.commentCount === undefined || st.commentCount === null ? -1 : Number(st.commentCount),
    durationSeconds: parseDuration(cd.duration ?? "PT0S"),
    tags: sn.tags ?? [],
    category: sn.categoryId ?? "",
    url: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

/**
 * Fetches one page (max 50) of uploads from a channel's uploads playlist,
 * with statistics and duration enriched. Returns the next page token if any.
 */
export async function fetchVideosPage(
  uploadsPlaylistId: string,
  pageToken?: string,
): Promise<{ videos: YouTubeRecentVideo[]; nextPageToken: string }> {
  if (!apiKey) throw new Error("YouTube API key not configured.");
  if (!uploadsPlaylistId) return { videos: [], nextPageToken: "" };

  const playlistUrl =
    `${BASE}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
    `&maxResults=50&key=${apiKey}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
  const playlist = await fetchJson(playlistUrl);

  const ids: string[] = (playlist.items ?? [])
    .map((it: any) => it.contentDetails?.videoId)
    .filter(Boolean);

  const nextPageToken = playlist.nextPageToken ?? "";
  if (ids.length === 0) return { videos: [], nextPageToken };

  const videosUrl = `${BASE}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${apiKey}`;
  const videos = await fetchJson(videosUrl);

  return {
    videos: (videos.items ?? []).map(mapVideoItem),
    nextPageToken,
  };
}

/**
 * Backwards-compatible: fetches the first page of recent uploads.
 */
export async function fetchRecentVideos(
  uploadsPlaylistId: string,
  _maxResults = 50,
): Promise<YouTubeRecentVideo[]> {
  const { videos } = await fetchVideosPage(uploadsPlaylistId);
  return videos;
}

/**
 * Fetches a single video's full details by ID — used for the detail page when
 * a video isn't in the cached list.
 */
export async function fetchVideoById(id: string): Promise<YouTubeRecentVideo | null> {
  if (!apiKey) throw new Error("YouTube API key not configured.");
  if (!id) return null;
  const url = `${BASE}/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${apiKey}`;
  const data = await fetchJson(url);
  const item = data.items?.[0];
  return item ? mapVideoItem(item) : null;
}

export const SHORTS_MAX_DURATION = 180;

export function isShort(video: { durationSeconds: number }): boolean {
  return video.durationSeconds > 0 && video.durationSeconds <= SHORTS_MAX_DURATION;
}

/**
 * Compactify any channelAge string (legacy "3 years, 1 months" or new "3y 1mo")
 * down to a short form that fits in narrow KPI columns. Returns "—" for empty.
 */
export function compactAge(s: string | undefined | null): string {
  if (!s) return "—";
  const trimmed = s.trim();
  if (!trimmed || trimmed === "—") return "—";
  return trimmed
    .replace(/\s*years?/gi, "y")
    .replace(/\s*months?/gi, "mo")
    .replace(/\s*days?/gi, "d")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compact number formatter that respects "hidden" sentinel (-1).
 * Use this for likes / comments which creators may hide on their videos.
 */
export function formatCount(n: number): string {
  if (n < 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export type YouTubeComment = {
  id: string;
  author: string;
  authorImage: string;
  authorChannelId: string;
  text: string;
  textPlain: string;
  likes: number;
  publishedAt: string;
  replyCount: number;
};

/**
 * Fetches top-level comments for a video using the API key (no OAuth required).
 * Returns up to `maxResults` comments ordered by relevance (YouTube's default).
 */
export async function fetchVideoComments(
  videoId: string,
  maxResults = 30,
  order: "relevance" | "time" = "relevance",
): Promise<YouTubeComment[]> {
  if (!apiKey) throw new Error("YouTube API key not configured.");
  if (!videoId) return [];

  const url =
    `${BASE}/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(videoId)}` +
    `&maxResults=${Math.min(100, Math.max(1, maxResults))}&order=${order}&textFormat=plainText&key=${apiKey}`;
  const data = await fetchJson(url);

  return (data.items ?? []).map((item: any): YouTubeComment => {
    const top = item.snippet?.topLevelComment?.snippet ?? {};
    return {
      id: item.id,
      author: top.authorDisplayName ?? "Unknown",
      authorImage: top.authorProfileImageUrl ?? "",
      authorChannelId: top.authorChannelId?.value ?? "",
      text: top.textDisplay ?? "",
      textPlain: top.textOriginal ?? top.textDisplay ?? "",
      likes: Number(top.likeCount ?? 0),
      publishedAt: top.publishedAt ?? "",
      replyCount: Number(item.snippet?.totalReplyCount ?? 0),
    };
  });
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
