import { useMemo, useState } from "react";
import {
  useCreatorData,
  Idea,
  IdeaDifficulty,
  IdeaSourceMode,
  VideoType,
  Video,
  VideoStatus,
} from "@/hooks/use-creator-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useGenerateVideoIdeas,
  useGenerateThumbnail,
  useGenerateThumbnailStrategy,
} from "@/lib/ai-hooks";
import type {
  ThumbnailStrategy,
  ThumbnailStylePreset,
} from "@/lib/gemini";
import {
  Lightbulb,
  Plus,
  Trash2,
  Wand2,
  ArrowRight,
  Loader2,
  Search,
  Image as ImageIcon,
  Sparkles,
  Pin,
  PinOff,
  Download,
  RefreshCw,
  Globe2,
  Target,
  Shuffle,
  Eye,
  Palette,
  Sliders,
  ChevronDown,
  Zap,
} from "lucide-react";

type FilterType = "all" | VideoType;
type FilterSource = "all" | IdeaSourceMode;

const sourceMeta: Record<
  IdeaSourceMode,
  { label: string; icon: typeof Target; chip: string }
> = {
  niche: {
    label: "My niche",
    icon: Target,
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  trending: {
    label: "YT trending",
    icon: Globe2,
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  mixed: {
    label: "Mixed",
    icon: Shuffle,
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
};

export default function IdeaBank() {
  const { channel, ideas, setIdeas, videos, setVideos } = useCreatorData();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [aiMode, setAiMode] = useState<IdeaSourceMode>("niche");

  const [thumbIdea, setThumbIdea] = useState<Idea | null>(null);
  const [thumbHd, setThumbHd] = useState(false);
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbStrategy, setThumbStrategy] =
    useState<ThumbnailStrategy | null>(null);
  const [thumbStyle, setThumbStyle] =
    useState<ThumbnailStylePreset | null>(null);
  const [thumbAdvancedOpen, setThumbAdvancedOpen] = useState(false);

  const [seedChips, setSeedChips] = useState<string[]>([]);
  const [seedInput, setSeedInput] = useState("");
  const seedSuggestions = useMemo(
    () => [
      "WhatsApp scam",
      "UPI fraud",
      "AI tools",
      "Phishing",
      "Hacking news",
      "Privacy",
    ],
    [],
  );

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");

  const generateIdeas = useGenerateVideoIdeas();
  const generateThumb = useGenerateThumbnail();
  const generateStrategy = useGenerateThumbnailStrategy();

  const stylePresets: {
    id: ThumbnailStylePreset;
    label: string;
    emoji: string;
  }[] = [
    { id: "money", label: "Money", emoji: "💰" },
    { id: "tech", label: "Tech / AI", emoji: "⚡" },
    { id: "tutorial", label: "Tutorial", emoji: "📘" },
    { id: "drama", label: "Drama", emoji: "🔥" },
    { id: "before_after", label: "Before / After", emoji: "🔄" },
  ];

  const filteredIdeas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ideas
      .filter((i) => (filterType === "all" ? true : i.type === filterType))
      .filter((i) =>
        filterSource === "all"
          ? true
          : (i.sourceMode ?? "niche") === filterSource,
      )
      .filter((i) =>
        !q
          ? true
          : i.title.toLowerCase().includes(q) ||
            i.hook.toLowerCase().includes(q) ||
            i.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [ideas, search, filterType, filterSource]);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newIdea: Idea = {
      id: Math.random().toString(36).substring(7),
      title: formData.get("title") as string,
      hook: formData.get("hook") as string,
      type: formData.get("type") as VideoType,
      difficulty: formData.get("difficulty") as IdeaDifficulty,
      tags: (formData.get("tags") as string)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
      sourceMode: "niche",
    };
    setIdeas([newIdea, ...ideas]);
    setIsAddOpen(false);
    toast({ title: "Idea saved", description: "Added to your bank." });
  };

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const count = Number(formData.get("count") || 5);
    const pendingInput = seedInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allSeeds = Array.from(new Set([...seedChips, ...pendingInput]));
    const trendingTopics = allSeeds.length ? allSeeds : undefined;

    try {
      const response = await generateIdeas.mutateAsync({
        data: {
          channelName: channel.name,
          niche: channel.niche,
          description: channel.description,
          count,
          trendingTopics,
          mode: aiMode,
        },
      });

      const newIdeas: Idea[] = response.ideas.map((aiIdea: any) => ({
        id: Math.random().toString(36).substring(7),
        title: aiIdea.title,
        hook: aiIdea.hook,
        type: (aiIdea.type as VideoType) || "Long",
        difficulty: (aiIdea.difficulty as IdeaDifficulty) || "Medium",
        tags: aiIdea.tags || [],
        createdAt: new Date().toISOString(),
        sourceMode: aiMode,
      }));

      setIdeas([...newIdeas, ...ideas]);
      setIsAIOpen(false);
      toast({
        title: `${newIdeas.length} ideas generated`,
        description:
          aiMode === "trending"
            ? "Based on what's trending on YouTube right now."
            : aiMode === "mixed"
            ? "Mix of your niche + broader trends."
            : "All inside your niche.",
      });
    } catch {
      toast({
        title: "Generation failed",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this idea?")) return;
    setIdeas(ideas.filter((i) => i.id !== id));
    toast({ title: "Idea deleted" });
  };

  const togglePin = (id: string) => {
    setIdeas(
      ideas.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)),
    );
  };

  const convertToVideo = (idea: Idea) => {
    const newVideo: Video = {
      id: Math.random().toString(36).substring(7),
      title: idea.title,
      type: idea.type,
      status: "Idea" as VideoStatus,
      thumbnailUrl: idea.thumbnailUrl ?? "",
      notes: `Hook: ${idea.hook}`,
      publishDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: idea.tags,
    };
    setVideos([newVideo, ...videos]);
    setIdeas(ideas.filter((i) => i.id !== idea.id));
    toast({
      title: "Moved to Video Tracker",
      description: idea.thumbnailUrl ? "Thumbnail carried over." : undefined,
    });
  };

  const openThumbDialog = (idea: Idea) => {
    setThumbIdea(idea);
    setThumbPreview(idea.thumbnailUrl ?? null);
    setThumbHd(false);
    setThumbStrategy(null);
    setThumbStyle(null);
    setThumbAdvancedOpen(false);
    setThumbPrompt("");
  };

  const runSmartGenerate = async () => {
    if (!thumbIdea) return;
    try {
      const out = await generateThumb.mutateAsync({
        data: {
          useStrategy: true,
          hd: thumbHd,
          stylePreset: thumbStyle ?? undefined,
          idea: {
            title: thumbIdea.title,
            hook: thumbIdea.hook,
            tags: thumbIdea.tags,
            niche: channel.niche,
          },
        },
      });
      setThumbPreview(out.dataUrl);
      if (out.strategy) {
        setThumbStrategy(out.strategy);
        setThumbPrompt(out.strategy.imagePrompt);
      }
    } catch (err: any) {
      toast({
        title: "Thumbnail generation failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const runStrategyOnly = async () => {
    if (!thumbIdea) return;
    try {
      const out = await generateStrategy.mutateAsync({
        data: {
          stylePreset: thumbStyle ?? undefined,
          idea: {
            title: thumbIdea.title,
            hook: thumbIdea.hook,
            tags: thumbIdea.tags,
            niche: channel.niche,
          },
        },
      });
      setThumbStrategy(out.strategy);
      setThumbPrompt(out.strategy.imagePrompt);
      setThumbAdvancedOpen(true);
      toast({
        title: "Strategy ready",
        description: "Tweak the image prompt below, then hit Generate.",
      });
    } catch (err: any) {
      toast({
        title: "Strategy failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const runManualGenerate = async () => {
    if (!thumbIdea || !thumbPrompt.trim()) return;
    try {
      const out = await generateThumb.mutateAsync({
        data: { prompt: thumbPrompt, hd: thumbHd },
      });
      setThumbPreview(out.dataUrl);
    } catch (err: any) {
      toast({
        title: "Thumbnail generation failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const saveThumb = () => {
    if (!thumbIdea || !thumbPreview) return;
    setIdeas(
      ideas.map((i) =>
        i.id === thumbIdea.id ? { ...i, thumbnailUrl: thumbPreview } : i,
      ),
    );
    toast({ title: "Thumbnail saved to idea" });
    setThumbIdea(null);
  };

  const counts = useMemo(() => {
    const total = ideas.length;
    const niche = ideas.filter((i) => (i.sourceMode ?? "niche") === "niche").length;
    const trending = ideas.filter((i) => i.sourceMode === "trending").length;
    const mixed = ideas.filter((i) => i.sourceMode === "mixed").length;
    const withThumb = ideas.filter((i) => i.thumbnailUrl).length;
    return { total, niche, trending, mixed, withThumb };
  }, [ideas]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-purple-600/15 via-blue-700/10 to-transparent p-4 sm:p-6">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-blue-700/20 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-700 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
              <Lightbulb className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Idea Bank
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Brainstorm, organize and design thumbnails — all in one place.
              </p>
              <div className="hidden sm:flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> {counts.total} ideas
                </span>
                {counts.trending > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300">
                    <Globe2 className="h-3 w-3" /> {counts.trending} trending
                  </span>
                )}
                {counts.mixed > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300">
                    <Shuffle className="h-3 w-3" /> {counts.mixed} mixed
                  </span>
                )}
                {counts.withThumb > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300">
                    <ImageIcon className="h-3 w-3" /> {counts.withThumb} with thumbnail
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
            <Dialog
              open={isAIOpen}
              onOpenChange={(o) => {
                setIsAIOpen(o);
                if (!o) {
                  setSeedChips([]);
                  setSeedInput("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  className="gap-2 w-full sm:w-auto shadow-md shadow-purple-500/30 bg-gradient-to-br from-purple-600 to-blue-700 hover:from-purple-600/90 hover:to-blue-700/90 text-white border-0"
                >
                  <Wand2 className="h-4 w-4" /> AI Brainstorm
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5 text-purple-400" /> AI Idea Generator
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleGenerate} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Tabs
                      value={aiMode}
                      onValueChange={(v) => setAiMode(v as IdeaSourceMode)}
                    >
                      <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="niche" className="gap-1.5">
                          <Target className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">My niche</span>
                          <span className="sm:hidden">Niche</span>
                        </TabsTrigger>
                        <TabsTrigger value="trending" className="gap-1.5">
                          <Globe2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">YT trending</span>
                          <span className="sm:hidden">Trend</span>
                        </TabsTrigger>
                        <TabsTrigger value="mixed" className="gap-1.5">
                          <Shuffle className="h-3.5 w-3.5" />
                          Both
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="text-xs text-muted-foreground">
                      {aiMode === "niche" &&
                        `Stay strictly inside your "${channel.niche}" niche.`}
                      {aiMode === "trending" &&
                        "Broader trending YouTube topics (pop culture, AI, news, viral) — outside your niche, for audience expansion."}
                      {aiMode === "mixed" &&
                        "Half niche, half broader trends — balanced growth."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="trending" className="flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-purple-400" />
                        Focus topics
                        <span className="text-[10px] font-normal text-muted-foreground">
                          (optional — but if set, every idea is about these)
                        </span>
                      </Label>
                      {seedChips.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSeedChips([])}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <Input
                      id="trending"
                      name="trending"
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === ",") &&
                          seedInput.trim()
                        ) {
                          e.preventDefault();
                          const next = seedInput
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setSeedChips(
                            Array.from(new Set([...seedChips, ...next])),
                          );
                          setSeedInput("");
                        } else if (
                          e.key === "Backspace" &&
                          !seedInput &&
                          seedChips.length
                        ) {
                          setSeedChips(seedChips.slice(0, -1));
                        }
                      }}
                      onBlur={() => {
                        if (seedInput.trim()) {
                          const next = seedInput
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setSeedChips(
                            Array.from(new Set([...seedChips, ...next])),
                          );
                          setSeedInput("");
                        }
                      }}
                      placeholder='Type a topic and press Enter (e.g. "WhatsApp scam", "AI tools")'
                    />
                    {seedChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {seedChips.map((chip) => (
                          <span
                            key={chip}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/40 text-purple-200"
                          >
                            {chip}
                            <button
                              type="button"
                              onClick={() =>
                                setSeedChips(
                                  seedChips.filter((c) => c !== chip),
                                )
                              }
                              className="hover:text-white"
                              aria-label={`Remove ${chip}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        Quick:
                      </span>
                      {seedSuggestions.map((s) => {
                        const active = seedChips.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setSeedChips(
                                active
                                  ? seedChips.filter((c) => c !== s)
                                  : [...seedChips, s],
                              )
                            }
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                              active
                                ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
                                : "bg-muted/40 border-border/60 text-muted-foreground hover:border-purple-500/40 hover:text-purple-300"
                            }`}
                          >
                            + {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="count">How many ideas?</Label>
                    <Select name="count" defaultValue="5">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 ideas</SelectItem>
                        <SelectItem value="5">5 ideas</SelectItem>
                        <SelectItem value="8">8 ideas</SelectItem>
                        <SelectItem value="12">12 ideas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-br from-purple-600 to-blue-700 hover:from-purple-600/90 hover:to-blue-700/90 text-white border-0 shadow-md shadow-purple-500/30"
                    disabled={generateIdeas.isPending}
                  >
                    {generateIdeas.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2" />
                    )}
                    Generate Ideas
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" /> Add Idea
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add new idea</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title / Concept</Label>
                    <Input id="title" name="title" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hook">Hook (first 5 seconds)</Label>
                    <Textarea id="hook" name="hook" rows={2} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">Format</Label>
                      <Select name="type" defaultValue="Long">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Long">Long Form</SelectItem>
                          <SelectItem value="Short">Short</SelectItem>
                          <SelectItem value="Reel">Reel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="difficulty">Difficulty</Label>
                      <Select name="difficulty" defaultValue="Medium">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (comma separated)</Label>
                    <Input
                      id="tags"
                      name="tags"
                      placeholder="cybersecurity, tutorial"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Save Idea
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ideas, hooks, tags…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs
            value={filterSource}
            onValueChange={(v) => setFilterSource(v as FilterSource)}
          >
            <TabsList>
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="niche" className="text-xs gap-1">
                <Target className="h-3 w-3" /> Niche
              </TabsTrigger>
              <TabsTrigger value="trending" className="text-xs gap-1">
                <Globe2 className="h-3 w-3" /> Trending
              </TabsTrigger>
              <TabsTrigger value="mixed" className="text-xs gap-1">
                <Shuffle className="h-3 w-3" /> Mix
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={filterType}
            onValueChange={(v) => setFilterType(v as FilterType)}
          >
            <TabsList>
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="Long" className="text-xs">Long</TabsTrigger>
              <TabsTrigger value="Short" className="text-xs">Short</TabsTrigger>
              <TabsTrigger value="Reel" className="text-xs">Reel</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredIdeas.map((idea) => {
          const meta = sourceMeta[idea.sourceMode ?? "niche"];
          const SourceIcon = meta.icon;
          return (
            <Card
              key={idea.id}
              className="group relative overflow-hidden hover-elevate transition-all flex flex-col border-border/60"
            >
              {/* Thumbnail / placeholder */}
              <div className="relative aspect-video bg-gradient-to-br from-muted/40 to-muted/10 overflow-hidden">
                {idea.thumbnailUrl ? (
                  <img
                    src={idea.thumbnailUrl}
                    alt={idea.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => openThumbDialog(idea)}
                    className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                  >
                    <ImageIcon className="h-8 w-8 mb-1.5 opacity-60" />
                    <span className="text-xs">Generate AI thumbnail</span>
                  </button>
                )}

                {/* Source badge */}
                <span
                  className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border backdrop-blur-sm ${meta.chip}`}
                >
                  <SourceIcon className="h-3 w-3" /> {meta.label}
                </span>

                {/* Pin */}
                <button
                  type="button"
                  onClick={() => togglePin(idea.id)}
                  className={`absolute top-2 right-2 h-7 w-7 rounded-md flex items-center justify-center backdrop-blur-sm border transition-colors ${
                    idea.pinned
                      ? "bg-amber-500/80 text-white border-amber-400"
                      : "bg-background/60 text-muted-foreground border-border/60 hover:text-amber-400"
                  }`}
                  aria-label={idea.pinned ? "Unpin" : "Pin"}
                >
                  {idea.pinned ? (
                    <Pin className="h-3.5 w-3.5" />
                  ) : (
                    <PinOff className="h-3.5 w-3.5" />
                  )}
                </button>

                {idea.thumbnailUrl && (
                  <button
                    type="button"
                    onClick={() => openThumbDialog(idea)}
                    className="absolute bottom-2 right-2 h-7 px-2 rounded-md flex items-center gap-1 bg-background/70 backdrop-blur-sm border border-border/60 text-xs text-foreground/80 hover:text-purple-300 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-do
                  </button>
                )}
              </div>

              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base sm:text-lg leading-snug">
                    {idea.title}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 -mr-2 -mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(idea.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive/60 hover:text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[10px] py-0">
                    {idea.type}
                  </Badge>
                  <Badge
                    variant={
                      idea.difficulty === "Easy"
                        ? "secondary"
                        : idea.difficulty === "Hard"
                        ? "destructive"
                        : "default"
                    }
                    className="text-[10px] py-0"
                  >
                    {idea.difficulty}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 pb-3 pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  <span className="font-medium text-foreground/80">Hook:</span>{" "}
                  {idea.hook}
                </p>
                {idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {idea.tags.slice(0, 5).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-muted/70 text-muted-foreground px-1.5 py-0.5 rounded"
                      >
                        #{tag.replace(/\s+/g, "")}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-0 gap-2 flex-col sm:flex-row">
                {!idea.thumbnailUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto gap-1.5"
                    onClick={() => openThumbDialog(idea)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Thumbnail
                  </Button>
                )}
                <Button
                  size="sm"
                  className="w-full gap-2 bg-gradient-to-br from-purple-600 to-blue-700 hover:from-purple-600/90 hover:to-blue-700/90 text-white border-0 shadow-md shadow-purple-500/30"
                  onClick={() => convertToVideo(idea)}
                >
                  Move to Tracker <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {filteredIdeas.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3 bg-muted/20 border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <Lightbulb className="h-12 w-12 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">
                  {ideas.length === 0
                    ? "Your Idea Bank is empty"
                    : "No ideas match these filters"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ideas.length === 0
                    ? "Hit AI Brainstorm to generate your first batch."
                    : "Try clearing the search or switching tabs."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Thumbnail dialog — viral strategist mode */}
      <Dialog
        open={!!thumbIdea}
        onOpenChange={(o) => !o && setThumbIdea(null)}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-purple-400" />
              AI Thumbnail Studio
              <Badge
                variant="outline"
                className="ml-1 text-[10px] gap-1 border-purple-500/40 text-purple-300"
              >
                <Zap className="h-3 w-3" /> Viral Strategist
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {thumbIdea && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative aspect-video w-full rounded-lg border border-border/60 overflow-hidden bg-gradient-to-br from-muted/40 to-muted/10 flex items-center justify-center">
                {generateThumb.isPending ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                    <p className="text-sm">
                      {thumbHd
                        ? "Cooking up HD (Nano Banana Pro)…"
                        : "Strategist + Nano Banana working…"}
                    </p>
                    <p className="text-xs opacity-70">
                      Stage 1: planning CTR. Stage 2: drawing pixels.
                    </p>
                  </div>
                ) : thumbPreview ? (
                  <img
                    src={thumbPreview}
                    alt="thumbnail preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground px-6 text-center">
                    <ImageIcon className="h-10 w-10 opacity-50" />
                    <p className="text-sm">
                      Pick a style below (optional) and hit{" "}
                      <span className="text-purple-300 font-medium">
                        Generate Smart Thumbnail
                      </span>
                      .
                    </p>
                  </div>
                )}
              </div>

              {/* Strategy chips */}
              {thumbStrategy && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-purple-300">
                    <Eye className="h-3.5 w-3.5" /> Strategy breakdown
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20">
                      Curiosity {thumbStrategy.curiosityGap}/10
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Emotion</p>
                      <p className="font-medium capitalize">
                        {thumbStrategy.emotion}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Hook word</p>
                      <p className="font-medium uppercase">
                        {thumbStrategy.hookWord}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Expression</p>
                      <p className="font-medium line-clamp-2">
                        {thumbStrategy.expression}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Focal point</p>
                      <p className="font-medium line-clamp-2">
                        {thumbStrategy.focalPoint}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      <Palette className="h-3 w-3" /> Text:
                    </span>
                    {thumbStrategy.textColors?.map((c, i) => (
                      <span
                        key={`tc-${i}`}
                        className="h-4 w-4 rounded border border-border/60"
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2">
                      BG:
                    </span>
                    {thumbStrategy.bgColors?.map((c, i) => (
                      <span
                        key={`bc-${i}`}
                        className="h-4 w-4 rounded border border-border/60"
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Overlay:{" "}
                      <span className="text-foreground font-medium">
                        “{thumbStrategy.textOverlay}”
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* Style presets */}
              <div className="space-y-1.5">
                <Label className="text-xs">Style preset (optional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {stylePresets.map((p) => {
                    const active = thumbStyle === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setThumbStyle(active ? null : p.id)
                        }
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          active
                            ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
                            : "bg-muted/40 border-border/60 text-muted-foreground hover:border-purple-500/40 hover:text-purple-300"
                        }`}
                      >
                        <span className="mr-1">{p.emoji}</span>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* HD toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">HD mode (Nano Banana Pro)</p>
                  <p className="text-xs text-muted-foreground">
                    Slower, sharper. Off = fast Nano Banana.
                  </p>
                </div>
                <Switch checked={thumbHd} onCheckedChange={setThumbHd} />
              </div>

              {/* Advanced (custom prompt) */}
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setThumbAdvancedOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Advanced — custom image prompt
                  <ChevronDown
                    className={`h-3.5 w-3.5 ml-auto transition-transform ${thumbAdvancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {thumbAdvancedOpen && (
                  <div className="p-3 pt-0 space-y-2">
                    <Textarea
                      id="thumb-prompt"
                      rows={5}
                      value={thumbPrompt}
                      onChange={(e) => setThumbPrompt(e.target.value)}
                      placeholder="Describe the exact thumbnail image you want… or hit 'Plan only' to let the strategist write it for you."
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={runStrategyOnly}
                        disabled={generateStrategy.isPending}
                        className="gap-2"
                      >
                        {generateStrategy.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        Plan only (no image)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={runManualGenerate}
                        disabled={
                          generateThumb.isPending || !thumbPrompt.trim()
                        }
                        className="gap-2"
                      >
                        {generateThumb.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        Generate from this prompt
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center pt-1">
                <div className="flex gap-2">
                  {thumbPreview && (
                    <a
                      href={thumbPreview}
                      download={`thumbnail-${thumbIdea.id}.png`}
                      className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-border/60 hover:bg-muted/50 transition-colors"
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={runSmartGenerate}
                    disabled={generateThumb.isPending}
                    className="gap-2 bg-gradient-to-br from-purple-600 to-blue-700 hover:from-purple-600/90 hover:to-blue-700/90 text-white border-0 shadow-md shadow-purple-500/30"
                  >
                    {generateThumb.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : thumbPreview ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {thumbPreview ? "Re-generate" : "Generate Smart Thumbnail"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={saveThumb}
                    disabled={!thumbPreview || generateThumb.isPending}
                    className="gap-2"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
