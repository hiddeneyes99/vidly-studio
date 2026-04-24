import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, CREATOR_TABLE, CREATOR_ROW_ID } from "@/lib/supabase";
import { fetchChannel, fetchVideosPage, type YouTubeRecentVideo } from "@/lib/youtube";
import type { AudiencePersona, PerformancePrediction } from "@/lib/gemini";

export type ChannelInfo = {
  // User-managed identity
  name: string;
  niche: string;
  description: string;
  bestPostingTimes: string[];

  // YouTube link
  channelHandle: string;
  channelId: string;
  customUrl: string;
  country: string;
  keywords: string[];
  logoUrl: string;
  bannerUrl: string;

  // Auto-synced stats
  subscriberCount: number;
  totalVideos: number;
  totalViews: number;
  channelAge: string;
  publishedAt: string;
  uploadsPlaylistId: string;
  lastSyncedAt: string;

  // Top videos kept for backwards compat (now auto-populated)
  topVideos: { title: string; views: number; ctr: number; link: string }[];

  // Smart insights (auto-detected / AI-generated)
  detectedNiche?: string;
  detectedLanguage?: string;
  audiencePersona?: AudiencePersona;
  personaUpdatedAt?: string;
};

export type Goal = {
  id: string;
  title: string;
  type: "subscribers" | "views" | "videos";
  targetValue: number;
  currentValue: number;
  deadline: string;
  createdAt: string;
};

export type VideoStatus = "Idea" | "Scripted" | "Recorded" | "Edited" | "Published";
export type VideoType = "Long" | "Short" | "Reel";

export type Video = {
  id: string;
  title: string;
  type: VideoType;
  status: VideoStatus;
  thumbnailUrl: string;
  notes: string;
  publishDate: string;
  tags: string[];
  scriptId?: string;
  aiPrediction?: PerformancePrediction & { predictedAt: string };
};

export type IdeaDifficulty = "Easy" | "Medium" | "Hard";

export type IdeaSourceMode = "niche" | "trending" | "mixed";

export type Idea = {
  id: string;
  title: string;
  hook: string;
  tags: string[];
  difficulty: IdeaDifficulty;
  type: VideoType;
  createdAt: string;
  thumbnailUrl?: string;
  sourceMode?: IdeaSourceMode;
  pinned?: boolean;
};

export type SchedulePlatform =
  | "youtube"
  | "instagram"
  | "twitter"
  | "community";

export type Schedule = {
  id: string;
  videoId: string;
  date: string;
  notes: string;
  platforms?: SchedulePlatform[];
  reminderMinutes?: number;
  notifiedAt?: string;
  parentId?: string; // links cross-post follow-ups to the primary item
  stagedReminders?: boolean; // production checklist alerts (1d / 1h / 0m)
  firedStages?: number[]; // staged reminder minutes already fired
};

