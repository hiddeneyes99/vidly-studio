import { useEffect, useMemo, useRef, useState } from "react";
import { useCreatorData } from "@/hooks/use-creator-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { compactAge } from "@/lib/youtube";
import {
  Youtube,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Clock,
  Calendar,
  TrendingUp,
  Languages,
  Tags,
  Users,
  Wand2,
  Zap,
  Globe,
  Hash,
  Activity,
  Lightbulb,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useGenerateAudiencePersona } from "@/lib/ai-hooks";
import {
  computeBestPostingTimes,
  detectLanguage,
  detectNiche,
  computeCadence,
  formatHourRange,
  formatHour,
  dayLabel,
  slotToTimeString,
  type PostingSlot,
} from "@/lib/channel-insights";

const FALLBACK_LOGO = "/twh-logo.jpeg";

// Normalize a user-typed handle/URL so debounced auto-sync can compare
// against what's already saved without firing on every cosmetic change
// (trailing slash, query string, http vs https, etc.).
function normalizeHandle(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  // strip URL prefix if present and pull the meaningful identifier
  const urlMatch = v.match(
    /(?:youtube\.com\/(?:@([^/?#]+)|channel\/(UC[\w-]{20,})|c\/([^/?#]+)|user\/([^/?#]+))|^@?([^/?#\s]+))/i,
  );
  if (urlMatch) {
    const id = urlMatch[1] || urlMatch[2] || urlMatch[3] || urlMatch[4] || urlMatch[5] || "";
    if (id.startsWith("UC")) return id;
    return id.startsWith("@") ? id.toLowerCase() : `@${id.toLowerCase()}`;
  }
  return v.toLowerCase();
}

export default function ChannelSetup() {
  const { channel, setChannel, syncFromYouTube, recentYouTubeVideos } = useCreatorData();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [handleInput, setHandleInput] = useState(channel.channelHandle ?? "");
  const lastSyncedHandleRef = useRef<string>(normalizeHandle(channel.channelHandle ?? ""));
  const personaMutation = useGenerateAudiencePersona();

  // Keep the input in sync if `channel.channelHandle` changes from elsewhere
  // (e.g. background load) — but only when the user isn't actively editing.
  useEffect(() => {
    if (!channel.channelHandle) return;
    if (normalizeHandle(handleInput) === normalizeHandle(channel.channelHandle)) {
      return;
    }
    if (handleInput === "" || handleInput === channel.channelHandle) {
      setHandleInput(channel.channelHandle);
      lastSyncedHandleRef.current = normalizeHandle(channel.channelHandle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.channelHandle]);

  // ----- Debounced auto-fetch when user types a different handle/URL -----
  useEffect(() => {
    const norm = normalizeHandle(handleInput);
    // skip empties and short fragments (avoid firing while user still types)
    if (!norm || norm.replace(/^@/, "").length < 3) return;
    // skip if it's the same channel we last fetched
    if (norm === lastSyncedHandleRef.current) return;

    const t = window.setTimeout(async () => {
      const trimmed = handleInput.trim();
      if (!trimmed) return;
      lastSyncedHandleRef.current = norm;
      setSyncing(true);
      try {
        await syncFromYouTube(trimmed);
        toast({
          title: "Channel updated",
          description: "Naya channel fetch ho gaya — naam, logo aur videos sab refresh.",
        });
      } catch (err: any) {
        // allow another retry by clearing the dedupe ref
        lastSyncedHandleRef.current = "";
        toast({
          title: "Couldn't fetch that channel",
          description:
            err?.message ?? "Handle/URL check karo ya thodi der baad try karo.",
          variant: "destructive",
        });
      } finally {
        setSyncing(false);
      }
    }, 800);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleInput]);

  // Compute insights from existing video data
  const insights = useMemo(() => {
    return {
      posting: computeBestPostingTimes(recentYouTubeVideos),
      niche: detectNiche(recentYouTubeVideos, channel.keywords),
      language: detectLanguage(recentYouTubeVideos),
      cadence: computeCadence(recentYouTubeVideos),
    };
  }, [recentYouTubeVideos, channel.keywords]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setChannel({
      ...channel,
      name: (formData.get("name") as string) ?? channel.name,
      niche: (formData.get("niche") as string) ?? channel.niche,
      description: (formData.get("description") as string) ?? channel.description,
      channelHandle: (formData.get("channelHandle") as string) ?? channel.channelHandle,
    });
    toast({ title: "Saved", description: "Channel info updated." });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const handle = handleInput.trim() || channel.channelHandle;
      if (!handle) throw new Error("Pehle koi handle ya URL daalo.");
      lastSyncedHandleRef.current = normalizeHandle(handle);
      await syncFromYouTube(handle);
      toast({
        title: "Synced from YouTube",
        description: "Channel info, logo, and recent videos refreshed.",
      });
    } catch (err: any) {
      toast({
        title: "Sync Failed",
        description: err?.message ?? "Could not reach YouTube. Check the handle and your API key.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const applyTopSlots = () => {
    const next = insights.posting.top.map(slotToTimeString);
    if (next.length === 0) {
      toast({ title: "Not enough data", description: "Sync more videos first.", variant: "destructive" });
      return;
    }
    setChannel({ ...channel, bestPostingTimes: next });
    toast({ title: "Applied", description: `Set ${next.length} best slots from your data.` });
  };

  const applyDetectedNiche = () => {
    if (!insights.niche.suggestedNiche || insights.niche.suggestedNiche === "—") return;
    setChannel({
      ...channel,
      detectedNiche: insights.niche.suggestedNiche,
      detectedLanguage: insights.language.primary,
      niche: channel.niche || insights.niche.suggestedNiche,
    });
    toast({ title: "Applied", description: "Niche & language updated from detection." });
  };

  const handleGeneratePersona = () => {
    if (recentYouTubeVideos.length < 3) {
      toast({
        title: "Need more videos",
        description: "Sync at least 3 videos to build a persona.",
        variant: "destructive",
      });
      return;
    }
    personaMutation.mutate(
      {
        data: {
          channelName: channel.name,
          niche: channel.niche || insights.niche.suggestedNiche,
          description: channel.description,
          language: insights.language.primary,
          sampleTitles: recentYouTubeVideos.slice(0, 25).map((v) => v.title),
          sampleTags: Array.from(new Set(recentYouTubeVideos.flatMap((v) => v.tags ?? []))).slice(0, 30),
          topKeywords: insights.niche.topKeywords.map((k) => k.word),
        },
      },
      {
        onSuccess: (res) => {
          setChannel({
            ...channel,
            audiencePersona: res.persona,
            personaUpdatedAt: new Date().toISOString(),
          });
          toast({ title: "Persona generated", description: res.persona.archetype });
        },
        onError: (err: any) => {
          toast({
            title: "Persona generation failed",
            description: err?.message ?? "Try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 sm:space-y-6 max-w-6xl mx-auto pb-8">
        {/* HERO */}
        <ChannelHero channel={channel} />

        {/* CONNECTION — always visible at top */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 sm:p-6 space-y-5">
            <SectionHeader
              icon={Youtube}
              color="bg-rose-500/10 text-rose-400"
              title="YouTube Connection"
              sub="Link your channel — stats, logo, and uploads sync automatically every 24 hours."
            />

            <div className="space-y-2">
              <Label htmlFor="channelHandle">Channel Handle or URL</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Input
                    id="channelHandle"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="@TechnicalWhiteHat"
                    className="pr-9"
                    data-testid="input-channel-handle"
                  />
                  {syncing && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-rose-400" />
                  )}
                </div>
                <Button
                  onClick={handleSync}
                  disabled={syncing || !handleInput.trim()}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-sync-now"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Re-sync"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Bas paste karo —{" "}
                <code className="text-foreground/80">@handle</code>,{" "}
                <code className="text-foreground/80">UCxxxx</code> ID, ya full
                YouTube URL — naam aur logo apne aap fetch ho jayenge.
              </p>
            </div>

            {channel.channelId && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 min-w-0">
                <Stat icon={Users} label="Subscribers" value={channel.subscriberCount.toLocaleString()} />
                <Stat icon={Activity} label="Videos" value={channel.totalVideos.toLocaleString()} />
                <Stat icon={TrendingUp} label="Views" value={channel.totalViews.toLocaleString()} />
                <Stat icon={Calendar} label="Age" value={compactAge(channel.channelAge)} />
              </div>
            )}

            {channel.publishedAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Created {format(new Date(channel.publishedAt), "MMMM d, yyyy")}
              </p>
            )}

            {channel.lastSyncedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Last synced {formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })} • Auto-syncs every 24h
              </div>
            )}
          </CardContent>
        </Card>

        {/* SUB-TABS — below connection */}
        <Tabs defaultValue="insights" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/50 backdrop-blur sticky top-0 z-10">
            <TabsTrigger value="insights" className="gap-1.5 text-xs sm:text-sm">
              <Sparkles className="h-3.5 w-3.5" /> Smart Insights
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5 text-xs sm:text-sm">
              <Clock className="h-3.5 w-3.5" /> Posting Times
            </TabsTrigger>
            <TabsTrigger value="identity" className="gap-1.5 text-xs sm:text-sm">
              <Tags className="h-3.5 w-3.5" /> Identity
            </TabsTrigger>
          </TabsList>

          {/* SMART INSIGHTS TAB */}
          <TabsContent value="insights" className="space-y-4 sm:space-y-5 mt-0">
            <NicheLanguageCard
              insights={insights}
              channel={channel}
              onApply={applyDetectedNiche}
            />
            <CadenceCard cadence={insights.cadence} />
            <PersonaCard
              persona={channel.audiencePersona}
              updatedAt={channel.personaUpdatedAt}
              loading={personaMutation.isPending}
              onGenerate={handleGeneratePersona}
              hasVideos={recentYouTubeVideos.length >= 3}
            />
          </TabsContent>

          {/* POSTING TIMES TAB */}
          <TabsContent value="schedule" className="space-y-4 sm:space-y-5 mt-0">
            <BestPostingTimesCard
              insights={insights.posting}
              currentSlots={channel.bestPostingTimes}
              onApplyAll={applyTopSlots}
              onAddSlot={(slot) => {
                const s = slotToTimeString(slot);
                if (channel.bestPostingTimes.includes(s)) return;
                setChannel({ ...channel, bestPostingTimes: [...channel.bestPostingTimes, s] });
                toast({ title: "Added", description: s });
              }}
            />
            <CurrentSlotsCard
              slots={channel.bestPostingTimes}
              onRemove={(idx) =>
                setChannel({
                  ...channel,
                  bestPostingTimes: channel.bestPostingTimes.filter((_, i) => i !== idx),
                })
              }
              onAdd={(s) =>
                setChannel({ ...channel, bestPostingTimes: [...channel.bestPostingTimes, s] })
              }
            />
          </TabsContent>

          {/* IDENTITY TAB */}
          <TabsContent value="identity" className="mt-0">
            <form onSubmit={handleSave}>
              <Card className="overflow-hidden">
                <CardContent className="p-4 sm:p-6 space-y-5">
                  <SectionHeader
                    icon={Tags}
                    color="bg-violet-500/10 text-violet-400"
                    title="Channel Identity"
                    sub="How the AI describes your channel when generating ideas, scripts, and titles."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Channel Name</Label>
                      <Input id="name" name="name" defaultValue={channel.name} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="niche">Niche / Category</Label>
                      <Input id="niche" name="niche" defaultValue={channel.niche} required />
                      {insights.niche.suggestedNiche !== "—" && insights.niche.suggestedNiche !== channel.niche && (
                        <p className="text-[11px] text-muted-foreground">
                          Detected: <span className="text-foreground">{insights.niche.suggestedNiche}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description">Description &amp; Mission</Label>
                    <Textarea
                      id="description"
                      name="description"
                      defaultValue={channel.description}
                      rows={4}
                      className="resize-none"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" className="gap-2 w-full sm:w-auto">
                      <Save className="h-4 w-4" /> Save Identity
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </TabsContent>

        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ============ Hero ============

function ChannelHero({
  channel,
}: {
  channel: ReturnType<typeof useCreatorData>["channel"];
}) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 px-1">
      <img
        src={channel.logoUrl || FALLBACK_LOGO}
        alt={channel.name}
        className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl object-cover ring-2 ring-border shadow-md shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
            {channel.name || "Channel Setup"}
          </h1>
          {channel.channelId && (
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground truncate">
          {channel.channelHandle || "Not connected yet"}
        </p>
      </div>
    </div>
  );
}

// ============ Niche / Language ============

function NicheLanguageCard({
  insights,
  channel,
  onApply,
}: {
  insights: ReturnType<typeof useDummyForType>;
  channel: ReturnType<typeof useCreatorData>["channel"];
  onApply: () => void;
}) {
  const langColor =
    insights.language.primary === "Hindi"
      ? "bg-amber-500/15 text-amber-400"
      : insights.language.primary === "Hinglish"
      ? "bg-rose-500/15 text-rose-400"
      : insights.language.primary === "English"
      ? "bg-blue-500/15 text-blue-400"
      : "bg-muted text-muted-foreground";

  const formatColor =
    insights.niche.dominantFormat === "Long"
      ? "bg-violet-500/15 text-violet-300"
      : insights.niche.dominantFormat === "Shorts"
      ? "bg-cyan-500/15 text-cyan-300"
      : "bg-amber-500/15 text-amber-300";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader
            icon={Wand2}
            color="bg-violet-500/10 text-violet-400"
            title="Detected Niche & Language"
            sub="Auto-pulled from your last 50 video titles, tags, and descriptions."
          />
          <Button size="sm" variant="outline" onClick={onApply} className="gap-1.5 shrink-0 hidden sm:inline-flex">
            <CheckCircle2 className="h-3.5 w-3.5" /> Apply
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Niche */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Tags className="h-3.5 w-3.5 text-violet-400" />
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Niche
              </p>
            </div>
            <p className="text-base sm:text-lg font-bold leading-snug">
              {insights.niche.suggestedNiche}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {insights.niche.topKeywords.slice(0, 6).map((k) => (
                <Badge key={k.word} variant="secondary" className="text-[10px] font-normal">
                  <Hash className="h-2.5 w-2.5 mr-0.5" />
                  {k.word}
                  <span className="opacity-60 ml-1">{k.count}</span>
                </Badge>
              ))}
            </div>
          </div>

          {/* Language + Format */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="h-3.5 w-3.5 text-cyan-400" />
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Language
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${langColor} text-sm font-bold`}>
                {insights.language.primary}
              </Badge>
              {insights.language.primary !== "Other" && (
                <span className="text-[11px] text-muted-foreground">
                  {(insights.language.hindiRatio * 100).toFixed(0)}% Devanagari · {(insights.language.confidence * 100).toFixed(0)}% confident
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Format
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${formatColor} text-sm font-bold`}>
                {insights.niche.dominantFormat}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {(insights.niche.longRatio * 100).toFixed(0)}% Long · {(insights.niche.shortRatio * 100).toFixed(0)}% Shorts
              </span>
            </div>
          </div>
        </div>

        {channel.detectedNiche && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t border-border/60 pt-3">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Saved: <span className="text-foreground">{channel.detectedNiche}</span> · {channel.detectedLanguage}
          </p>
        )}

        <Button size="sm" variant="outline" onClick={onApply} className="gap-1.5 w-full sm:hidden">
          <CheckCircle2 className="h-3.5 w-3.5" /> Apply detected values
        </Button>
      </CardContent>
    </Card>
  );
}

// ============ Cadence Card ============

function CadenceCard({ cadence }: { cadence: ReturnType<typeof computeCadence> }) {
  const trendColor =
    cadence.trend === "rising"
      ? "text-emerald-400"
      : cadence.trend === "falling"
      ? "text-rose-400"
      : "text-muted-foreground";

  const trendIcon =
    cadence.trend === "rising" ? "↑" : cadence.trend === "falling" ? "↓" : "→";

  const lateAlert = cadence.daysSinceLastUpload !== null && cadence.daysSinceLastUpload >= 14;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <SectionHeader
          icon={Activity}
          color="bg-emerald-500/10 text-emerald-400"
          title="Upload Cadence"
          sub="How often you've been shipping recently."
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <Tile label="Last 30 days" value={`${cadence.uploadsLast30Days} videos`} />
          <Tile label="Last 90 days" value={`${cadence.uploadsLast90Days} videos`} />
          <Tile
            label="Per week"
            value={cadence.uploadsPerWeek.toFixed(1)}
            sub="avg from 90d"
          />
          <Tile
            label="Last upload"
            value={cadence.daysSinceLastUpload !== null ? `${cadence.daysSinceLastUpload}d ago` : "—"}
          />
        </div>

        {cadence.trend !== "unknown" && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/60">
            <span className={`text-base font-bold ${trendColor}`}>{trendIcon}</span>
            <p className={`text-sm font-semibold ${trendColor} capitalize`}>{cadence.trend}</p>
            <p className="text-[11px] text-muted-foreground">
              vs previous 30 days
            </p>
          </div>
        )}

        {lateAlert && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90">
              No upload in {cadence.daysSinceLastUpload} days — momentum drops fast after 14 days.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ Persona Card ============

function PersonaCard({
  persona,
  updatedAt,
  loading,
  onGenerate,
  hasVideos,
}: {
  persona?: import("@/lib/gemini").AudiencePersona;
  updatedAt?: string;
  loading: boolean;
  onGenerate: () => void;
  hasVideos: boolean;
}) {
  if (!persona) {
    return (
      <Card className="overflow-hidden border-dashed">
        <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-base">Build your Audience Persona</p>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
              AI analyzes your titles, tags, and language to build a sharp profile of who actually clicks on your videos.
            </p>
          </div>
          <Button onClick={onGenerate} disabled={loading || !hasVideos} className="gap-2 mt-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Building…" : "Generate Persona"}
          </Button>
          {!hasVideos && (
            <p className="text-[11px] text-amber-400">Sync at least 3 videos first.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Persona header */}
        <div className="bg-gradient-to-br from-violet-500/15 via-cyan-500/10 to-transparent p-4 sm:p-6 border-b border-border/60">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="text-5xl sm:text-6xl shrink-0">{persona.emoji}</div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-violet-400">
                Your Audience
              </p>
              <h3 className="text-lg sm:text-2xl font-bold leading-tight">{persona.archetype}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground italic leading-snug">
                "{persona.oneLineSummary}"
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerate}
              disabled={loading}
              className="gap-1.5 shrink-0 self-start sm:self-center"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {loading ? "Updating…" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Demographic strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40">
          <DemoTile label="Age" value={persona.ageRange} />
          <DemoTile label="Gender" value={persona.gender} />
          <DemoTile label="Location" value={persona.location} />
          <DemoTile label="Device" value={persona.device} />
        </div>

        {/* Body grid */}
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <PersonaList icon={Lightbulb} color="text-amber-400" title="What they want" items={persona.motivations} />
          <PersonaList icon={AlertCircle} color="text-rose-400" title="Pain points" items={persona.painPoints} />
          <PersonaList icon={Sparkles} color="text-cyan-400" title="Interests" items={persona.interests} pill />
          <PersonaList icon={Activity} color="text-emerald-400" title="Content preferences" items={persona.contentPreferences} />
        </div>

        {/* Hooks */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
              Hooks that work for them
            </p>
          </div>
          <div className="space-y-1.5">
            {persona.bestHooks.map((h, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs sm:text-sm leading-relaxed"
              >
                <span className="text-amber-400 font-bold mr-1.5">{i + 1}.</span>
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-border/60 pt-3 sm:pt-4">
          <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
            Tone &amp; Style
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {persona.toneAndStyle}
          </p>
        </div>

        {updatedAt && (
          <div className="px-4 sm:px-6 pb-4 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Generated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DemoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-2.5 sm:p-3 text-center">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </p>
      <p className="text-[11px] sm:text-xs font-semibold mt-1 leading-snug line-clamp-2">{value}</p>
    </div>
  );
}

function PersonaList({
  icon: Icon,
  color,
  title,
  items,
  pill = false,
}: {
  icon: any;
  color: string;
  title: string;
  items: string[];
  pill?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
          {title}
        </p>
      </div>
      {pill ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <Badge key={i} variant="secondary" className="font-normal text-[11px]">
              {it}
            </Badge>
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-xs sm:text-sm flex gap-2 leading-snug">
              <span className={`${color} shrink-0`}>•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============ Best Posting Times ============

function BestPostingTimesCard({
  insights,
  currentSlots,
  onApplyAll,
  onAddSlot,
}: {
  insights: ReturnType<typeof computeBestPostingTimes>;
  currentSlots: string[];
  onApplyAll: () => void;
  onAddSlot: (slot: PostingSlot) => void;
}) {
  if (insights.totalAnalyzed === 0) {
    return (
      <Card className="overflow-hidden border-dashed">
        <CardContent className="p-6 sm:p-8 text-center space-y-2">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-semibold">Need video data first</p>
          <p className="text-xs text-muted-foreground">
            Sync your channel to detect best posting times automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isAlreadyApplied = (slot: PostingSlot) => currentSlots.includes(slotToTimeString(slot));

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader
            icon={Sparkles}
            color="bg-emerald-500/10 text-emerald-400"
            title="Best Posting Times — Auto-Detected"
            sub={`Analyzed ${insights.totalAnalyzed} videos. Score = views per day since publish.`}
          />
          <Button size="sm" onClick={onApplyAll} className="gap-1.5 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Apply Top 3</span>
            <span className="sm:hidden">Apply</span>
          </Button>
        </div>

        {/* Top 3 slot cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {insights.top.map((slot, idx) => {
            const lift = insights.channelAvgScore > 0
              ? ((slot.avgScore / insights.channelAvgScore - 1) * 100)
              : 0;
            const liftColor = lift > 0 ? "text-emerald-400" : "text-muted-foreground";
            const applied = isAlreadyApplied(slot);
            return (
              <button
                key={`${slot.dayOfWeek}-${slot.hour}`}
                type="button"
                onClick={() => onAddSlot(slot)}
                disabled={applied}
                className={`text-left rounded-xl border p-3 sm:p-4 transition-all ${
                  applied
                    ? "border-emerald-500/30 bg-emerald-500/5 cursor-default"
                    : "border-border bg-muted/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:-translate-y-0.5"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] font-bold ${
                      idx === 0 ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    #{idx + 1} {idx === 0 && "🏆"}
                  </Badge>
                  {applied && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <p className="text-base sm:text-lg font-bold leading-tight">
                  {dayLabel(slot.dayOfWeek, true)}
                </p>
                <p className="text-sm sm:text-base font-semibold text-foreground/80 mt-0.5">
                  {formatHourRange(slot.hour)}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    {slot.videoCount} {slot.videoCount === 1 ? "video" : "videos"}
                  </span>
                  {lift !== 0 && (
                    <span className={`text-[11px] font-bold ${liftColor}`}>
                      {lift > 0 ? "+" : ""}
                      {lift.toFixed(0)}% vs avg
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Chip icon={Calendar} label="Best day" value={insights.bestDayLabel} />
          <Chip icon={Clock} label="Best hour" value={insights.bestHourLabel} />
        </div>

        {/* Heatmap */}
        <div className="space-y-2 pt-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Performance heatmap (day × hour)
          </p>
          <Heatmap heatmap={insights.heatmap} />
        </div>
      </CardContent>
    </Card>
  );
}

function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Show every 3 hours as labels for compactness
  const hourLabels = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0 pb-2">
      <div className="min-w-[560px] sm:min-w-0 px-2 sm:px-0">
        {/* Hour header */}
        <div className="flex items-center gap-px pl-9 sm:pl-10">
          {hourLabels.map((h) => (
            <div
              key={h}
              className="flex-1 text-[8px] sm:text-[9px] text-muted-foreground/70 text-center font-mono"
            >
              {h % 3 === 0 ? formatHour(h).replace(" ", "") : ""}
            </div>
          ))}
        </div>
        {/* Rows */}
        {heatmap.map((row, dIdx) => (
          <div key={dIdx} className="flex items-center gap-px mt-1">
            <div className="w-9 sm:w-10 text-[10px] sm:text-[11px] font-semibold text-muted-foreground pr-1.5 text-right">
              {days[dIdx]}
            </div>
            {row.map((val, h) => (
              <Tooltip key={h}>
                <TooltipTrigger asChild>
                  <div
                    className="flex-1 aspect-square rounded-sm border border-border/30 transition-transform hover:scale-125 hover:z-10 hover:ring-1 hover:ring-emerald-400 cursor-help"
                    style={{
                      background:
                        val > 0
                          ? `hsla(160, 70%, 45%, ${0.15 + val * 0.85})`
                          : "hsl(var(--muted) / 0.3)",
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-semibold">{days[dIdx]} · {formatHourRange(h)}</p>
                  <p className="text-muted-foreground">
                    {val > 0 ? `${(val * 100).toFixed(0)}% of best slot` : "No videos at this time"}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-px">
            {[0.15, 0.35, 0.55, 0.75, 1].map((v, i) => (
              <div
                key={i}
                className="h-2.5 w-3.5 rounded-sm"
                style={{ background: `hsla(160, 70%, 45%, ${v})` }}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

// ============ Current Slots ============

function CurrentSlotsCard({
  slots,
  onRemove,
  onAdd,
}: {
  slots: string[];
  onRemove: (idx: number) => void;
  onAdd: (s: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6 space-y-3">
        <SectionHeader
          icon={Clock}
          color="bg-cyan-500/10 text-cyan-400"
          title="Your Posting Schedule"
          sub="Slots saved on your channel — used by the Schedule planner."
        />

        {slots.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No slots saved yet. Apply auto-detected ones above, or add manually below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {slots.map((time, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 bg-secondary/70 text-secondary-foreground px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium"
              >
                <Clock className="h-3 w-3 opacity-60" />
                {time}
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="ml-1 hover:text-destructive focus:outline-none"
                  aria-label={`Remove ${time}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 max-w-sm pt-1">
          <Input id="newTime" placeholder="e.g. Tue 18:00" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const input = document.getElementById("newTime") as HTMLInputElement;
              if (input.value && !slots.includes(input.value)) {
                onAdd(input.value);
                input.value = "";
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Helpers ============

function SectionHeader({
  icon: Icon,
  color,
  title,
  sub,
}: {
  icon: any;
  color: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-sm sm:text-base leading-tight">{title}</h3>
        {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5 min-w-0">
        <Icon className="h-3 w-3 shrink-0" />
        <p className="text-[11px] sm:text-xs font-medium truncate" title={label}>{label}</p>
      </div>
      <p className="text-sm sm:text-base lg:text-lg font-bold tabular-nums truncate" title={value}>{value}</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:p-3">
      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium truncate">{label}</p>
      <p className="text-sm sm:text-base font-bold tabular-nums truncate mt-0.5">{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground/80 truncate">{sub}</p>}
    </div>
  );
}

function Chip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 border border-border/60 px-3 py-1 text-xs">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

// Stub used purely for type inference — keeps the inferred type tight.
function useDummyForType() {
  return {
    posting: computeBestPostingTimes([]),
    niche: detectNiche([]),
    language: detectLanguage([]),
    cadence: computeCadence([]),
  };
}
