import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useCreatorData } from "@/hooks/use-creator-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { compactAge, formatCount, formatDuration, isShort, type YouTubeRecentVideo } from "@/lib/youtube";
import {
  RefreshCw,
  Eye,
  ThumbsUp,
  MessageCircle,
  Calendar,
  Clock,
  Search,
  ExternalLink,
  Globe,
  Users,
  Video as VideoIcon,
  TrendingUp,
  Award,
  Zap,
  Activity,
  PieChart as PieIcon,
  BarChart3,
  Hash,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const FALLBACK_LOGO = "/twh-logo.jpeg";
type SortKey = "newest" | "oldest" | "views" | "likes" | "comments" | "duration";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const PRIMARY = "hsl(217, 91%, 60%)";
const ACCENT = "hsl(186, 100%, 50%)";
const VIOLET = "hsl(280, 65%, 60%)";
const AMBER = "hsl(38, 92%, 60%)";
const EMERALD = "hsl(142, 71%, 45%)";

export default function YouTubePage() {
  const { channel, recentYouTubeVideos, videosNextPageToken, syncFromYouTube, loadMoreYouTubeVideos } = useCreatorData();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [typeFilter, setTypeFilter] = useState<"all" | "long" | "short">("all");

  const filtered = useMemo(() => {
    let list = [...recentYouTubeVideos];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (v) =>
          (v.title ?? "").toLowerCase().includes(q) ||
          (v.description ?? "").toLowerCase().includes(q) ||
          (v.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (typeFilter === "short") list = list.filter((v) => isShort(v));
    if (typeFilter === "long") list = list.filter((v) => !isShort(v));

    switch (sortKey) {
      case "newest": list.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()); break;
      case "oldest": list.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()); break;
      case "views": list.sort((a, b) => b.views - a.views); break;
      case "likes": list.sort((a, b) => b.likes - a.likes); break;
      case "comments": list.sort((a, b) => b.comments - a.comments); break;
      case "duration": list.sort((a, b) => b.durationSeconds - a.durationSeconds); break;
    }
    return list;
  }, [recentYouTubeVideos, query, sortKey, typeFilter]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const { added, hasMore } = await loadMoreYouTubeVideos();
      toast({
        title: added > 0 ? `+${added} videos loaded` : "No new videos",
        description: hasMore ? "More available — keep loading." : "All videos loaded.",
      });
    } catch (err: any) {
      toast({ title: "Load More failed", description: err?.message, variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFromYouTube();
      toast({ title: "Synced", description: "Latest channel + video data fetched." });
    } catch (err: any) {
      toast({
        title: "Sync Failed",
        description: err?.message ?? "Check your channel handle in Channel Setup.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // ---------- Analytics derived from videos ----------
  const stats = useMemo(() => {
    const list = recentYouTubeVideos;
    const aggViews = list.reduce((s, v) => s + v.views, 0);
    const aggLikes = list.reduce((s, v) => s + Math.max(0, v.likes), 0);
    const aggComments = list.reduce((s, v) => s + Math.max(0, v.comments), 0);
    const likedCount = list.filter((v) => v.likes >= 0).length;
    const avgViews = list.length ? Math.round(aggViews / list.length) : 0;
    const avgLikes = likedCount ? Math.round(aggLikes / likedCount) : 0;
    const avgEngagement = aggViews > 0 ? ((aggLikes + aggComments) / aggViews) * 100 : 0;
    const avgDuration = list.length ? Math.round(list.reduce((s, v) => s + v.durationSeconds, 0) / list.length) : 0;

    const shorts = list.filter((v) => isShort(v)).length;
    const longs = list.length - shorts;

    return { aggViews, aggLikes, aggComments, avgViews, avgLikes, avgEngagement, avgDuration, shorts, longs };
  }, [recentYouTubeVideos]);

  // Performance over time — chronological views per upload
  const timeSeries = useMemo(() => {
    const sorted = [...recentYouTubeVideos]
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
      .map((v) => ({
        date: v.publishedAt,
        label: format(parseISO(v.publishedAt), "MMM d"),
        views: v.views,
        likes: Math.max(0, v.likes),
        title: v.title,
      }));
    return sorted.slice(-30);
  }, [recentYouTubeVideos]);

  // Top 5 by views
  const topByViews = useMemo(
    () => [...recentYouTubeVideos].sort((a, b) => b.views - a.views).slice(0, 5),
    [recentYouTubeVideos],
  );

  // Top 5 by engagement
  const topByEngagement = useMemo(() => {
    return [...recentYouTubeVideos]
      .filter((v) => v.views > 100)
      .map((v) => ({
        ...v,
        engagement: ((Math.max(0, v.likes) + Math.max(0, v.comments)) / Math.max(v.views, 1)) * 100,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);
  }, [recentYouTubeVideos]);

  // Monthly upload count (last 12 months)
  const monthlyUploads = useMemo(() => {
    const counts: Record<string, number> = {};
    recentYouTubeVideos.forEach((v) => {
      const d = parseISO(v.publishedAt);
      const key = format(d, "MMM yy");
      counts[key] = (counts[key] ?? 0) + 1;
    });
    const ordered = [...recentYouTubeVideos]
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
      .reduce<{ key: string; count: number }[]>((acc, v) => {
        const key = format(parseISO(v.publishedAt), "MMM yy");
        const last = acc[acc.length - 1];
        if (last && last.key === key) last.count++;
        else acc.push({ key, count: 1 });
        return acc;
      }, []);
    return ordered.slice(-12);
  }, [recentYouTubeVideos]);

  // Tag cloud
  const topTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    recentYouTubeVideos.forEach((v) => {
      (v.tags ?? []).forEach((t) => {
        tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      });
    });
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  }, [recentYouTubeVideos]);

  const channelUrl = channel.channelId
    ? `https://www.youtube.com/channel/${channel.channelId}`
    : channel.channelHandle
      ? `https://www.youtube.com/${channel.channelHandle}`
      : "https://www.youtube.com";

  const pieData = [
    { name: "Long", value: stats.longs, color: PRIMARY },
    { name: "Shorts", value: stats.shorts, color: ACCENT },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Banner header */}
      <section className="relative rounded-2xl overflow-hidden border border-card-border bg-card">
        {channel.bannerUrl ? (
          <div
            className="h-28 sm:h-48 lg:h-60 w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${channel.bannerUrl})` }}
          />
        ) : (
          <div className="h-20 sm:h-32 w-full gradient-primary opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent pointer-events-none" />
        <div className="px-3 sm:px-6 pb-4 sm:pb-6 -mt-10 sm:-mt-16 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 min-w-0">
            <img
              src={channel.logoUrl || FALLBACK_LOGO}
              alt={channel.name}
              className="h-16 w-16 sm:h-28 sm:w-28 rounded-full object-cover ring-4 ring-background shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
              }}
            />
            <div className="flex-1 min-w-0 sm:pb-2">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold leading-tight truncate">
                {channel.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-muted-foreground min-w-0">
                {channel.customUrl && (
                  <span className="font-medium text-foreground/80 truncate max-w-full">
                    {channel.customUrl.startsWith("@") ? channel.customUrl : `@${channel.customUrl}`}
                  </span>
                )}
                {channel.country && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Globe className="h-3 w-3" />
                    {channel.country}
                  </span>
                )}
                {channel.publishedAt && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Calendar className="h-3 w-3" />
                    Joined {format(new Date(channel.publishedAt), "MMM yyyy")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 sm:pb-2 shrink-0">
              <Button variant="outline" size="sm" asChild className="gap-2">
                <a href={channelUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">YouTube</span>
                </a>
              </Button>
              <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2 gradient-primary text-white">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "..." : "Sync"}
              </Button>
            </div>
          </div>

          {channel.description && (
            <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-muted-foreground whitespace-pre-line line-clamp-3 break-words">
              {channel.description}
            </p>
          )}

          {channel.lastSyncedAt && (
            <p className="mt-2 sm:mt-3 text-[11px] sm:text-xs text-muted-foreground">
              Last synced {formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })}
            </p>
          )}
        </div>
      </section>

      {/* Lifetime stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <BigStat icon={Users}     tone="blue"   label="Subscribers" value={formatNumber(channel.subscriberCount)} />
        <BigStat icon={Eye}       tone="cyan"   label="Views"       value={formatNumber(channel.totalViews)} />
        <BigStat icon={VideoIcon} tone="violet" label="Videos"      value={formatNumber(channel.totalVideos)} />
        <BigStat icon={Calendar}  tone="amber"  label="Age"         value={compactAge(channel.channelAge)} />
      </div>

      {recentYouTubeVideos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <VideoIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No videos synced yet.</p>
            <Button onClick={handleSync} disabled={syncing} className="gap-2 gradient-primary text-white">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sync from YouTube
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Recent performance summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SmallStat label={`Views (last ${recentYouTubeVideos.length})`} value={formatNumber(stats.aggViews)} />
            <SmallStat label="Avg per video" value={formatNumber(stats.avgViews)} />
            <SmallStat label="Engagement rate" value={`${stats.avgEngagement.toFixed(2)}%`} />
            <SmallStat label="Avg duration" value={formatDuration(stats.avgDuration)} />
          </div>

          {/* Charts row 1 — Performance over time + Type breakdown */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              icon={Activity}
              title="Views over time"
              subtitle={`Last ${timeSeries.length} uploads, chronological`}
              className="lg:col-span-2"
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timeSeries} margin={{ left: -20, right: 6, top: 10 }}>
                  <defs>
                    <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={formatNumber} tickLine={false} axisLine={false} width={50} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any) => [formatNumber(value as number), "Views"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.title?.slice(0, 60) ?? ""}
                  />
                  <Area type="monotone" dataKey="views" stroke={PRIMARY} strokeWidth={2} fill="url(#vGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard icon={PieIcon} title="Long vs Shorts" subtitle="Content mix">
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 -mt-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIMARY }} />
                  Long ({stats.longs})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} />
                  Shorts ({stats.shorts})
                </span>
              </div>
            </ChartCard>
          </div>

          {/* Charts row 2 — Monthly uploads + Top by views */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 min-w-0">
            <ChartCard icon={BarChart3} title="Upload frequency" subtitle="Videos per month">
              <div className="w-full" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyUploads} margin={{ left: -10, right: 6, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                    <XAxis
                      dataKey="key"
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
                      width={32}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill={ACCENT} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard icon={Award} title="Top performers" subtitle="Most viewed videos">
              <div className="space-y-2.5 sm:space-y-3">
                {topByViews.map((v, i) => (
                  <Link
                    key={v.id}
                    href={`/youtube/${v.id}`}
                    className="flex items-center gap-2.5 sm:gap-3 group min-w-0"
                  >
                    <span className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-[11px] font-bold bg-primary/10 text-primary">
                      {i + 1}
                    </span>
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-10 w-16 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={v.title}>
                        {v.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate tabular-nums">
                        {formatNumber(v.views)} views · {formatCount(v.likes)} likes
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Latest uploads */}
          <ChartCard icon={VideoIcon} title="Latest uploads" subtitle="Most recently published videos">
            <div className="grid gap-2.5 sm:gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...recentYouTubeVideos]
                .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
                .slice(0, 12)
                .map((v) => (
                  <Link
                    key={v.id}
                    href={`/youtube/${v.id}`}
                    className="group rounded-lg sm:rounded-xl border border-border overflow-hidden bg-card/60 hover:border-primary/50 hover:-translate-y-0.5 transition-all flex flex-col"
                  >
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        {formatDuration(v.durationSeconds)}
                      </span>
                      {isShort(v) && (
                        <span className="absolute top-1 left-1 bg-rose-500/95 text-white text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Short
                        </span>
                      )}
                    </div>
                    <div className="p-2 sm:p-2.5 space-y-1.5 flex-1 flex flex-col">
                      <p className="text-[11px] sm:text-xs font-medium leading-snug line-clamp-2 min-h-[2.1rem] sm:min-h-[2.25rem] group-hover:text-primary transition-colors">
                        {v.title}
                      </p>
                      <div className="grid grid-cols-3 gap-1 text-[9px] sm:text-[10px] text-muted-foreground tabular-nums">
                        <span className="flex items-center gap-0.5 truncate">
                          <Eye className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                          {formatNumber(v.views)}
                        </span>
                        <span className="flex items-center gap-0.5 truncate">
                          <ThumbsUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                          {formatCount(v.likes)}
                        </span>
                        <span className="flex items-center gap-0.5 truncate">
                          <MessageCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                          {formatCount(v.comments)}
                        </span>
                      </div>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground/80 truncate mt-auto">
                        {formatDistanceToNow(new Date(v.publishedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </Link>
                ))}
            </div>
          </ChartCard>

          {/* Engagement leaderboard + tag cloud */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 min-w-0">
            <ChartCard icon={Zap} title="Engagement leaders" subtitle="Best (likes + comments) / views ratio">
              <div className="space-y-2.5 sm:space-y-3">
                {topByEngagement.map((v, i) => (
                  <Link
                    key={v.id}
                    href={`/youtube/${v.id}`}
                    className="flex items-center gap-2.5 sm:gap-3 group min-w-0"
                  >
                    <span className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-[11px] font-bold bg-accent/15 text-accent">
                      {i + 1}
                    </span>
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="h-10 w-16 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={v.title}>
                        {v.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {v.engagement.toFixed(2)}% engagement
                      </p>
                    </div>
                  </Link>
                ))}
                {topByEngagement.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Need more data.</p>
                )}
              </div>
            </ChartCard>

            <ChartCard icon={Hash} title="Top tags" subtitle="Most used tags across videos">
              {topTags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {topTags.map(([tag, count]) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] sm:text-xs max-w-full"
                      title={tag}
                    >
                      <span className="truncate max-w-[180px]">{tag}</span>
                      <span className="text-muted-foreground text-[10px] tabular-nums shrink-0">{count}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No tags found.</p>
              )}
            </ChartCard>
          </div>

          {(channel.keywords ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {channel.keywords.slice(0, 12).map((k) => (
                <Badge key={k} variant="secondary" className="font-normal">{k}</Badge>
              ))}
            </div>
          )}

          {/* Filter / search bar */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <VideoIcon className="h-5 w-5 text-primary" />
                All videos
              </h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {recentYouTubeVideos.length}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <FilterPill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</FilterPill>
              <FilterPill active={typeFilter === "long"} onClick={() => setTypeFilter("long")}>Long</FilterPill>
              <FilterPill active={typeFilter === "short"} onClick={() => setTypeFilter("short")}>Shorts</FilterPill>
              <div className="w-px bg-border mx-1 shrink-0" />
              <FilterPill active={sortKey === "newest"} onClick={() => setSortKey("newest")}>Newest</FilterPill>
              <FilterPill active={sortKey === "views"} onClick={() => setSortKey("views")}>Most Viewed</FilterPill>
              <FilterPill active={sortKey === "likes"} onClick={() => setSortKey("likes")}>Most Liked</FilterPill>
              <FilterPill active={sortKey === "comments"} onClick={() => setSortKey("comments")}>Most Commented</FilterPill>
              <FilterPill active={sortKey === "oldest"} onClick={() => setSortKey("oldest")}>Oldest</FilterPill>
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
            {filtered.map((v) => {
              const engagement = v.views > 0 ? ((v.likes + v.comments) / v.views) * 100 : 0;
              return (
                <Link
                  key={v.id}
                  href={`/youtube/${v.id}`}
                  className="group rounded-xl border border-border overflow-hidden bg-card hover:border-primary/60 hover:-translate-y-0.5 transition-all flex flex-col cursor-pointer"
                >
                  <div className="aspect-video bg-muted overflow-hidden relative">
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(v.durationSeconds)}
                    </span>
                    {isShort(v) && (
                      <span className="absolute top-2 left-2 gradient-primary text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Short
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2 flex-1 flex flex-col">
                    <p className="font-semibold leading-snug line-clamp-2 text-sm">{v.title}</p>
                    <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(v.views)}</span>
                      <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{formatCount(v.likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatCount(v.comments)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1 text-[11px] text-muted-foreground border-t border-border/50">
                      <span>{formatDistanceToNow(new Date(v.publishedAt), { addSuffix: true })}</span>
                      <span className="font-medium gradient-text">
                        {engagement.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-2 pt-4">
            {videosNextPageToken ? (
              <Button onClick={handleLoadMore} disabled={loadingMore} variant="outline" size="lg" className="gap-2 min-w-[200px]">
                <RefreshCw className={`h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} />
                {loadingMore ? "Loading…" : "Load More Videos"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">All {recentYouTubeVideos.length} videos loaded</p>
            )}
            <p className="text-xs text-muted-foreground">
              Loaded {recentYouTubeVideos.length} of {channel.totalVideos || "?"} total uploads
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const TONE: Record<string, { bg: string; text: string }> = {
  blue:   { bg: "bg-blue-500/10",   text: "text-blue-400" },
  cyan:   { bg: "bg-cyan-500/10",   text: "text-cyan-400" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-400" },
  amber:  { bg: "bg-amber-500/10",  text: "text-amber-400" },
};

function BigStat({ icon: Icon, tone, label, value }: { icon: any; tone: string; label: string; value: string }) {
  const t = TONE[tone];
  return (
    <div className="card-premium p-3 sm:p-5 hover:border-primary/40 transition-colors min-w-0">
      <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate" title={label}>
            {label}
          </p>
          <p
            className="mt-1 sm:mt-1.5 text-lg sm:text-2xl font-bold tracking-tight tabular-nums truncate"
            title={value}
          >
            {value}
          </p>
        </div>
        <div className={`shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 min-w-0">
      <p className="text-xs text-muted-foreground font-medium truncate" title={label}>
        {label}
      </p>
      <p className="mt-1 text-base sm:text-lg font-bold tabular-nums truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className = "",
}: {
  icon: any;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-premium p-3 sm:p-5 min-w-0 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 mb-3 sm:mb-4 min-w-0">
        <div className="shrink-0 h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" title={title}>{title}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "gradient-primary text-white border-transparent"
          : "bg-background text-foreground border-border hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
