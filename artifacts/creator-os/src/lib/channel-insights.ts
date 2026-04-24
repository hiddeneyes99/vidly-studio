import type { YouTubeRecentVideo } from "./youtube";
import { isShort } from "./youtube";

// ========= Best Posting Times =========

export type PostingSlot = {
  dayOfWeek: number; // 0 = Sun, 6 = Sat
  hour: number; // 0–23
  videoCount: number;
  avgScore: number; // normalized views-per-day
  totalViews: number;
};

export type BestPostingTimesResult = {
  slots: PostingSlot[]; // sorted by avgScore desc, all slots with >=1 video
  top: PostingSlot[]; // top 3
  channelAvgScore: number;
  totalAnalyzed: number;
  heatmap: number[][]; // 7 x 24, normalized 0..1, 0 if no data
  bestDayLabel: string;
  bestHourLabel: string;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatHour(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${suffix}`;
}

export function formatHourRange(h: number): string {
  return `${formatHour(h)}–${formatHour((h + 1) % 24)}`;
}

export function dayLabel(d: number, long = false): string {
  return (long ? DAY_NAMES_LONG : DAY_NAMES)[d] ?? "";
}

/**
 * Compute the best posting times from a creator's existing uploads.
 * Score = views per day since publish (normalizes for video age).
 * Slots are bucketed by (local dayOfWeek, hour). Slots with very few videos
 * are still included but the top-K should be taken from slots with >=1 video.
 */
export function computeBestPostingTimes(
  videos: YouTubeRecentVideo[],
): BestPostingTimesResult {
  const valid = videos.filter((v) => v.publishedAt && v.views >= 0);
  const now = Date.now();

  // Score per video = views per day, capped at min 1 day to avoid division spikes
  const scored = valid.map((v) => {
    const ts = new Date(v.publishedAt).getTime();
    const ageDays = Math.max(1, (now - ts) / (1000 * 60 * 60 * 24));
    const d = new Date(ts);
    return {
      dayOfWeek: d.getDay(),
      hour: d.getHours(),
      score: v.views / ageDays,
      views: v.views,
    };
  });

  // Group by (day, hour)
  const buckets = new Map<string, { day: number; hour: number; scores: number[]; views: number }>();
  for (const s of scored) {
    const k = `${s.dayOfWeek}-${s.hour}`;
    const b = buckets.get(k) ?? { day: s.dayOfWeek, hour: s.hour, scores: [], views: 0 };
    b.scores.push(s.score);
    b.views += s.views;
    buckets.set(k, b);
  }

  const slots: PostingSlot[] = Array.from(buckets.values()).map((b) => ({
    dayOfWeek: b.day,
    hour: b.hour,
    videoCount: b.scores.length,
    avgScore: b.scores.reduce((a, c) => a + c, 0) / b.scores.length,
    totalViews: b.views,
  }));

  slots.sort((a, b) => b.avgScore - a.avgScore);

  const channelAvgScore =
    scored.length > 0 ? scored.reduce((a, c) => a + c.score, 0) / scored.length : 0;

  // Build heatmap normalized 0..1 by max bucket score
  const maxScore = slots[0]?.avgScore ?? 0;
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of slots) {
    heatmap[s.dayOfWeek][s.hour] = maxScore > 0 ? s.avgScore / maxScore : 0;
  }

  // Pick top 3 slots from buckets that have at least 1 video
  const top = slots.slice(0, 3);

  // Best day overall: sum of avgScore across hours
  const dayTotals: number[] = Array(7).fill(0);
  const dayCounts: number[] = Array(7).fill(0);
  for (const s of slots) {
    dayTotals[s.dayOfWeek] += s.avgScore;
    dayCounts[s.dayOfWeek] += 1;
  }
  const dayAverages = dayTotals.map((t, i) => (dayCounts[i] > 0 ? t / dayCounts[i] : 0));
  const bestDay = dayAverages.indexOf(Math.max(...dayAverages));

  // Best hour overall: sum of avgScore across days
  const hourTotals: number[] = Array(24).fill(0);
  const hourCounts: number[] = Array(24).fill(0);
  for (const s of slots) {
    hourTotals[s.hour] += s.avgScore;
    hourCounts[s.hour] += 1;
  }
  const hourAverages = hourTotals.map((t, i) => (hourCounts[i] > 0 ? t / hourCounts[i] : 0));
  const bestHour = hourAverages.indexOf(Math.max(...hourAverages));

  return {
    slots,
    top,
    channelAvgScore,
    totalAnalyzed: scored.length,
    heatmap,
    bestDayLabel: scored.length > 0 ? DAY_NAMES_LONG[bestDay] : "—",
    bestHourLabel: scored.length > 0 ? formatHourRange(bestHour) : "—",
  };
}

/**
 * Convert a top slot into a "HH:MM" string compatible with the
 * existing channel.bestPostingTimes array.
 */
export function slotToTimeString(slot: PostingSlot): string {
  const h = String(slot.hour).padStart(2, "0");
  return `${dayLabel(slot.dayOfWeek)} ${h}:00`;
}

// ========= Language Detection =========

export type DetectedLanguage = {
  primary: "Hindi" | "English" | "Hinglish" | "Other";
  hindiRatio: number; // 0..1 (Devanagari char ratio)
  confidence: number; // 0..1
};

export function detectLanguage(videos: YouTubeRecentVideo[]): DetectedLanguage {
  const sample = videos
    .slice(0, 30)
    .map((v) => `${v.title} ${v.description.slice(0, 200)}`)
    .join(" ");

  const letters = sample.replace(/[^A-Za-z\u0900-\u097F]/g, "");
  if (letters.length < 20) {
    return { primary: "Other", hindiRatio: 0, confidence: 0.1 };
  }

  const devanagari = letters.match(/[\u0900-\u097F]/g)?.length ?? 0;
  const ratio = devanagari / letters.length;

  let primary: DetectedLanguage["primary"];
  if (ratio >= 0.5) primary = "Hindi";
  else if (ratio >= 0.1) primary = "Hinglish";
  else primary = "English";

  return {
    primary,
    hindiRatio: ratio,
    confidence: Math.min(1, letters.length / 500),
  };
}

// ========= Niche / Topic Detection (keyword-based) =========

export type DetectedNiche = {
  topKeywords: { word: string; count: number }[];
  suggestedNiche: string;
  longRatio: number;
  shortRatio: number;
  dominantFormat: "Long" | "Shorts" | "Mixed";
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "for", "in", "on", "at",
  "is", "are", "was", "were", "be", "been", "this", "that", "with", "by",
  "from", "how", "what", "why", "when", "where", "who", "which", "all", "any",
  "you", "your", "my", "we", "our", "his", "her", "its", "i", "it",
  "ka", "ki", "ke", "ko", "ek", "do", "hai", "tha", "thi", "se", "mein", "main",
  "kya", "kaise", "kyon", "kahan", "yeh", "vah", "woh", "video", "channel",
  "subscribe", "like", "comment", "watch", "youtube", "shorts",
]);

export function detectNiche(
  videos: YouTubeRecentVideo[],
  fallbackKeywords: string[] = [],
): DetectedNiche {
  const wordCounts = new Map<string, number>();

  const eat = (text: string, weight = 1) => {
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
    for (const t of tokens) {
      wordCounts.set(t, (wordCounts.get(t) ?? 0) + weight);
    }
  };

  for (const v of videos.slice(0, 50)) {
    eat(v.title, 3);
    for (const tag of v.tags ?? []) eat(tag, 2);
  }
  for (const k of fallbackKeywords) eat(k, 1);

  const topKeywords = Array.from(wordCounts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const suggestedNiche = topKeywords
    .slice(0, 3)
    .map((k) => k.word.charAt(0).toUpperCase() + k.word.slice(1))
    .join(" • ") || "—";

  const longCount = videos.filter((v) => !isShort(v)).length;
  const shortCount = videos.filter((v) => isShort(v)).length;
  const total = longCount + shortCount;
  const longRatio = total > 0 ? longCount / total : 0;
  const shortRatio = total > 0 ? shortCount / total : 0;
  const dominantFormat: DetectedNiche["dominantFormat"] =
    longRatio >= 0.7 ? "Long" : shortRatio >= 0.7 ? "Shorts" : "Mixed";

  return { topKeywords, suggestedNiche, longRatio, shortRatio, dominantFormat };
}

// ========= Published Video Outliers =========

export type OutlierTier = "🔥 Hit" | "✅ Solid" | "⚪ Average" | "⚠️ Underperformer";

export type VideoOutlier = {
  video: YouTubeRecentVideo;
  score: number; // views per day
  liftPercent: number; // vs channel avg, e.g. +120 means 2.2x avg
  tier: OutlierTier;
};

export type OutlierResult = {
  channelAvgScore: number;
  hits: VideoOutlier[];
  underperformers: VideoOutlier[];
  all: VideoOutlier[];
};

export function computeOutliers(videos: YouTubeRecentVideo[]): OutlierResult {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const valid = videos.filter((v) => v.publishedAt && v.views >= 0);

  const scored: VideoOutlier[] = valid.map((v) => {
    const ageDays = Math.max(1, (now - new Date(v.publishedAt).getTime()) / day);
    const score = v.views / ageDays;
    return { video: v, score, liftPercent: 0, tier: "⚪ Average" as OutlierTier };
  });

  if (scored.length === 0) {
    return { channelAvgScore: 0, hits: [], underperformers: [], all: [] };
  }

  const channelAvgScore =
    scored.reduce((a, c) => a + c.score, 0) / scored.length;

  for (const s of scored) {
    s.liftPercent =
      channelAvgScore > 0 ? ((s.score / channelAvgScore) - 1) * 100 : 0;
    if (s.liftPercent >= 100) s.tier = "🔥 Hit";
    else if (s.liftPercent >= 20) s.tier = "✅ Solid";
    else if (s.liftPercent <= -50) s.tier = "⚠️ Underperformer";
    else s.tier = "⚪ Average";
  }

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const hits = sorted.filter((s) => s.tier === "🔥 Hit").slice(0, 5);
  const underperformers = [...scored]
    .sort((a, b) => a.score - b.score)
    .filter((s) => s.tier === "⚠️ Underperformer")
    .slice(0, 5);

  return { channelAvgScore, hits, underperformers, all: sorted };
}

// ========= Cadence =========

export type Cadence = {
  uploadsLast30Days: number;
  uploadsLast90Days: number;
  uploadsPerWeek: number;
  daysSinceLastUpload: number | null;
  trend: "rising" | "falling" | "steady" | "unknown";
};

export function computeCadence(videos: YouTubeRecentVideo[]): Cadence {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const valid = videos.filter((v) => v.publishedAt);
  const ts = valid.map((v) => new Date(v.publishedAt).getTime());

  const last30 = ts.filter((t) => now - t <= 30 * day).length;
  const last90 = ts.filter((t) => now - t <= 90 * day).length;
  const uploadsPerWeek = last90 > 0 ? (last90 / 90) * 7 : 0;

  const last = ts.length > 0 ? Math.max(...ts) : null;
  const daysSinceLastUpload =
    last !== null ? Math.floor((now - last) / day) : null;

  // Trend: compare last 30 vs prior 30 (days 30–60)
  const prior30 = ts.filter((t) => {
    const age = now - t;
    return age > 30 * day && age <= 60 * day;
  }).length;

  let trend: Cadence["trend"] = "unknown";
  if (last90 >= 3) {
    if (last30 > prior30 * 1.2) trend = "rising";
    else if (last30 < prior30 * 0.8) trend = "falling";
    else trend = "steady";
  }

  return {
    uploadsLast30Days: last30,
    uploadsLast90Days: last90,
    uploadsPerWeek,
    daysSinceLastUpload,
    trend,
  };
}
