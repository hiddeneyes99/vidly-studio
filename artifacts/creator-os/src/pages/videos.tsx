import { useMemo, useState } from "react";
import {
  useCreatorData,
  type Video,
  type VideoStatus,
  type VideoType,
} from "@/hooks/use-creator-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Video as VideoIcon,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  PlayCircle,
  FileText,
  Lightbulb,
  Sparkles,
  Loader2,
  TrendingUp,
  TrendingDown,
  Search,
  Hash,
  Wand2,
  Copy,
  RefreshCw,
  AlertCircle,
  Youtube,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { usePredictVideoPerformance } from "@/lib/ai-hooks";
import { computeOutliers, type VideoOutlier } from "@/lib/channel-insights";

const STATUS_ORDER: VideoStatus[] = [
  "Idea",
  "Scripted",
  "Recorded",
  "Edited",
  "Published",
];

const STATUS_META: Record<
  VideoStatus,
  { color: string; ring: string; icon: any; label: string }
> = {
  Idea:      { color: "bg-muted text-muted-foreground border-border",         ring: "ring-muted-foreground/20",  icon: Lightbulb,   label: "Idea" },
  Scripted:  { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", ring: "ring-yellow-500/30",        icon: FileText,    label: "Scripted" },
  Recorded:  { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       ring: "ring-blue-500/30",          icon: PlayCircle,  label: "Recorded" },
  Edited:    { color: "bg-violet-500/15 text-violet-300 border-violet-500/30", ring: "ring-violet-500/30",        icon: CheckCircle2,label: "Edited" },
  Published: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", ring: "ring-emerald-500/30",   icon: CheckCircle2,label: "Published" },
};

const TIER_META: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  Hit:     { color: "text-rose-400",   bg: "bg-rose-500/15",   label: "🔥 Hit potential" },
  Solid:   { color: "text-emerald-400",bg: "bg-emerald-500/15",label: "✅ Solid" },
  Average: { color: "text-amber-400",  bg: "bg-amber-500/15",  label: "⚪ Average" },
  Risky:   { color: "text-muted-foreground", bg: "bg-muted",   label: "⚠️ Risky" },
};