export type Script = {
  id: string;
  videoId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsEntry = {
  id: string;
  date: string;
  subscribers: number;
  views: number;
  videosPublished: number;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type BrandDefaults = {
  socialLinks: {
    youtube: string;
    instagram: string;
    telegram: string;
    twitter?: string;
    facebook?: string;
  };
  businessEmail: string;
  businessTagline: string;
  signOffLine: string;
};

export type CreatorState = {
  channel: ChannelInfo;
  videos: Video[];
  goals: Goal[];
  ideas: Idea[];
  scripts: Script[];
  schedule: Schedule[];
  analytics: AnalyticsEntry[];
  recentYouTubeVideos: YouTubeRecentVideo[];
  videosNextPageToken: string;
  chatConversations: ChatConversation[];
  chatMessages: ChatMessage[];
  brandDefaults: BrandDefaults;
};

const defaultChannelInfo: ChannelInfo = {
  name: "Technical White Hat",
  niche: "Hacking & Cybersecurity",
  description: "Hindi-language hacking/cybersecurity channel making a comeback.",
  bestPostingTimes: ["18:00", "20:00"],
  channelHandle: "@TechnicalWhiteHat",
  channelId: "",
  customUrl: "",
  country: "",
  keywords: [],
  logoUrl: "",
  bannerUrl: "",
  subscriberCount: 0,
  totalVideos: 0,
  totalViews: 0,
  channelAge: "",
  publishedAt: "",
  uploadsPlaylistId: "",
  lastSyncedAt: "",
  topVideos: [],
};

const defaultGoals: Goal[] = [
  {
    id: "g1",
    title: "Reach 20K Subscribers",
    type: "subscribers",
    targetValue: 20000,
    currentValue: 14061,
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "g2",
    title: "Publish 10 Comeback Videos",
    type: "videos",
    targetValue: 10,
    currentValue: 3,
    deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

const defaultVideos: Video[] = [];
const defaultIdeas: Idea[] = [];

const defaultBrandDefaults: BrandDefaults = {
  socialLinks: {
    youtube: "https://youtube.com/@technicalwhitehat",
    instagram: "https://www.instagram.com/technicalwhitehat",
    telegram: "https://t.me/technicalwhitehat",
  },
  businessEmail: "mrwhitehath@gmail.com",
  businessTagline: "For business & promotions contact us",
  signOffLine: "Keep learning, stay ethical. — Technical White Hat",
};

const defaultState: CreatorState = {
  channel: defaultChannelInfo,
  videos: defaultVideos,
  goals: defaultGoals,
  ideas: defaultIdeas,
  scripts: [],
  schedule: [],
  analytics: [],
  recentYouTubeVideos: [],
  videosNextPageToken: "",
  chatConversations: [],
  chatMessages: [],
  brandDefaults: defaultBrandDefaults,
};

// ---- Module-level cache so all hook instances share the same state ----
let cachedState: CreatorState | null = null;
let loadPromise: Promise<CreatorState> | null = null;
const subscribers = new Set<(s: CreatorState) => void>();

function notify(state: CreatorState) {
  cachedState = state;
  subscribers.forEach((cb) => cb(state));
}

async function loadFromSupabase(): Promise<CreatorState> {
  const { data, error } = await supabase
    .from(CREATOR_TABLE)
    .select("data")
    .eq("id", CREATOR_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("Supabase load error:", error);
    return defaultState;
  }

  if (!data) {
    const { error: insertErr } = await supabase
      .from(CREATOR_TABLE)
      .insert({ id: CREATOR_ROW_ID, data: defaultState });
    if (insertErr) console.error("Supabase seed error:", insertErr);
    return defaultState;
  }

  // Deep-merge channel so new fields get defaults if missing in old saves
  const stored = data.data as Partial<CreatorState>;
  return {
    ...defaultState,
    ...stored,
    channel: { ...defaultChannelInfo, ...(stored.channel ?? {}) },
    brandDefaults: {
      ...defaultBrandDefaults,
      ...(stored.brandDefaults ?? {}),
      socialLinks: {
        ...defaultBrandDefaults.socialLinks,
        ...(stored.brandDefaults?.socialLinks ?? {}),
      },
    },
    chatConversations: stored.chatConversations ?? [],
    chatMessages: stored.chatMessages ?? [],
    recentYouTubeVideos: stored.recentYouTubeVideos ?? [],
    videosNextPageToken: stored.videosNextPageToken ?? "",
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
async function scheduleSave(state: CreatorState) {
  await ensureLoaded();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { error } = await supabase
      .from(CREATOR_TABLE)
      .upsert({ id: CREATOR_ROW_ID, data: state, updated_at: new Date().toISOString() });
    if (error) console.error("Supabase save error:", error);
    else console.debug("[Supabase] saved");
  }, 400);
}

function ensureLoaded(): Promise<CreatorState> {
  if (cachedState) return Promise.resolve(cachedState);
  if (!loadPromise) {
    loadPromise = loadFromSupabase().then((s) => {
      cachedState = s;
      notify(s);
      // Kick off auto-sync if needed (don't await — runs in background)
      maybeSyncFromYouTube(s).catch((err) =>
        console.warn("[YouTube] background sync failed:", err),
      );
      return s;
    });
  }
  return loadPromise;
}

// ---------- YouTube sync ----------

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let syncInFlight: Promise<void> | null = null;

async function maybeSyncFromYouTube(state: CreatorState) {
  const last = state.channel.lastSyncedAt ? new Date(state.channel.lastSyncedAt).getTime() : 0;
  const handle = state.channel.channelHandle?.trim();
  if (!handle) return;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  await syncFromYouTube(handle);
}

export async function loadMoreYouTubeVideos(): Promise<{ added: number; hasMore: boolean }> {
  const current = cachedState ?? (await ensureLoaded());
  const playlistId = current.channel.uploadsPlaylistId;
  const token = current.videosNextPageToken;
  if (!playlistId || !token) return { added: 0, hasMore: false };

  const page = await fetchVideosPage(playlistId, token);
  // De-duplicate against existing
  const existingIds = new Set(current.recentYouTubeVideos.map((v) => v.id));
  const fresh = page.videos.filter((v) => !existingIds.has(v.id));

  const next: CreatorState = {
    ...current,
    recentYouTubeVideos: [...current.recentYouTubeVideos, ...fresh],
    videosNextPageToken: page.nextPageToken,
  };
  notify(next);
  await scheduleSave(next);
  return { added: fresh.length, hasMore: !!page.nextPageToken };
}

export async function syncFromYouTube(handleOverride?: string): Promise<void> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      const current = cachedState ?? (await ensureLoaded());
      const handle = (handleOverride ?? current.channel.channelHandle).trim();
      if (!handle) throw new Error("No channel handle set.");

      const data = await fetchChannel(handle);
      const page = data.uploadsPlaylistId
        ? await fetchVideosPage(data.uploadsPlaylistId)
        : { videos: [], nextPageToken: "" };
      const recent = page.videos;

      // If the fetched channel is a *different* channel from what we had saved,
      // reset identity so the UI shows the new channel everywhere — not the
      // stale name/description/persona from the previous one.
      const isDifferentChannel =
        !!current.channel.channelId &&
        !!data.channelId &&
        current.channel.channelId !== data.channelId;

      const next: CreatorState = {
        ...current,
        channel: {
          ...current.channel,
          // Always pull the freshly-fetched name/description if either:
          //  (a) we had nothing saved before, or
          //  (b) the user pointed us at a different channel.
          name:
            isDifferentChannel || !current.channel.name
              ? data.title
              : current.channel.name,
          description:
            isDifferentChannel || !current.channel.description
              ? data.description
              : current.channel.description,
          // Reset detected/persona fields when switching channels — they were
          // computed against the previous one.
          ...(isDifferentChannel
            ? {
                detectedNiche: "",
                detectedLanguage: "",
                audiencePersona: undefined,
                personaUpdatedAt: undefined,
                niche: data.title ? current.channel.niche : current.channel.niche,
              }
            : null),
          channelHandle: handle.startsWith("@") ? handle : (data.handle || handle),
          channelId: data.channelId,
          customUrl: data.customUrl,
          country: data.country,
          keywords: data.keywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          subscriberCount: data.subscriberCount,
          totalVideos: data.totalVideos,
          totalViews: data.totalViews,
          channelAge: data.channelAge,
          publishedAt: data.publishedAt,
          uploadsPlaylistId: data.uploadsPlaylistId,
          lastSyncedAt: new Date().toISOString(),
          topVideos: [...recent]
            .sort((a, b) => b.views - a.views)
            .slice(0, 5)
            .map((v) => ({ title: v.title, views: v.views, ctr: 0, link: v.url })),
        },
        recentYouTubeVideos: recent,
        videosNextPageToken: page.nextPageToken,
        // When switching to a different channel, the saved `currentValue` on
        // each goal still references the previous channel's metrics. Reset it
        // so live channel data becomes the single source of truth.
        goals: isDifferentChannel
          ? current.goals.map((g) => ({ ...g, currentValue: 0 }))
          : current.goals,
      };

      notify(next);
      await scheduleSave(next);
      console.debug("[YouTube] sync complete:", data.title, data.subscriberCount, "subs");
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

type Setter<K extends keyof CreatorState> =
  (val: CreatorState[K] | ((prev: CreatorState[K]) => CreatorState[K])) => void;

export function useCreatorData() {
  const [state, setState] = useState<CreatorState>(cachedState ?? defaultState);
  const [loaded, setLoaded] = useState<boolean>(cachedState !== null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = (s: CreatorState) => {
      if (mounted.current) {
        setState(s);
        setLoaded(true);
      }
    };
    subscribers.add(cb);
    ensureLoaded().then((s) => {
      if (mounted.current) {
        setState(s);
        setLoaded(true);
      }
    });
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const update = useCallback(<K extends keyof CreatorState>(key: K, value: CreatorState[K] | ((prev: CreatorState[K]) => CreatorState[K])) => {
    const prev = cachedState ?? defaultState;
    const newValue = typeof value === "function" ? (value as (p: CreatorState[K]) => CreatorState[K])(prev[key]) : value;
    const next = { ...prev, [key]: newValue };
    notify(next);
    scheduleSave(next);
  }, []);

  const setChannel: Setter<"channel"> = useCallback((v) => update("channel", v), [update]);
  const setVideos: Setter<"videos"> = useCallback((v) => update("videos", v), [update]);
  const setGoals: Setter<"goals"> = useCallback((v) => update("goals", v), [update]);
  const setIdeas: Setter<"ideas"> = useCallback((v) => update("ideas", v), [update]);
  const setScripts: Setter<"scripts"> = useCallback((v) => update("scripts", v), [update]);
  const setSchedule: Setter<"schedule"> = useCallback((v) => update("schedule", v), [update]);
  const setAnalytics: Setter<"analytics"> = useCallback((v) => update("analytics", v), [update]);
  const setChatConversations: Setter<"chatConversations"> = useCallback(
    (v) => update("chatConversations", v),
    [update],
  );
  const setChatMessages: Setter<"chatMessages"> = useCallback(
    (v) => update("chatMessages", v),
    [update],
  );
  const setBrandDefaults: Setter<"brandDefaults"> = useCallback(
    (v) => update("brandDefaults", v),
    [update],
  );

  return {
    loaded,
    channel: state.channel,
    videos: state.videos,
    goals: state.goals,
    ideas: state.ideas,
    scripts: state.scripts,
    schedule: state.schedule,
    analytics: state.analytics,
    recentYouTubeVideos: state.recentYouTubeVideos,
    videosNextPageToken: state.videosNextPageToken,
    chatConversations: state.chatConversations,
    chatMessages: state.chatMessages,
    brandDefaults: state.brandDefaults,
    setChannel,
    setVideos,
    setGoals,
    setIdeas,
    setScripts,
    setSchedule,
    setAnalytics,
    setChatConversations,
    setChatMessages,
    setBrandDefaults,
    syncFromYouTube,
    loadMoreYouTubeVideos,
  };
}

export async function exportCreatorData(): Promise<CreatorState> {
  return ensureLoaded();
}

export async function importCreatorData(state: CreatorState): Promise<void> {
  notify(state);
  const { error } = await supabase
    .from(CREATOR_TABLE)
    .upsert({ id: CREATOR_ROW_ID, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function resetCreatorData(): Promise<void> {
  await importCreatorData(defaultState);
}
