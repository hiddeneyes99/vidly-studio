import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useCreatorData } from "@/hooks/use-creator-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchVideoById,
  formatCount,
  formatDuration,
  isShort,
  type YouTubeRecentVideo,
} from "@/lib/youtube";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  ThumbsUp,
  MessageCircle,
  Clock,
  Calendar,
  TrendingUp,
  Hash,
  RefreshCw,
  Award,
  Activity,
  Zap,
  Users,
  BarChart3,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

const PRIMARY = "hsl(217, 91%, 60%)";
const ACCENT = "hsl(186, 100%, 50%)";
const VIOLET = "hsl(280, 65%, 60%)";
const EMERALD = "hsl(142, 71%, 45%)";
const AMBER = "hsl(38, 92%, 60%)";
const ROSE = "hsl(346, 87%, 60%)";

export default function VideoDetailPage() {
  const [, params] = useRoute<{ videoId: string }>("/youtube/:videoId");
  const videoId = params?.videoId ?? "";
  const { recentYouTubeVideos, channel } = useCreatorData();
  const { toast } = useToast();

  const cached = useMemo(
    () => recentYouTubeVideos.find((v) => v.id === videoId) ?? null,
    [recentYouTubeVideos, videoId],
  );

  const [video, setVideo] = useState<YouTubeRecentVideo | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setVideo(cached);
    if (cached) return;
    setLoading(true);
    fetchVideoById(videoId)
      .then((v) => setVideo(v))
      .catch((err) =>
        toast({ title: "Failed to load video", description: err?.message, variant: "destructive" }),
      )
      .finally(() => setLoading(false));
  }, [videoId, cached, toast]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchVideoById(videoId);
      if (fresh) setVideo(fresh);
      toast({ title: "Refreshed", description: "Latest stats fetched." });
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err?.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  // Channel-wide peers for comparison
  const peers = useMemo(() => {
    if (!video) return null;
    const sameType = recentYouTubeVideos.filter(
      (v) => v.id !== video.id && isShort(v) === isShort(video),
    );
    if (sameType.length === 0) return null;
    const avgViews = Math.round(
      sameType.reduce((s, v) => s + v.views, 0) / sameType.length,
    );
    const liked = sameType.filter((v) => v.likes >= 0);
    const avgLikes = liked.length
      ? Math.round(liked.reduce((s, v) => s + v.likes, 0) / liked.length)
      : 0;
    const commented = sameType.filter((v) => v.comments >= 0);
    const avgComments = commented.length
      ? Math.round(commented.reduce((s, v) => s + v.comments, 0) / commented.length)
      : 0;
    const totalLikes = sameType.reduce((s, v) => s + Math.max(0, v.likes), 0);
    const totalComments = sameType.reduce((s, v) => s + Math.max(0, v.comments), 0);
    const totalViews = sameType.reduce((s, v) => s + v.views, 0);
    const avgEngagement =
      totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;
    // Rank within same-type list
    const sortedByViews = [...sameType, video].sort((a, b) => b.views - a.views);
    const rank = sortedByViews.findIndex((v) => v.id === video.id) + 1;
    return { avgViews, avgLikes, avgComments, avgEngagement, count: sameType.length, rank };
  }, [recentYouTubeVideos, video]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-muted-foreground">
        Loading video…
      </div>
    );
  }

  if (!video) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center space-y-4">
        <p className="text-muted-foreground">Video not found.</p>
        <Link href="/youtube">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to channel
          </Button>
        </Link>
      </div>
    );
  }

  const safeLikes = Math.max(0, video.likes);
  const safeComments = Math.max(0, video.comments);
  const engagement = video.views > 0 ? ((safeLikes + safeComments) / video.views) * 100 : 0;
  const likeRate = video.views > 0 ? (safeLikes / video.views) * 100 : 0;
  const commentRate = video.views > 0 ? (safeComments / video.views) * 100 : 0;
  const subsAtChannel = channel.subscriberCount || 0;
  const reachVsSubs = subsAtChannel > 0 ? (video.views / subsAtChannel) * 100 : 0;
  const ageDays = Math.max(
    1,
    Math.floor((Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24)),
  );
  const viewsPerDay = Math.round(video.views / ageDays);
  const likesPerDay = video.likes >= 0 ? Math.round(safeLikes / ageDays) : -1;
  const commentsPerDay = video.comments >= 0 ? Math.round(safeComments / ageDays) : -1;
  const watchSeconds = video.views * video.durationSeconds;
  const watchHours = watchSeconds / 3600;
  const isShortVideo = isShort(video);

  // Comparison data for chart
  const compareData = peers
    ? [
        { metric: "Views", This: video.views, Avg: peers.avgViews },
        { metric: "Likes", This: safeLikes, Avg: peers.avgLikes },
        { metric: "Comments", This: safeComments, Avg: peers.avgComments },
      ]
    : [];

  // Engagement breakdown pie
  const engagementBreakdown = [
    { name: "Likes", value: safeLikes, color: PRIMARY },
    { name: "Comments", value: safeComments, color: ACCENT },
  ];
  const hasEngagementBreakdown = safeLikes + safeComments > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/youtube">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button asChild size="sm" className="gap-2">
            <a href={video.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Watch on YouTube</span>
              <span className="sm:hidden">Watch</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Player + side info on desktop, stacked on mobile */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-border">
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${video.id}`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-base sm:text-xl lg:text-2xl font-bold leading-tight">{video.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(video.publishedAt), "MMM d, yyyy")}
              </span>
              <span className="text-foreground/60">
                ({formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })})
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(video.durationSeconds)}
              </span>
              {isShortVideo ? (
                <Badge className="uppercase text-[10px] bg-rose-500 hover:bg-rose-500">Short</Badge>
              ) : (
                <Badge variant="secondary" className="uppercase text-[10px]">Long</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Quick KPI rail */}
        <div className="space-y-3">
          <Kpi
            icon={Eye}
            label="Views"
            value={formatNumber(video.views)}
            sub={`${formatNumber(viewsPerDay)} / day avg`}
            color="text-blue-400 bg-blue-500/10"
          />
          <Kpi
            icon={ThumbsUp}
            label="Likes"
            value={formatCount(video.likes)}
            sub={
              video.likes < 0
                ? "Hidden by creator"
                : likesPerDay >= 0
                ? `${formatCount(likesPerDay)} / day avg`
                : "—"
            }
            color="text-violet-400 bg-violet-500/10"
          />
          <Kpi
            icon={MessageCircle}
            label="Comments"
            value={formatCount(video.comments)}
            sub={
              video.comments < 0
                ? "Hidden / disabled"
                : commentsPerDay >= 0
                ? `${formatCount(commentsPerDay)} / day avg`
                : "—"
            }
            color="text-cyan-400 bg-cyan-500/10"
          />
          <Kpi
            icon={TrendingUp}
            label="Engagement"
            value={`${engagement.toFixed(2)}%`}
            sub={
              engagement >= 5
                ? "Excellent"
                : engagement >= 2
                ? "Good"
                : engagement > 0
                ? "Below avg"
                : "—"
            }
            color="text-emerald-400 bg-emerald-500/10"
          />
        </div>
      </div>

      {/* Performance + Engagement gauge + Pie */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Performance breakdown */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Performance breakdown</p>
                <p className="text-[11px] text-muted-foreground">Per-day rates and reach</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <Tile label="Views / day" value={formatNumber(viewsPerDay)} />
              <Tile label="Days live" value={`${ageDays}`} />
              <Tile
                label="Reach vs subs"
                value={`${reachVsSubs.toFixed(1)}%`}
                hint="views ÷ current subs"
              />
              <Tile
                label="Like rate"
                value={video.likes < 0 ? "—" : `${likeRate.toFixed(2)}%`}
                hint="likes ÷ views"
              />
              <Tile
                label="Comment rate"
                value={video.comments < 0 ? "—" : `${commentRate.toFixed(2)}%`}
                hint="comments ÷ views"
              />
              <Tile
                label="Likes : Comments"
                value={
                  safeComments > 0 && video.likes >= 0
                    ? `${(safeLikes / safeComments).toFixed(1)} : 1`
                    : "—"
                }
              />
              <Tile
                label="Est. watch time"
                value={
                  watchHours >= 1000
                    ? `${(watchHours / 1000).toFixed(1)}K hrs`
                    : `${Math.round(watchHours).toLocaleString()} hrs`
                }
                hint="views × duration"
              />
              <Tile
                label="Engagement"
                value={`${engagement.toFixed(2)}%`}
                hint="(likes+comments) ÷ views"
              />
              {peers && (
                <Tile
                  label={`Rank vs ${isShortVideo ? "Shorts" : "Longs"}`}
                  value={`#${peers.rank} / ${peers.count + 1}`}
                  hint="by views"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Engagement gauge */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Engagement score</p>
                <p className="text-[11px] text-muted-foreground">How many viewers interacted</p>
              </div>
              <Badge
                variant="secondary"
                className={`text-[10px] uppercase font-bold tracking-wider shrink-0 ${
                  engagement >= 5
                    ? "bg-emerald-500/15 text-emerald-400"
                    : engagement >= 2
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {engagement >= 5
                  ? "Excellent"
                  : engagement >= 2
                  ? "Good"
                  : engagement > 0
                  ? "Low"
                  : "No data"}
              </Badge>
            </div>

            {/* Speedometer gauge with needle */}
            <SpeedometerGauge value={engagement} />

            {/* Formula breakdown */}
            <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 sm:p-3 space-y-2">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                How it&apos;s calculated
              </p>
              <p className="text-[11px] sm:text-xs font-mono text-foreground/90 leading-relaxed">
                (Likes + Comments) ÷ Views × 100
              </p>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 tabular-nums font-semibold">
                  {formatCount(video.likes)}
                </span>
                <span className="text-muted-foreground">+</span>
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 tabular-nums font-semibold">
                  {formatCount(video.comments)}
                </span>
                <span className="text-muted-foreground">÷</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 tabular-nums font-semibold">
                  {formatNumber(video.views)}
                </span>
                <span className="text-muted-foreground">×</span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-foreground font-semibold">100</span>
                <span className="text-muted-foreground ml-auto">=</span>
                <span className="font-bold gradient-text tabular-nums">
                  {engagement.toFixed(2)}%
                </span>
              </div>
              {(video.likes < 0 || video.comments < 0) && (
                <p className="text-[10px] text-amber-400/90 leading-snug">
                  Note: {video.likes < 0 ? "likes" : "comments"} hidden by creator → counted as 0,
                  so true score may be higher.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison + Engagement Mix */}
      {(peers || hasEngagementBreakdown) && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
          {peers && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      This video vs {isShortVideo ? "your Shorts" : "your Longs"} avg
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Average across {peers.count} other {isShortVideo ? "Shorts" : "Longs"}
                    </p>
                  </div>
                </div>
                <div className="h-56 sm:h-64 -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compareData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="metric" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={formatNumber} width={48} />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: any) => formatNumber(Number(v))}
                      />
                      <Bar dataKey="This" fill={PRIMARY} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Avg" fill={VIOLET} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                  <CompareRow label="Views" current={video.views} avg={peers.avgViews} />
                  <CompareRow label="Likes" current={safeLikes} avg={peers.avgLikes} />
                  <CompareRow label="Comments" current={safeComments} avg={peers.avgComments} />
                </div>
              </CardContent>
            </Card>
          )}

          {hasEngagementBreakdown && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                    <Award className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Engagement mix</p>
                    <p className="text-[11px] text-muted-foreground">Where the interaction came from</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-44 w-44 sm:h-48 sm:w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={engagementBreakdown}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                        >
                          {engagementBreakdown.map((e) => (
                            <Cell key={e.name} fill={e.color} />
                          ))}
                        </Pie>
                        <RTooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: any) => formatNumber(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <LegendRow color={PRIMARY} label="Likes" value={formatCount(video.likes)} pct={safeLikes / (safeLikes + safeComments) * 100} />
                    <LegendRow color={ACCENT} label="Comments" value={formatCount(video.comments)} pct={safeComments / (safeLikes + safeComments) * 100} />
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-[11px] text-muted-foreground">Total interactions</p>
                      <p className="text-base font-bold tabular-nums">
                        {formatNumber(safeLikes + safeComments)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Channel context */}
      {channel.subscriberCount > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Channel context</p>
                <p className="text-[11px] text-muted-foreground">How this video sits in your channel</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <Tile label="Channel subs" value={formatNumber(channel.subscriberCount)} />
              <Tile label="Channel views" value={formatNumber(channel.totalViews)} />
              <Tile label="Channel videos" value={formatNumber(channel.totalVideos)} />
              <Tile
                label="This video share"
                value={
                  channel.totalViews > 0
                    ? `${((video.views / channel.totalViews) * 100).toFixed(2)}%`
                    : "—"
                }
                hint="views vs lifetime"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {(video.tags?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h2 className="font-semibold text-sm sm:text-base flex items-center gap-2">
              <Hash className="h-4 w-4" /> Tags
              <span className="text-[11px] text-muted-foreground font-normal">({video.tags!.length})</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {video.tags!.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {video.description && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h2 className="font-semibold text-sm sm:text-base">Description</h2>
            <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-line break-words">
              {video.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SpeedometerGauge({ value }: { value: number }) {
  // Scale: 0% → 10%+ maps to a 180° arc (left → top → right).
  const clamped = Math.max(0, Math.min(10, value));
  const ratio = clamped / 10; // 0..1
  // Needle rotation: ratio 0 → -180° (points left), 0.5 → -90° (up), 1 → 0° (right)
  const needleAngle = -180 + ratio * 180;

  // Color based on engagement
  const color =
    value >= 5
      ? "hsl(142, 71%, 45%)" // emerald
      : value >= 2
      ? "hsl(38, 92%, 60%)" // amber
      : "hsl(346, 87%, 60%)"; // rose

  // Geometry — viewBox 200x130; center at (100, 100), radius 78
  const cx = 100;
  const cy = 100;
  const r = 78;

  // Polar helper. Angle 180° = left, -90° = top, 0° = right (SVG y-down)
  const polar = (angleDeg: number, radius: number = r) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  // Background arc: from -180° (left) through -90° (top) to 0° (right).
  // sweep-flag=1 sweeps in increasing-angle direction; from -180° that goes
  // through -90° (top) to 0°, drawing the TOP half-circle.
  const bgStart = polar(-180); // (cx - r, cy)
  const bgEnd = polar(0);      // (cx + r, cy)
  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`;

  // Progress arc end angle: ratio 0 → -180°, ratio 1 → 0°
  const progAngle = -180 + ratio * 180;
  const progEnd = polar(progAngle);
  const showProgress = ratio > 0.001;
  const progPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${progEnd.x} ${progEnd.y}`;

  // Tick marks at 0, 2, 5, 10
  const ticks = [
    { v: 0, label: "0" },
    { v: 2, label: "2" },
    { v: 5, label: "5" },
    { v: 10, label: "10+" },
  ];

  return (
    <div className="relative">
      <svg
        viewBox="0 0 200 130"
        className="w-full h-auto max-h-44 sm:max-h-48"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="gauge-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(346, 87%, 60%)" />
            <stop offset="45%" stopColor="hsl(38, 92%, 60%)" />
            <stop offset="85%" stopColor="hsl(142, 71%, 45%)" />
          </linearGradient>
          <filter id="needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feOffset dx="0" dy="1.5" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.5" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Progress arc — only fills up to current value */}
        {showProgress && (
          <path
            d={progPath}
            fill="none"
            stroke="url(#gauge-arc)"
            strokeWidth="12"
            strokeLinecap="round"
            style={{ transition: "all 800ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          />
        )}

        {/* Tick marks */}
        {ticks.map((t) => {
          const a = 180 - (t.v / 10) * 180;
          const inner = polar(a, r - 10);
          const outer = polar(a, r + 4);
          const labelPos = polar(a, r + 14);
          return (
            <g key={t.v}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="1.2"
                opacity="0.5"
                strokeLinecap="round"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="7"
                fill="hsl(var(--muted-foreground))"
                fontWeight="700"
              >
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        <g
          transform={`rotate(${needleAngle} ${cx} ${cy})`}
          style={{ transition: "transform 900ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <polygon
            points={`${cx},${cy - 3} ${cx + r - 6},${cy} ${cx},${cy + 3}`}
            fill={color}
            filter="url(#needle-shadow)"
          />
        </g>

        {/* Center hub (drawn outside rotating group so it stays put) */}
        <circle cx={cx} cy={cy} r="9" fill="hsl(var(--card))" stroke={color} strokeWidth="2.5" />
        <circle cx={cx} cy={cy} r="3.5" fill={color} />
      </svg>

      {/* Value readout below */}
      <div className="mt-1 flex flex-col items-center">
        <p
          className="text-4xl sm:text-5xl font-black tabular-nums leading-none"
          style={{ color }}
        >
          {value.toFixed(2)}
          <span className="text-2xl sm:text-3xl font-bold ml-0.5 opacity-80">%</span>
        </p>
        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1.5 font-medium">
          of viewers engaged
        </p>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="card-premium p-3 sm:p-4 flex items-center gap-3">
      <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-medium text-muted-foreground truncate">
          {label}
        </p>
        <p className="text-base sm:text-lg font-bold tabular-nums truncate">{value}</p>
        {sub && <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:p-3">
      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium truncate">
        {label}
      </p>
      <p className="text-sm sm:text-base font-bold tabular-nums truncate mt-0.5">{value}</p>
      {hint && <p className="text-[9px] sm:text-[10px] text-muted-foreground/80 truncate">{hint}</p>}
    </div>
  );
}

function CompareRow({ label, current, avg }: { label: string; current: number; avg: number }) {
  const diff = avg > 0 ? ((current - avg) / avg) * 100 : 0;
  const positive = diff >= 0;
  return (
    <div className="text-center">
      <p className="text-muted-foreground truncate">{label}</p>
      <p
        className={`font-semibold tabular-nums ${
          positive ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {positive ? "+" : ""}
        {diff.toFixed(0)}%
      </p>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
          <span className="truncate">{label}</span>
        </span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
        />
      </div>
    </div>
  );
}
