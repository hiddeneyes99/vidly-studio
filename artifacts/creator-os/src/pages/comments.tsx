import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useCreatorData } from "@/hooks/use-creator-data";
import { useGenerateCommentReplies } from "@/lib/ai-hooks";
import { useToast } from "@/hooks/use-toast";
import {
  fetchVideoComments,
  isShort,
  type YouTubeComment,
  type YouTubeRecentVideo,
} from "@/lib/youtube";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageCircle,
  ThumbsUp,
  Sparkles,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Pin,
  AlertTriangle,
  HelpCircle,
  Heart,
  MessageSquareWarning,
  Lightbulb,
  Flame,
  Clock,
  PlayCircle,
  Inbox,
  Search,
  ListVideo,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type {
  CommentReplySuggestion,
  CommentReplyPriority,
  CommentReplyIntent,
} from "@/lib/gemini";

type FilterMode = "all" | "important" | "questions" | "unanswered";
type ViewMode = "inbox" | "by-video";
type VideoTypeFilter = "all" | "long" | "shorts";

const PRIORITY_META: Record<
  CommentReplyPriority,
  { label: string; className: string; icon: typeof Pin }
> = {
  pin: {
    label: "PIN THIS",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    icon: Pin,
  },
  reply: {
    label: "REPLY",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    icon: MessageCircle,
  },
  skip: {
    label: "SKIP",
    className: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  },
  warn: {
    label: "WATCH OUT",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    icon: AlertTriangle,
  },
};

const INTENT_META: Record<
  CommentReplyIntent,
  { label: string; icon: typeof Pin }
