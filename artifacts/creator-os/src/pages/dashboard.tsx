import { useMemo, useState } from "react";
import { useCreatorData } from "@/hooks/use-creator-data";
import { Link } from "wouter";
import {
  Video,
  Target,
  Lightbulb,
  Wand2,
  Users,
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Eye,
  ThumbsUp,
  MessageCircle,
  Clock,
  Activity,
  Award,
  PlayCircle,
  Flame,
  Zap,
  RefreshCw,
  Film,
  Smartphone,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { compactAge, formatCount, formatDuration, isShort, type YouTubeRecentVideo } from "@/lib/youtube";
import { useToast } from "@/hooks/use-toast";

type Period = 90 | 365 | 0; // 0 = All time

const PERIODS: { label: string; value: Period }[] = [
  { label: "Last 90 days", value: 90 },
  { label: "Last 365 days", value: 365 },
  { label: "All time", value: 0 },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1000) return formatNumber(Math.round(hours)) + " hr";
  if (hours >= 10) return hours.toFixed(0) + " hr";
  if (hours >= 1) return hours.toFixed(1) + " hr";
  const minutes = seconds / 60;
  return Math.max(0, minutes).toFixed(0) + " min";
}

const PRIMARY = "hsl(217, 91%, 60%)";
const ACCENT = "hsl(186, 100%, 50%)";
const VIOLET = "hsl(280, 65%, 60%)";
const AMBER = "hsl(38, 92%, 60%)";
const EMERALD = "hsl(142, 71%, 45%)";
const ROSE = "hsl(346, 87%, 60%)";