export default function VideoTracker() {
  const { videos, setVideos, channel, recentYouTubeVideos } = useCreatorData();
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"All" | VideoStatus>("All");
  const [filterType, setFilterType] = useState<"All" | VideoType>("All");
  const [search, setSearch] = useState("");
  const [showOutliers, setShowOutliers] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState<Video | null>(null);

  const predictMutation = usePredictVideoPerformance();

  // Stats per status
  const counts = useMemo(() => {
    const c: Record<VideoStatus, number> = {
      Idea: 0, Scripted: 0, Recorded: 0, Edited: 0, Published: 0,
    };
    for (const v of videos) c[v.status]++;
    return c;
  }, [videos]);

  // Outliers from synced YouTube data
  const outliers = useMemo(
    () => computeOutliers(recentYouTubeVideos),
    [recentYouTubeVideos],
  );

  // Filtered list
  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (filterStatus !== "All" && v.status !== filterStatus) return false;
      if (filterType !== "All" && v.type !== filterType) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !v.title.toLowerCase().includes(q) &&
          !v.tags.join(" ").toLowerCase().includes(q) &&
          !v.notes.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [videos, filterStatus, filterType, search]);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newVideo: Video = {
      id: Math.random().toString(36).substring(7),
      title: formData.get("title") as string,
      type: formData.get("type") as VideoType,
      status: formData.get("status") as VideoStatus,
      thumbnailUrl: "",
      notes: (formData.get("notes") as string) ?? "",
      publishDate: new Date(formData.get("publishDate") as string).toISOString(),
      tags: ((formData.get("tags") as string) ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    setVideos([newVideo, ...videos]);
    setIsAddOpen(false);
    toast({ title: "Video Added", description: "Saved to your pipeline." });
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this video from the tracker?")) {
      setVideos(videos.filter((v) => v.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const handleStatusChange = (id: string, status: VideoStatus) => {
    setVideos(videos.map((v) => (v.id === id ? { ...v, status } : v)));
  };

  const handleAnalyze = (video: Video) => {
    setAnalyzeOpen(video);
    predictMutation.reset();
    predictMutation.mutate(
      {
        data: {
          channelName: channel.name,
          niche: channel.niche || channel.detectedNiche || "general",
          audienceSummary: channel.audiencePersona?.oneLineSummary,
          videoTitle: video.title,
          videoType: video.type,
          tags: video.tags,
          notes: video.notes,
          recentBenchmarks: recentYouTubeVideos
            .slice(0, 12)
            .map((v) => ({ title: v.title, views: Math.max(0, v.views) })),
        },
      },
      {
        onSuccess: (res) => {
          setVideos(
            videos.map((v) =>
              v.id === video.id
                ? {
                    ...v,
                    aiPrediction: { ...res.prediction, predictedAt: new Date().toISOString() },
                  }
                : v,
            ),
          );
        },
        onError: (err: any) =>
          toast({
            title: "AI prediction failed",
            description: err?.message ?? "Try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const applyImprovedTitle = (id: string, newTitle: string) => {
    setVideos(videos.map((v) => (v.id === id ? { ...v, title: newTitle } : v)));
    toast({ title: "Title updated" });
  };

  const applyBetterTags = (id: string, tags: string[]) => {
    setVideos(videos.map((v) => (v.id === id ? { ...v, tags } : v)));
    toast({ title: "Tags updated" });
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-6xl mx-auto pb-8">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-rose-500/10 via-violet-500/5 to-transparent p-4 sm:p-6">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 shrink-0">
              <VideoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Video Tracker
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Pipeline manage karo, AI se performance predict karo, outliers spot karo.
              </p>
            </div>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 w-full sm:w-auto shadow-md shadow-rose-500/20 bg-gradient-to-br from-rose-500 to-violet-600 hover:from-rose-500/90 hover:to-violet-600/90 text-white border-0">
                <Plus className="h-4 w-4" /> Add Video
              </Button>
            </DialogTrigger>
            <AddVideoDialog onSubmit={handleAdd} />
          </Dialog>
        </div>
      </div>

      {/* PIPELINE STATS */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              const active = filterStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterStatus(active ? "All" : s)}
                  className={`rounded-lg border p-2 sm:p-3 text-center transition-all ${
                    active
                      ? `${meta.color} ring-2 ${meta.ring}`
                      : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mx-auto mb-1 opacity-80" />
                  <p className="text-base sm:text-xl font-bold tabular-nums">{counts[s]}</p>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold opacity-70 truncate">
                    {meta.label}
                  </p>
                </button>
              );
            })}
          </div>
          {filterStatus !== "All" && (
            <button
              type="button"
              onClick={() => setFilterStatus("All")}
              className="text-[11px] text-muted-foreground hover:text-foreground mt-2 underline"
            >
              Clear status filter
            </button>
          )}
        </CardContent>
      </Card>

      {/* OUTLIERS PANEL — from synced YouTube data */}
      {(outliers.hits.length > 0 || outliers.underperformers.length > 0) && (
        <Card className="overflow-hidden">
          <CardContent className="p-3 sm:p-5">
            <button
              type="button"
              onClick={() => setShowOutliers((s) => !s)}
              className="flex items-center justify-between w-full gap-2 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm sm:text-base leading-tight">
                    Published Video Outliers
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    From your synced YouTube uploads · channel avg{" "}
                    {Math.round(outliers.channelAvgScore).toLocaleString()} views/day
                  </p>
                </div>
              </div>
              {showOutliers ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showOutliers && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mt-4">
                <OutlierColumn
                  title="🔥 Top Performers"
                  emptyText="No clear hits yet — keep shipping."
                  items={outliers.hits}
                  positive
                />
                <OutlierColumn
                  title="⚠️ Underperformers"
                  emptyText="Nothing flagged — good consistency."
                  items={outliers.underperformers}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* FILTER BAR */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, tags, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Formats</SelectItem>
            <SelectItem value="Long">Long Form</SelectItem>
            <SelectItem value="Short">Short</SelectItem>
            <SelectItem value="Reel">Reel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* VIDEO LIST */}
      <div className="space-y-2.5 sm:space-y-3">
        {filtered.map((video) => (
          <VideoRow
            key={video.id}
            video={video}
            onDelete={() => handleDelete(video.id)}
            onAnalyze={() => handleAnalyze(video)}
            onStatusChange={(s) => handleStatusChange(video.id, s)}
            analyzing={
              predictMutation.isPending && analyzeOpen?.id === video.id
            }
            onApplyTitle={(t) => applyImprovedTitle(video.id, t)}
            onApplyTags={(t) => applyBetterTags(video.id, t)}
          />
        ))}

        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-10 sm:p-14 text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center">
                <VideoIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">
                  {videos.length === 0 ? "No videos tracked yet" : "No matches"}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {videos.length === 0
                    ? "Add your first video idea to start the pipeline."
                    : "Try changing filters or clearing the search."}
                </p>
              </div>
              {videos.length === 0 && (
                <Button onClick={() => setIsAddOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Add First Video
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============ Video Row ============

function VideoRow({
  video,
  onDelete,
  onAnalyze,
  onStatusChange,
  analyzing,
  onApplyTitle,
  onApplyTags,
}: {
  video: Video;
  onDelete: () => void;
  onAnalyze: () => void;
  onStatusChange: (s: VideoStatus) => void;
  analyzing: boolean;
  onApplyTitle: (t: string) => void;
  onApplyTags: (t: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[video.status];
  const Icon = meta.icon;
  const pred = video.aiPrediction;
  const tier = pred ? TIER_META[pred.tier] ?? TIER_META.Average : null;
  const { toast } = useToast();

  return (
    <Card className="overflow-hidden hover:border-border/80 transition-all">
      <CardContent className="p-0">
        <div className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            {/* Status icon */}
            <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 ${meta.color}`}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>

            {/* Main */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm sm:text-base leading-snug min-w-0">
                  {video.title}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="h-7 w-7 shrink-0 -mt-1 -mr-1"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Select
                  value={video.status}
                  onValueChange={(v) => onStatusChange(v as VideoStatus)}
                >
                  <SelectTrigger className={`h-6 px-2 py-0 text-[10px] sm:text-[11px] font-semibold w-auto gap-1 ${meta.color}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Badge variant="secondary" className="text-[10px] font-medium">
                  {video.type}
                </Badge>

                <span className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(video.publishDate), "MMM d")}
                </span>

                {pred && tier && (
                  <Badge
                    className={`${tier.bg} ${tier.color} text-[10px] gap-1 font-semibold border-0`}
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {pred.score}/100 · {tier.label}
                  </Badge>
                )}
              </div>

              {video.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {video.tags.slice(0, 5).map((t) => (
                    <span key={t} className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                      <Hash className="h-2.5 w-2.5" />{t}
                    </span>
                  ))}
                  {video.tags.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">+{video.tags.length - 5}</span>
                  )}
                </div>
              )}

              {video.notes && (
                <p className="text-[11px] sm:text-xs text-muted-foreground italic line-clamp-2">
                  {video.notes}
                </p>
              )}

              {/* Action row */}
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                {!pred && (
                  <Button
                    size="sm"
                    onClick={onAnalyze}
                    disabled={analyzing}
                    className="gap-1.5 h-7 text-xs border-0 text-white shadow-md shadow-rose-500/20 bg-gradient-to-br from-rose-500 to-violet-600 hover:from-rose-500/90 hover:to-violet-600/90"
                  >
                    {analyzing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {analyzing ? "Analyzing…" : "Predict performance"}
                  </Button>
                )}
                {pred && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpanded((e) => !e)}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Eye className="h-3 w-3" />
                      {expanded ? "Hide insights" : "View AI insights"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onAnalyze}
                      disabled={analyzing}
                      className="gap-1.5 h-7 text-xs"
                    >
                      {analyzing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Re-analyze
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI insights expanded */}
        {pred && expanded && tier && (
          <div className="border-t border-border/60 bg-muted/20 p-3 sm:p-4 space-y-3">
            {/* Score header */}
            <div className="flex items-center gap-3">
              <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-2xl flex flex-col items-center justify-center ${tier.bg}`}>
                <p className={`text-xl sm:text-2xl font-bold tabular-nums ${tier.color}`}>
                  {pred.score}
                </p>
                <p className="text-[8px] uppercase tracking-wider opacity-70">/ 100</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${tier.color}`}>{tier.label}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Eye className="h-3 w-3" />
                  Estimated views: <span className="text-foreground font-semibold">{pred.estimatedViewsRange}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                  Generated {formatDistanceToNow(new Date(pred.predictedAt), { addSuffix: true })}
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed bg-background/50 rounded-lg p-2.5 sm:p-3 border border-border/50">
              {pred.reasoning}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InsightList
                title="Strengths"
                items={pred.strengths}
                icon={TrendingUp}
                color="text-emerald-400"
              />
              <InsightList
                title="Risks"
                items={pred.risks}
                icon={AlertCircle}
                color="text-rose-400"
              />
            </div>

            {/* Suggestions */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-violet-400" />
                <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                  AI Suggestions
                </p>
              </div>

              <SuggestionRow
                label="Better title"
                value={pred.improvedTitle}
                onApply={() => onApplyTitle(pred.improvedTitle)}
                onCopy={() => {
                  navigator.clipboard.writeText(pred.improvedTitle);
                  toast({ title: "Copied" });
                }}
              />
              <SuggestionRow
                label="Opening hook"
                value={pred.improvedHook}
                onCopy={() => {
                  navigator.clipboard.writeText(pred.improvedHook);
                  toast({ title: "Copied" });
                }}
              />
              <div className="flex items-start gap-2 rounded-lg bg-background/50 border border-border/50 p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Better tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pred.betterTags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                        <Hash className="h-2.5 w-2.5 mr-0.5" />{t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onApplyTags(pred.betterTags)}
                  className="h-7 text-[11px] shrink-0"
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionRow({
  label,
  value,
  onApply,
  onCopy,
}: {
  label: string;
  value: string;
  onApply?: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/50 border border-border/50 p-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
          {label}
        </p>
        <p className="text-xs sm:text-sm leading-snug">{value}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 w-7 p-0">
          <Copy className="h-3 w-3" />
        </Button>
        {onApply && (
          <Button size="sm" variant="ghost" onClick={onApply} className="h-7 text-[11px]">
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

function InsightList({
  title,
  items,
  icon: Icon,
  color,
}: {
  title: string;
  items: string[];
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-background/50 rounded-lg p-2.5 sm:p-3 border border-border/50">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
          {title}
        </p>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[11px] sm:text-xs leading-snug flex gap-1.5">
            <span className={`${color} shrink-0`}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============ Outlier Column ============

function OutlierColumn({
  title,
  items,
  emptyText,
  positive = false,
}: {
  title: string;
  items: VideoOutlier[];
  emptyText: string;
  positive?: boolean;
}) {
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  const accentColor = positive ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((o) => (
            <a
              key={o.video.id}
              href={`https://youtube.com/watch?v=${o.video.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 hover:bg-muted/40 hover:border-border transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-background/60 flex items-center justify-center shrink-0">
                <Youtube className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">
                  {o.video.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {o.video.views.toLocaleString()} views
                  </span>
                  <span className={`text-[10px] font-bold ${accentColor} flex items-center gap-0.5 tabular-nums`}>
                    <TrendIcon className="h-2.5 w-2.5" />
                    {o.liftPercent > 0 ? "+" : ""}
                    {o.liftPercent.toFixed(0)}% vs avg
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Add Dialog ============

function AddVideoDialog({
  onSubmit,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add New Video</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required placeholder="e.g. Top 5 Hacking Tools 2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="type">Format</Label>
            <Select name="type" defaultValue="Long">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Long">Long Form</SelectItem>
                <SelectItem value="Short">Short</SelectItem>
                <SelectItem value="Reel">Reel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue="Idea">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="publishDate">Target Publish Date</Label>
          <Input id="publishDate" name="publishDate" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input id="tags" name="tags" placeholder="cybersecurity, tutorial, hack" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} className="resize-none" />
        </div>
        <Button type="submit" className="w-full gap-2">
          <Plus className="h-4 w-4" /> Save Video
        </Button>
      </form>
    </DialogContent>
  );
}