> = {
  question: { label: "Question", icon: HelpCircle },
  praise: { label: "Praise", icon: Heart },
  criticism: { label: "Criticism", icon: MessageSquareWarning },
  suggestion: { label: "Suggestion", icon: Lightbulb },
  spam: { label: "Spam", icon: AlertTriangle },
  joke: { label: "Joke", icon: Sparkles },
  personal: { label: "Personal", icon: MessageCircle },
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function heuristicScore(c: YouTubeComment): number {
  let s = 0;
  s += Math.min(20, c.likes);
  if (/\?/.test(c.textPlain)) s += 8;
  if (c.textPlain.length > 80) s += 4;
  if (c.textPlain.length > 200) s += 4;
  if (c.replyCount === 0) s += 3;
  return s;
}

type EnrichedComment = {
  comment: YouTubeComment;
  video: YouTubeRecentVideo;
  suggestion?: CommentReplySuggestion;
  score: number;
};

const PRIORITY_RANK: Record<CommentReplyPriority, number> = {
  pin: 0,
  warn: 1,
  reply: 2,
  skip: 3,
};

export default function Comments() {
  const {
    channel,
    recentYouTubeVideos,
    videosNextPageToken,
    loadMoreYouTubeVideos,
  } = useCreatorData();
  const { toast } = useToast();
  const generateReplies = useGenerateCommentReplies();

  // All videos sorted by newest first (no slice — show everything that's loaded)
  const allVideos = useMemo(() => {
    return [...recentYouTubeVideos].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }, [recentYouTubeVideos]);

  // Top-level mode + AI suggestion store keyed by comment id (works in both modes)
  const [view, setView] = useState<ViewMode>("inbox");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [suggestionsById, setSuggestionsById] = useState<
    Record<string, CommentReplySuggestion>
  >({});

  // ---- By-video state ----
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(
    allVideos[0]?.id ?? null,
  );
  const [videoSearch, setVideoSearch] = useState("");
  const [videoType, setVideoType] = useState<VideoTypeFilter>("all");
  const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Make sure we always have a valid selection if videos load asynchronously
  useEffect(() => {
    if (!selectedVideoId && allVideos[0]) setSelectedVideoId(allVideos[0].id);
  }, [allVideos, selectedVideoId]);

  // ---- Inbox (global) state ----
  const [inboxScanCount, setInboxScanCount] = useState<number>(25);
  const inboxVideos = useMemo(
    () => allVideos.slice(0, inboxScanCount),
    [allVideos, inboxScanCount],
  );

  const filteredVideos = useMemo(() => {
    const q = videoSearch.trim().toLowerCase();
    return allVideos.filter((v) => {
      if (videoType === "shorts" && !isShort(v)) return false;
      if (videoType === "long" && isShort(v)) return false;
      if (q && !v.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allVideos, videoSearch, videoType]);

  const selectedVideo = allVideos.find((v) => v.id === selectedVideoId) ?? null;

  // ---- Per-video comments query (by-video mode) ----
  const commentsQuery = useQuery({
    queryKey: ["yt-comments", selectedVideoId, "relevance"],
    queryFn: () => fetchVideoComments(selectedVideoId!, 50, "relevance"),
    enabled: view === "by-video" && !!selectedVideoId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // ---- Inbox: parallel fetch latest comments from N most recent videos ----
  const inboxQueries = useQueries({
    queries: inboxVideos.map((v) => ({
      queryKey: ["yt-comments", v.id, "time"] as const,
      queryFn: () => fetchVideoComments(v.id, 20, "time"),
      enabled: view === "inbox",
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const inboxLoading =
    view === "inbox" && inboxQueries.some((q) => q.isLoading);
  const inboxError =
    view === "inbox" &&
    inboxQueries.length > 0 &&
    inboxQueries.every((q) => q.isError);

  const refetchInbox = () => {
    inboxQueries.forEach((q) => q.refetch());
  };

  // Build the unified enriched list depending on mode
  const enrichedComments = useMemo<EnrichedComment[]>(() => {
    if (view === "inbox") {
      const out: EnrichedComment[] = [];
      inboxQueries.forEach((q, i) => {
        const video = inboxVideos[i];
        if (!video || !q.data) return;
        for (const c of q.data) {
          out.push({
            comment: c,
            video,
            suggestion: suggestionsById[c.id],
            score: heuristicScore(c),
          });
        }
      });
      // Newest first
      out.sort(
        (a, b) =>
          new Date(b.comment.publishedAt).getTime() -
          new Date(a.comment.publishedAt).getTime(),
      );
      return out;
    }

    if (!selectedVideo) return [];
    const list = commentsQuery.data ?? [];
    return list.map((c) => ({
      comment: c,
      video: selectedVideo,
      suggestion: suggestionsById[c.id],
      score: heuristicScore(c),
    }));
  }, [
    view,
    inboxQueries,
    inboxVideos,
    commentsQuery.data,
    selectedVideo,
    suggestionsById,
  ]);

  const filtered = useMemo(() => {
    let list = [...enrichedComments];
    if (filter === "important") {
      list = list.filter(
        (e) =>
          e.suggestion?.priority === "pin" ||
          e.suggestion?.priority === "reply" ||
          e.suggestion?.priority === "warn" ||
          (!e.suggestion && e.score >= 12),
      );
    } else if (filter === "questions") {
      list = list.filter(
        (e) =>
          e.suggestion?.intent === "question" ||
          (!e.suggestion && /\?/.test(e.comment.textPlain)),
      );
    } else if (filter === "unanswered") {
      list = list.filter((e) => e.comment.replyCount === 0);
    }

    // In by-video: AI priority first (pin > warn > reply > skip), then likes
    // In inbox: keep recency order but boost AI-flagged important to top
    if (view === "by-video") {
      list.sort((a, b) => {
        const aP = a.suggestion ? PRIORITY_RANK[a.suggestion.priority] : 5;
        const bP = b.suggestion ? PRIORITY_RANK[b.suggestion.priority] : 5;
        if (aP !== bP) return aP - bP;
        if (a.score !== b.score) return b.score - a.score;
        return b.comment.likes - a.comment.likes;
      });
    }
    return list;
  }, [enrichedComments, filter, view]);

  const counts = useMemo(() => {
    const all = enrichedComments.length;
    const important = enrichedComments.filter(
      (e) =>
        e.suggestion?.priority === "pin" ||
        e.suggestion?.priority === "reply" ||
        e.suggestion?.priority === "warn" ||
        (!e.suggestion && e.score >= 12),
    ).length;
    const questions = enrichedComments.filter(
      (e) =>
        e.suggestion?.intent === "question" ||
        (!e.suggestion && /\?/.test(e.comment.textPlain)),
    ).length;
    const unanswered = enrichedComments.filter(
      (e) => e.comment.replyCount === 0,
    ).length;
    return { all, important, questions, unanswered };
  }, [enrichedComments]);

  // ---- AI triage ----
  const handleAiSuggest = async () => {
    // Triage at most 30 comments at a time
    const target = filtered.slice(0, 30);
    if (target.length === 0) return;

    const titleHint =
      view === "by-video" && selectedVideo
        ? selectedVideo.title
        : `Recent uploads (${inboxVideos.length} videos)`;

    try {
      const out = await generateReplies.mutateAsync({
        data: {
          videoTitle: titleHint,
          channelName: channel.name,
          niche: channel.niche,
          comments: target.map((e) => ({
            author: e.comment.author,
            text: e.comment.textPlain || stripHtml(e.comment.text),
          })),
        },
      });
      // Map AI replies (by index) back to comment ids
      const next: Record<string, CommentReplySuggestion> = {
        ...suggestionsById,
      };
      out.replies.forEach((r) => {
        const e = target[r.index];
        if (e) next[e.comment.id] = r;
      });
      setSuggestionsById(next);
      toast({
        title: "AI suggestions ready",
        description: `${out.replies.length} comments triaged. Important ones top pe hain.`,
      });
    } catch (err: any) {
      toast({
        title: "AI helper failed",
        description: err?.message ?? "Try again in a moment",
        variant: "destructive",
      });
    }
  };

  const copyReply = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Reply paste karke YouTube pe bhej do.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Manually select karke copy karo.",
        variant: "destructive",
      });
    }
  };

  const handleLoadMoreVideos = async () => {
    setLoadingMoreVideos(true);
    try {
      const { added, hasMore } = await loadMoreYouTubeVideos();
      toast({
        title: added > 0 ? `+${added} videos loaded` : "No new videos",
        description: hasMore
          ? "More available — keep loading."
          : "All videos loaded.",
      });
    } catch (err: any) {
      toast({
        title: "Load failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setLoadingMoreVideos(false);
    }
  };

  // ---------- HERO (consistent with other pages) ----------
  const aiBtnDisabled = generateReplies.isPending || filtered.length === 0;
  const hero = (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-rose-500/15 via-pink-600/10 to-transparent p-4 sm:p-6">
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-pink-600/20 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 shrink-0">
            <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Comment Helper
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Latest comments ek jagah, ya kisi specific video ke. AI bataayega
              kya reply karna hai, kya pin karna hai.
            </p>
            {allVideos.length > 0 && (
              <div className="hidden sm:flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300">
                  <Inbox className="h-3 w-3" /> {allVideos.length} videos loaded
                </span>
                {channel.totalVideos > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {channel.totalVideos.toLocaleString()} on channel
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {allVideos.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button
              onClick={handleAiSuggest}
              disabled={aiBtnDisabled}
              className="gap-2 w-full sm:w-auto bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-500/90 hover:to-pink-600/90 text-white border-0 shadow-md shadow-rose-500/30"
              data-testid="button-ai-suggest"
            >
              {generateReplies.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI triage
              {filtered.length > 0 ? ` (${Math.min(30, filtered.length)})` : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // ---------- EMPTY STATE ----------
  if (allVideos.length === 0) {
    return (
      <div className="space-y-6">
        {hero}
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <PlayCircle className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No videos synced yet.</p>
            <p className="text-xs text-muted-foreground">
              My Channel page pe ja ke "Sync from YouTube" dabao.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- VIDEO LIST (used in sidebar + sheet) ----------
  const videoList = (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="space-y-2 px-1 sticky top-0 bg-card/95 backdrop-blur z-10 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search videos…"
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
            data-testid="input-video-search"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { v: "all", label: "All" },
              { v: "long", label: "Long" },
              { v: "shorts", label: "Shorts" },
            ] as { v: VideoTypeFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setVideoType(opt.v)}
              className={`flex-1 text-[11px] py-1.5 rounded-md border transition-colors ${
                videoType === opt.v
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-200"
                  : "border-border/50 hover:bg-muted/40 text-muted-foreground"
              }`}
              data-testid={`filter-video-${opt.v}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground px-0.5">
          Showing {filteredVideos.length} of {allVideos.length}
          {channel.totalVideos
            ? ` • ${channel.totalVideos} on channel`
            : ""}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 px-1">
        {filteredVideos.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">
            No videos match.
          </div>
        )}
        {filteredVideos.map((v) => {
          const isActive = v.id === selectedVideoId;
          const aiCount = enrichedComments.filter(
            (e) => e.video.id === v.id && e.suggestion,
          ).length;
          const short = isShort(v);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedVideoId(v.id);
                setView("by-video");
                setPickerOpen(false);
              }}
              className={`w-full text-left flex gap-2.5 p-2 rounded-md border transition-colors ${
                isActive
                  ? "bg-rose-500/10 border-rose-500/40"
                  : "border-transparent hover:bg-muted/40"
              }`}
              data-testid={`video-${v.id}`}
            >
              <div className="relative shrink-0 w-20 aspect-video rounded overflow-hidden bg-muted">
                {v.thumbnailUrl && (
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                )}
                {short && (
                  <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold uppercase tracking-wide bg-rose-500/90 text-white px-1 rounded">
                    Short
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-snug line-clamp-2">
                  {v.title}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-0.5">
                    <MessageCircle className="h-2.5 w-2.5" />
                    {v.comments < 0 ? "—" : v.comments.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDistanceToNow(new Date(v.publishedAt), {
                      addSuffix: false,
                    })}
                  </span>
                  {aiCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-rose-300">
                      <Sparkles className="h-2.5 w-2.5" />
                      {aiCount}
                    </span>
                  )}
                </p>
              </div>
            </button>
          );
        })}

        <div className="pt-2 pb-1 flex flex-col items-center gap-1.5">
          {videosNextPageToken ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLoadMoreVideos}
              disabled={loadingMoreVideos}
              className="gap-2 w-full"
              data-testid="button-load-more-videos"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 ${loadingMoreVideos ? "animate-bounce" : ""}`}
              />
              {loadingMoreVideos ? "Loading…" : "Load more videos"}
            </Button>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              All loaded videos shown
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- MODE TABS + INBOX CONTROLS ----------
  const modeBar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as ViewMode)}
        className="w-full sm:w-auto"
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger
            value="inbox"
            className="gap-1.5"
            data-testid="tab-inbox"
          >
            <Inbox className="h-3.5 w-3.5" /> Inbox
          </TabsTrigger>
          <TabsTrigger
            value="by-video"
            className="gap-1.5"
            data-testid="tab-by-video"
          >
            <ListVideo className="h-3.5 w-3.5" /> By Video
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "inbox" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Select
            value={String(inboxScanCount)}
            onValueChange={(v) => setInboxScanCount(Number(v))}
          >
            <SelectTrigger
              className="h-9 flex-1 sm:flex-none sm:w-[140px] text-xs"
              data-testid="select-inbox-scan"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Last 10 videos</SelectItem>
              <SelectItem value="25">Last 25 videos</SelectItem>
              <SelectItem value="50">Last 50 videos</SelectItem>
              <SelectItem value="100">Last 100 videos</SelectItem>
              <SelectItem value={String(allVideos.length || 1)}>
                All loaded ({allVideos.length})
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 gap-1.5 text-xs"
            onClick={refetchInbox}
            disabled={inboxLoading}
            data-testid="button-refresh-inbox"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                inboxQueries.some((q) => q.isFetching) ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      )}

      {view === "by-video" && (
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden gap-2 h-9"
              data-testid="button-open-picker"
            >
              <ListVideo className="h-3.5 w-3.5" />
              {selectedVideo ? "Change video" : "Pick a video"}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] sm:w-[360px] p-3">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-sm">Your videos</SheetTitle>
              <SheetDescription className="text-xs">
                {allVideos.length} loaded
                {channel.totalVideos
                  ? ` • ${channel.totalVideos} on channel`
                  : " (sync for more)"}
              </SheetDescription>
            </SheetHeader>
            <div className="h-[calc(100vh-7rem)] flex flex-col">
              {videoList}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );

  // ---------- FILTER TABS ----------
  const filterBar = (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
      <TabsList className="grid grid-cols-4 w-full h-auto gap-0.5 sm:inline-flex sm:w-auto sm:gap-0">
        <TabsTrigger
          value="all"
          className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-[11px] sm:text-sm"
          data-testid="filter-all"
        >
          <span className="flex items-center gap-1">
            All
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {counts.all}
            </Badge>
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="important"
          className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-[11px] sm:text-sm"
          data-testid="filter-important"
        >
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" /> Important
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {counts.important}
            </Badge>
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="questions"
          className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-[11px] sm:text-sm"
          data-testid="filter-questions"
        >
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3 w-3" /> Questions
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {counts.questions}
            </Badge>
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="unanswered"
          className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-[11px] sm:text-sm"
          data-testid="filter-unanswered"
        >
          <span className="flex items-center gap-1">
            Unanswered
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {counts.unanswered}
            </Badge>
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  // ---------- COMMENT CARD ----------
  const renderCommentCard = (e: EnrichedComment) => {
    const { comment, video, suggestion, score } = e;
    const priorityMeta = suggestion ? PRIORITY_META[suggestion.priority] : null;
    const PriorityIcon = priorityMeta?.icon;
    const intentMeta = suggestion ? INTENT_META[suggestion.intent] : null;
    const IntentIcon = intentMeta?.icon;
    const isHot = !suggestion && score >= 12;

    return (
      <Card
        key={comment.id}
        className={`hover-elevate ${
          suggestion?.priority === "pin"
            ? "border-amber-500/40"
            : suggestion?.priority === "warn"
              ? "border-rose-500/40"
              : ""
        }`}
        data-testid={`comment-${comment.id}`}
      >
        <CardContent className="p-3 sm:p-4 space-y-3">
          {view === "inbox" && (
            <button
              type="button"
              onClick={() => {
                setSelectedVideoId(video.id);
                setView("by-video");
              }}
              className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-rose-300 transition-colors w-full text-left"
              data-testid={`source-${video.id}`}
            >
              <div className="relative shrink-0 w-9 aspect-video rounded overflow-hidden bg-muted">
                {video.thumbnailUrl && (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <span className="line-clamp-1 flex-1">{video.title}</span>
              {isShort(video) && (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] border-rose-500/40 text-rose-300"
                >
                  Short
                </Badge>
              )}
            </button>
          )}

          <div className="flex gap-2.5 sm:gap-3">
            {comment.authorImage && (
              <img
                src={comment.authorImage}
                alt={comment.author}
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate max-w-[160px] sm:max-w-none">
                  {comment.author}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {comment.publishedAt &&
                    formatDistanceToNow(new Date(comment.publishedAt), {
                      addSuffix: true,
                    })}
                </span>
                {priorityMeta && PriorityIcon && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ${priorityMeta.className}`}
                  >
                    <PriorityIcon className="h-3 w-3" /> {priorityMeta.label}
                  </Badge>
                )}
                {intentMeta && IntentIcon && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <IntentIcon className="h-3 w-3" /> {intentMeta.label}
                  </Badge>
                )}
                {isHot && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-amber-500/40 text-amber-300"
                  >
                    <Flame className="h-3 w-3" /> Hot
                  </Badge>
                )}
              </div>
              <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">
                {stripHtml(comment.text)}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" /> {comment.likes}
                </span>
                {comment.replyCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" /> {comment.replyCount}{" "}
                    replies
                  </span>
                )}
                <a
                  href={`https://www.youtube.com/watch?v=${video.id}&lc=${comment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-rose-300 ml-auto"
                  data-testid={`open-${comment.id}`}
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {suggestion && suggestion.draftReply && suggestion.priority !== "skip" && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium text-rose-300">
                <Sparkles className="h-3.5 w-3.5" /> AI suggested reply
                {suggestion.why && (
                  <span className="ml-auto text-[10px] text-muted-foreground italic font-normal line-clamp-1">
                    {suggestion.why}
                  </span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {suggestion.draftReply}
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyReply(suggestion.draftReply)}
                  className="gap-1.5 h-7 text-xs"
                  data-testid={`copy-${comment.id}`}
                >
                  <Copy className="h-3 w-3" /> Copy reply
                </Button>
              </div>
            </div>
          )}

          {suggestion?.why && suggestion.priority === "skip" && (
            <p className="text-[11px] text-muted-foreground italic">
              AI: {suggestion.why}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  // ---------- LOADING / ERROR STATES ----------
  const loadingSkeleton = (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const isLoading =
    view === "by-video" ? commentsQuery.isLoading : inboxLoading;
  const isError =
    view === "by-video" ? commentsQuery.isError : inboxError;

  // ---------- MAIN LAYOUT ----------
  return (
    <div className="space-y-5">
      {hero}
      {modeBar}

      {view === "by-video" ? (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          {/* DESKTOP sidebar — hidden on mobile, mobile uses Sheet */}
          <Card className="h-fit lg:sticky lg:top-4 hidden lg:flex lg:flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Your videos</CardTitle>
              <CardDescription className="text-xs">
                {allVideos.length} loaded
                {channel.totalVideos
                  ? ` • ${channel.totalVideos} on channel`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 max-h-[calc(100vh-12rem)] flex flex-col">
              {videoList}
            </CardContent>
          </Card>

          <div className="space-y-4 min-w-0">
            {selectedVideo && (
              <Card>
                <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0 w-20 sm:w-24 aspect-video rounded overflow-hidden bg-muted">
                      {selectedVideo.thumbnailUrl && (
                        <img
                          src={selectedVideo.thumbnailUrl}
                          alt={selectedVideo.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm line-clamp-2">
                        {selectedVideo.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {selectedVideo.comments < 0
                            ? "—"
                            : selectedVideo.comments.toLocaleString()}{" "}
                          comments
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {selectedVideo.likes < 0
                            ? "—"
                            : selectedVideo.likes.toLocaleString()}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(
                            new Date(selectedVideo.publishedAt),
                            { addSuffix: true },
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                  <a
                    href={selectedVideo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-rose-300 hover:underline shrink-0"
                  >
                    Open on YouTube <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            )}

            {filterBar}

            {isLoading && loadingSkeleton}

            {isError && (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  <AlertTriangle className="h-6 w-6 mx-auto text-rose-400" />
                  <p className="text-sm">Comments load nahi ho paaye.</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {(commentsQuery.error as any)?.message ?? "Unknown error"}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => commentsQuery.refetch()}
                    className="gap-2"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isLoading &&
              !isError &&
              enrichedComments.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-3">
                      Is video pe abhi koi comment nahi hai (ya comments
                      disabled hain).
                    </p>
                  </CardContent>
                </Card>
              )}

            {filtered.map(renderCommentCard)}

            {!isLoading &&
              !isError &&
              enrichedComments.length > 0 &&
              filtered.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      Is filter me koi comment nahi hai.
                    </p>
                  </CardContent>
                </Card>
              )}
          </div>
        </div>
      ) : (
        // ---------- INBOX ----------
        <div className="space-y-4">
          {filterBar}

          {isLoading && enrichedComments.length === 0 && loadingSkeleton}

          {isError && enrichedComments.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <AlertTriangle className="h-6 w-6 mx-auto text-rose-400" />
                <p className="text-sm">Inbox load nahi ho paaya.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refetchInbox}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading &&
            !isError &&
            enrichedComments.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-3">
                    Aapki recent videos pe abhi koi comment nahi hai.
                  </p>
                </CardContent>
              </Card>
            )}

          {filtered.map(renderCommentCard)}

          {!isLoading &&
            !isError &&
            enrichedComments.length > 0 &&
            filtered.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Is filter me koi comment nahi hai.
                  </p>
                </CardContent>
              </Card>
            )}

          {enrichedComments.length > 0 && (
            <p className="text-center text-[11px] text-muted-foreground pt-2">
              Scanned {inboxVideos.length} videos •{" "}
              {enrichedComments.length} comments loaded
            </p>
          )}
        </div>
      )}
    </div>
  );
}