type Tone = "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose";
const TONE_MAP: Record<Tone, { color: string; bg: string; text: string }> = {
  blue:    { color: PRIMARY, bg: "bg-blue-500/10",    text: "text-blue-400" },
  cyan:    { color: ACCENT,  bg: "bg-cyan-500/10",    text: "text-cyan-400" },
  violet:  { color: VIOLET,  bg: "bg-violet-500/10",  text: "text-violet-400" },
  amber:   { color: AMBER,   bg: "bg-amber-500/10",   text: "text-amber-400" },
  emerald: { color: EMERALD, bg: "bg-emerald-500/10", text: "text-emerald-400" },
  rose:    { color: ROSE,    bg: "bg-rose-500/10",    text: "text-rose-400" },
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
}) {
  const t = TONE_MAP[tone];
  return (
    <div className="card-premium p-4 sm:p-5 hover:border-primary/40 transition-colors min-w-0">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate" title={label}>
            {label}
          </p>
          <p
            className="mt-1.5 text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate tabular-nums"
            title={value}
          >
            {value}
          </p>
        </div>
        <div className={`shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
      {hint && (
        <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2 leading-snug" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { channel, videos, goals, ideas, recentYouTubeVideos, syncFromYouTube } = useCreatorData();
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>(365);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFromYouTube();
      toast({ title: "Synced", description: "Latest YouTube data fetched." });
    } catch (err: any) {
      toast({
        title: "Sync failed",
        description: err?.message ?? "Check channel handle in Channel Setup.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Filter videos by selected period (publishedAt within window)
  const periodVideos = useMemo(() => {
    if (period === 0) return recentYouTubeVideos;
    const start = subDays(new Date(), period).getTime();
    return recentYouTubeVideos.filter((v) => new Date(v.publishedAt).getTime() >= start);
  }, [recentYouTubeVideos, period]);

  // Period stats
  const stats = useMemo(() => {
    const list = periodVideos;
    const longs = list.filter((v) => !isShort(v));
    const shorts = list.filter((v) => isShort(v));
    const views = list.reduce((s, v) => s + v.views, 0);
    const likes = list.reduce((s, v) => s + Math.max(0, v.likes), 0);
    const comments = list.reduce((s, v) => s + Math.max(0, v.comments), 0);
    const watchSeconds = list.reduce((s, v) => s + v.views * v.durationSeconds, 0);
    const avgViews = list.length ? Math.round(views / list.length) : 0;
    const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
    return {
      total: list.length,
      longs: longs.length,
      shorts: shorts.length,
      longViews: longs.reduce((s, v) => s + v.views, 0),
      shortViews: shorts.reduce((s, v) => s + v.views, 0),
      views,
      likes,
      comments,
      watchSeconds,
      avgViews,
      engagement,
    };
  }, [periodVideos]);

  // Uploads per month (chronological) — bar chart inside window
  const uploadsByMonth = useMemo(() => {
    const map = new Map<string, { key: string; date: Date; videos: number; views: number; longs: number; shorts: number }>();
    [...periodVideos]
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
      .forEach((v) => {
        const d = parseISO(v.publishedAt);
        const key = format(d, "yyyy-MM");
        const slot = map.get(key) ?? {
          key,
          date: new Date(d.getFullYear(), d.getMonth(), 1),
          videos: 0,
          views: 0,
          longs: 0,
          shorts: 0,
        };
        slot.videos += 1;
        slot.views += v.views;
        if (isShort(v)) slot.shorts += 1;
        else slot.longs += 1;
        map.set(key, slot);
      });
    return Array.from(map.values()).map((m) => ({
      ...m,
      label: format(m.date, "MMM yy"),
    }));
  }, [periodVideos]);

  const topByViews = useMemo(
    () => [...periodVideos].sort((a, b) => b.views - a.views).slice(0, 5),
    [periodVideos],
  );

  const recentVideos = useMemo(() => {
    if (recentYouTubeVideos.length === 0) return [];
    return [...recentYouTubeVideos]
      .sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      .slice(0, 5);
  }, [recentYouTubeVideos]);

  const [recentIdx, setRecentIdx] = useState(0);
  const safeRecentIdx = recentVideos.length === 0 ? 0 : Math.min(recentIdx, recentVideos.length - 1);
  const latestVideo = recentVideos[safeRecentIdx] ?? null;
  const goPrevRecent = () =>
    setRecentIdx((i) => (recentVideos.length === 0 ? 0 : (i - 1 + recentVideos.length) % recentVideos.length));
  const goNextRecent = () =>
    setRecentIdx((i) => (recentVideos.length === 0 ? 0 : (i + 1) % recentVideos.length));

  // Compute a goal's *live* current value from the connected channel +
  // tracked videos so the widget stays in sync after a channel switch
  // (instead of showing a stale stored `currentValue`).
  const publishedTracked = videos.filter((v) => v.status === "Published").length;
  const liveGoalValue = (g: typeof goals[number]): number => {
    if (g.type === "subscribers") return channel.subscriberCount || 0;
    if (g.type === "views") return channel.totalViews || 0;
    if (g.type === "videos")
      return videos.filter((v) => v.status === "Published").length;
    return g.currentValue;
  };
  // Keep every goal visible in the widget — even if the freshly-connected
  // channel already exceeds the target, we just want the bar to fill to 100%
  // instead of the goal vanishing from the list.
  const activeGoals = goals;

  const hasYouTubeData = recentYouTubeVideos.length > 0;
  const periodLabel = period === 0 ? "all time" : `last ${period} days`;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-card-border">
        <div className="absolute inset-0 gradient-primary opacity-[0.08]" />
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative p-4 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-w-0">
          <div className="min-w-0 w-full md:w-auto md:flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" /> Mission Control
            </div>
            <h1 className="mt-3 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight break-words leading-tight">
              Welcome back,{" "}
              <span className="gradient-text">{channel.name}</span>
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground break-words">
              {hasYouTubeData
                ? `${formatNumber(channel.subscriberCount)} subscribers • ${recentYouTubeVideos.length} videos synced`
                : "Sync your YouTube channel to see live performance."}
              {channel.lastSyncedAt && (
                <> • Last synced {formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm font-semibold hover:bg-card transition-colors disabled:opacity-50"
              data-testid="button-sync"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync"}
            </button>
            <Link
              href="/ai"
              className="inline-flex items-center gap-2 rounded-xl gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
            >
              <Wand2 className="h-4 w-4" />
              AI Studio
            </Link>
          </div>
        </div>
      </section>

      {/* Channel + Goals */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 min-w-0">
        <div className="card-premium p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Channel lifetime
            </h3>
            <Link href="/channel" className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
              Setup <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 min-w-0">
            <BigKpi label="Subscribers" value={formatNumber(channel.subscriberCount)} />
            <BigKpi label="Views" value={formatNumber(channel.totalViews)} />
            <BigKpi label="Videos" value={formatNumber(channel.totalVideos)} />
            <BigKpi label="Age" value={compactAge(channel.channelAge)} />
          </div>
        </div>

        <div className="card-premium p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-400" />
              Active goals
            </h3>
            <Link href="/goals" className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
              All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {activeGoals.length > 0 ? (
            <div className="space-y-3">
              {activeGoals.slice(0, 3).map((g) => {
                const live = liveGoalValue(g);
                const pct = Math.min(100, Math.round((live / Math.max(1, g.targetValue)) * 100));
                return (
                  <div key={g.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium truncate">{g.title}</p>
                      <p className="text-xs font-bold gradient-text shrink-0">{pct}%</p>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full gradient-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {live.toLocaleString()} / {g.targetValue.toLocaleString()} {g.type}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">No active goals.</p>
              <Link
                href="/goals"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Set one <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <QuickAction href="/videos" icon={Video} label="Tracker" hint={`${publishedTracked} published`} tone="blue" />
        <QuickAction href="/ideas" icon={Lightbulb} label="Idea Bank" hint={`${ideas.length} ideas`} tone="amber" />
        <QuickAction href="/scripts" icon={Wand2} label="Scripts" hint="Write & refine" tone="violet" />
        <QuickAction href="/comments" icon={MessageCircle} label="Comments" hint="Reply faster" tone="rose" />
      </div>

      {hasYouTubeData ? (
        <>
          {/* Period selector */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Channel performance
              </h2>
              <p className="text-xs text-muted-foreground">
                Stats for videos uploaded in {periodLabel} • computed from {stats.total} video{stats.total === 1 ? "" : "s"}
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    period === p.value
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`button-period-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Honest disclosure */}
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
            <span>
              YouTube's public Data API only returns lifetime stats per video, so all numbers below are{" "}
              <strong className="text-foreground/90">cumulative views/likes earned by videos uploaded in this window</strong>.
              True per-day analytics (impressions, CTR, retention) need YouTube Studio OAuth.
            </span>
          </div>

          {/* Top stat row — Uploads breakdown */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Videos uploaded"
              value={String(stats.total)}
              hint={periodLabel}
              icon={Video}
              tone="blue"
            />
            <StatCard
              label="Long videos"
              value={String(stats.longs)}
              hint={`${formatNumber(stats.longViews)} views combined`}
              icon={Film}
              tone="violet"
            />
            <StatCard
              label="Shorts"
              value={String(stats.shorts)}
              hint={`${formatNumber(stats.shortViews)} views combined`}
              icon={Smartphone}
              tone="rose"
            />
            <StatCard
              label="Avg views / video"
              value={formatNumber(stats.avgViews)}
              hint={`Across ${stats.total || 0} uploads`}
              icon={TrendingUp}
              tone="amber"
            />
          </div>

          {/* Engagement row */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total views"
              value={formatNumber(stats.views)}
              hint="Earned by these videos"
              icon={Eye}
              tone="cyan"
            />
            <StatCard
              label="Watch time"
              value={formatHours(stats.watchSeconds)}
              hint="Estimated (views × duration)"
              icon={Clock}
              tone="blue"
            />
            <StatCard
              label="Likes + Comments"
              value={formatNumber(stats.likes + stats.comments)}
              hint={`${formatCount(stats.likes)} likes • ${formatCount(stats.comments)} comments`}
              icon={ThumbsUp}
              tone="emerald"
            />
            <StatCard
              label="Engagement rate"
              value={`${stats.engagement.toFixed(2)}%`}
              hint="(likes + comments) / views"
              icon={Zap}
              tone="amber"
            />
          </div>

          {/* Uploads by month + Latest video */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card-premium p-5 sm:p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Uploads by month
                  </h3>
                  <p className="text-xs text-muted-foreground">Videos published per month in window</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold gradient-text">{stats.total}</p>
                </div>
              </div>
              {uploadsByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={uploadsByMonth} margin={{ left: -20, right: 6, top: 10 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                      allowDecimals={false}
                    />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: any, _name: any, item: any) => {
                        const p = item?.payload;
                        return [
                          `${value} (${p?.longs ?? 0} long, ${p?.shorts ?? 0} shorts) • ${formatNumber(p?.views ?? 0)} views`,
                          "Uploads",
                        ];
                      }}
                    />
                    <Bar dataKey="videos" radius={[6, 6, 0, 0]}>
                      {uploadsByMonth.map((_, i) => (
                        <Cell key={i} fill={PRIMARY} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center text-center">
                  <Film className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No uploads in {periodLabel}</p>
                  <p className="text-xs text-muted-foreground">Try a wider window above.</p>
                </div>
              )}
            </div>

            {latestVideo && (
              <div className="card-premium p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h3 className="text-base font-semibold flex items-center gap-2 min-w-0">
                    <Flame className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="truncate">Recent uploads</span>
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={goPrevRecent}
                      disabled={recentVideos.length <= 1}
                      aria-label="Previous video"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border hover:border-primary/50 hover:bg-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] tabular-nums text-muted-foreground font-medium px-1 min-w-[28px] text-center">
                      {safeRecentIdx + 1}/{recentVideos.length}
                    </span>
                    <button
                      type="button"
                      onClick={goNextRecent}
                      disabled={recentVideos.length <= 1}
                      aria-label="Next video"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border hover:border-primary/50 hover:bg-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  {formatDistanceToNow(new Date(latestVideo.publishedAt), { addSuffix: true })}
                </div>
                <Link
                  href={`/youtube/${latestVideo.id}`}
                  className="block rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <img
                      src={latestVideo.thumbnailUrl}
                      alt={latestVideo.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                      {formatDuration(latestVideo.durationSeconds)}
                    </span>
                  </div>
                </Link>
                <p className="mt-3 text-sm font-medium leading-snug line-clamp-2">{latestVideo.title}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="Views" value={formatNumber(latestVideo.views)} icon={Eye} />
                  <MiniStat label="Likes" value={formatCount(latestVideo.likes)} icon={ThumbsUp} />
                  <MiniStat label="Comments" value={formatCount(latestVideo.comments)} icon={MessageCircle} />
                </div>
                {recentVideos.length > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    {recentVideos.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRecentIdx(i)}
                        aria-label={`Go to video ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${
                          i === safeRecentIdx
                            ? "w-5 bg-primary"
                            : "w-1.5 bg-border hover:bg-primary/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top performers list */}
          {topByViews.length > 0 && (
            <div className="card-premium p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-400" />
                  Top videos in {periodLabel}
                </h3>
                <Link href="/youtube" className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                  See all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {topByViews.map((v, i) => (
                  <Link
                    key={v.id}
                    href={`/youtube/${v.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5 hover:border-primary/50 hover:bg-accent/40 transition-colors group"
                  >
                    <span className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-[11px] font-bold bg-primary/10 text-primary">
                      {i + 1}
                    </span>
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-12 w-20 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{v.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {formatNumber(v.views)}
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {formatCount(v.likes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {formatCount(v.comments)}
                        </span>
                        <span className="text-muted-foreground/70">
                          {isShort(v) ? "Short" : "Long"} • {formatDuration(v.durationSeconds)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card-premium p-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <PlayCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium">No YouTube data yet</p>
            <p className="text-sm text-muted-foreground">Sync your channel to unlock live analytics.</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync now
          </button>
        </div>
      )}

    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-center">
      <Icon className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
      <p className="text-sm font-bold leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function BigKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 sm:p-3 min-w-0">
      <p
        className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate"
        title={label}
      >
        {label}
      </p>
      <p className="text-sm sm:text-base lg:text-lg font-bold mt-0.5 sm:mt-1 truncate tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  tone: Tone;
}) {
  const t = TONE_MAP[tone];
  return (
    <Link
      href={href}
      className="card-premium p-4 hover:border-primary/40 transition-colors flex items-center gap-3 group"
    >
      <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{hint}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </Link>
  );
}
