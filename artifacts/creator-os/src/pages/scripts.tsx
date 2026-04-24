import { useEffect, useMemo, useRef, useState } from "react";
import { useCreatorData, Script } from "@/hooks/use-creator-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useGenerateScript,
  useGenerateScriptHooks,
  useRegenerateScriptSection,
  usePolishScript,
  useRefineScript,
} from "@/lib/ai-hooks";
import type {
  ScriptHook,
  ScriptTone,
  ScriptFormat,
  SectionIntent,
} from "@/lib/gemini";
import {
  FileText,
  Save,
  Wand2,
  Plus,
  Loader2,
  Trash2,
  Sparkles,
  Sparkle,
  Clock,
  Hash,
  RotateCcw,
  Tv2,
  Copy,
  Download,
  ChevronLeft,
  Zap,
  Star,
  RefreshCw,
  ListChecks,
  Search,
  Pencil,
  Eye,
  Film,
  Mic,
  MessageSquare,
  Maximize2,
  X,
} from "lucide-react";
import { format } from "date-fns";

// ===== Helpers =====
const WORDS_PER_MINUTE = 150; // average Hindi/Hinglish narration pace

function countWords(s: string) {
  // strip cue brackets and parentheticals so they don't inflate the count
  const clean = s
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[#*_`>]/g, " ");
  return clean.trim().split(/\s+/).filter(Boolean).length;
}

function formatReadTime(words: number) {
  const totalSec = Math.round((words / WORDS_PER_MINUTE) * 60);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

type ParsedSection = {
  name: string;
  heading: string;
  body: string;
  start: number;
  end: number;
};

// Parse markdown ## headings into editable sections.
function parseSections(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let cursor = 0;

  for (const line of lines) {
    const lineLen = line.length + 1;
    if (line.startsWith("## ")) {
      if (current) {
        current.end = cursor;
        sections.push(current);
      }
      const heading = line.replace(/^##\s*/, "").trim();
      const namePart = heading.replace(/\(.*?\)/g, "").trim();
      current = {
        name: namePart || heading,
        heading: line,
        body: "",
        start: cursor,
        end: cursor + lineLen,
      };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
    cursor += lineLen;
  }
  if (current) {
    current.end = cursor;
    sections.push(current);
  }
  return sections;
}

const HOOK_STYLE_META: Record<
  ScriptHook["style"],
  { label: string; color: string; emoji: string }
> = {
  shock: {
    label: "Shock",
    color: "bg-red-500/15 text-red-300 border-red-500/30",
    emoji: "⚡",
  },
  question: {
    label: "Question",
    color: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    emoji: "❓",
  },
  story: {
    label: "Story",
    color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    emoji: "📖",
  },
  statistic: {
    label: "Statistic",
    color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    emoji: "📊",
  },
  promise: {
    label: "Promise",
    color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    emoji: "🎯",
  },
};

const SECTION_INTENTS: { value: SectionIntent; label: string; emoji: string }[] = [
  { value: "shorter", label: "Make it shorter", emoji: "✂️" },
  { value: "longer", label: "Make it longer", emoji: "📏" },
  { value: "funnier", label: "Make it funnier", emoji: "😂" },
  { value: "more_dramatic", label: "More dramatic", emoji: "🎭" },
  { value: "add_example", label: "Add an example", emoji: "💡" },
  { value: "add_broll", label: "Add B-roll cues", emoji: "🎬" },
  { value: "simplify", label: "Simplify language", emoji: "🪶" },
  { value: "more_hinglish", label: "More Hinglish flavor", emoji: "🇮🇳" },
];

// ===== Main page =====
export default function ScriptWriter() {
  const { channel, videos, scripts, setScripts } = useCreatorData();
  const { toast } = useToast();

  const generateScriptAPI = useGenerateScript();
  const generateHooksAPI = useGenerateScriptHooks();
  const regenSectionAPI = useRegenerateScriptSection();
  const polishAPI = usePolishScript();
  const refineAPI = useRefineScript();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [search, setSearch] = useState("");

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isHooksOpen, setIsHooksOpen] = useState(false);
  const [isTeleOpen, setIsTeleOpen] = useState(false);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [docMode, setDocMode] = useState<"preview" | "edit">("preview");
  const [showListOnMobile, setShowListOnMobile] = useState(true);

  // generation form state
  const [genVideoId, setGenVideoId] = useState("");
  const [genTitle, setGenTitle] = useState("");
  const [genDuration, setGenDuration] = useState("5-8 minutes");
  const [genTone, setGenTone] = useState<ScriptTone>("casual");
  const [genFormat, setGenFormat] = useState<ScriptFormat>("long");
  const [genNotes, setGenNotes] = useState("");
  const [chosenHook, setChosenHook] = useState<string>("");
  const [hookResults, setHookResults] = useState<ScriptHook[]>([]);

  const activeScript = useMemo(
    () => scripts.find((s) => s.id === activeId) ?? null,
    [scripts, activeId],
  );

  const sections = useMemo(() => parseSections(editContent), [editContent]);
  const totalWords = useMemo(() => countWords(editContent), [editContent]);
  const readTime = useMemo(() => formatReadTime(totalWords), [totalWords]);

  // sync local edit state when active script changes
  useEffect(() => {
    if (activeScript) {
      setEditTitle(activeScript.title);
      setEditContent(activeScript.content);
    }
  }, [activeScript?.id]);

  // ===== Auto-save (debounced) =====
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);

  useEffect(() => {
    if (!activeScript) return;
    const dirty =
      editTitle !== activeScript.title || editContent !== activeScript.content;
    if (!dirty) return;
    if (
      lastSavedRef.current?.title === editTitle &&
      lastSavedRef.current?.content === editContent
    ) {
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistScript(editTitle, editContent);
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTitle, editContent, activeScript?.id]);

  function persistScript(title: string, content: string) {
    if (!activeScript) return;
    const updated: Script = {
      ...activeScript,
      title,
      content,
      updatedAt: new Date().toISOString(),
    };
    setScripts(scripts.map((s) => (s.id === updated.id ? updated : s)));
    lastSavedRef.current = { title, content };
  }

  const filteredScripts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return scripts;
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [scripts, search]);

  // ===== Handlers =====
  function openScript(s: Script) {
    setActiveId(s.id);
    setEditTitle(s.title);
    setEditContent(s.content);
    setShowListOnMobile(false);
  }

  function handleCreateEmpty() {
    const newScript: Script = {
      id: Math.random().toString(36).substring(7),
      videoId: "",
      title: "Untitled Script",
      content: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setScripts([newScript, ...scripts]);
    openScript(newScript);
  }

  function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm("Delete this script? Ye permanently chala jayega.")) return;
    setScripts(scripts.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setEditTitle("");
      setEditContent("");
    }
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const video = videos.find((v) => v.id === genVideoId);
    const title = video?.title || genTitle.trim();
    if (!title) {
      toast({
        title: "Title chahiye",
        description: "Video select karo ya custom title likho.",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await generateScriptAPI.mutateAsync({
        data: {
          title,
          channelName: channel.name || "Technical White Hat",
          niche: channel.niche || "cybersecurity / ethical hacking",
          duration: genDuration,
          targetAudience: channel.description,
          language: "Hinglish (Hindi-English mix)",
          tone: genTone,
          format: genFormat,
          hookStyle: chosenHook || undefined,
          notes: genNotes.trim() || undefined,
        },
      });

      const newScript: Script = {
        id: Math.random().toString(36).substring(7),
        videoId: genVideoId,
        title: `${title} — Script`,
        content: response.script,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setScripts([newScript, ...scripts]);
      openScript(newScript);
      setIsGenerateOpen(false);
      setChosenHook("");
      setHookResults([]);
      setGenNotes("");
      toast({
        title: "Script ready 🎬",
        description: "Sectioned format me edit ya teleprompter use karo.",
      });
    } catch {
      toast({
        title: "Generation fail",
        description: "Kuch galat ho gaya, dobara try karo.",
        variant: "destructive",
      });
    }
  }

  async function handleHookGenerate() {
    const video = videos.find((v) => v.id === genVideoId);
    const title = video?.title || genTitle.trim();
    if (!title) {
      toast({
        title: "Pehle title do",
        description: "Hook generate karne ke liye title chahiye.",
        variant: "destructive",
      });
      return;
    }
    try {
      const r = await generateHooksAPI.mutateAsync({
        data: {
          title,
          channelName: channel.name || "Technical White Hat",
          niche: channel.niche || "cybersecurity",
          audience: channel.description,
        },
      });
      setHookResults(r.hooks ?? []);
      setIsHooksOpen(true);
    } catch {
      toast({
        title: "Hook generation fail",
        variant: "destructive",
      });
    }
  }

  async function handlePolish() {
    if (!activeScript || !editContent.trim()) return;
    try {
      const r = await polishAPI.mutateAsync({
        data: {
          script: editContent,
          videoTitle: editTitle,
          niche: channel.niche || "cybersecurity",
        },
      });
      setEditContent(r.script);
      persistScript(editTitle, r.script);
      toast({
        title: "Script polish ho gayi ✨",
        description:
          (r.changes ?? []).slice(0, 3).join(" • ") || "AI ne improvements add ki.",
      });
    } catch {
      toast({ title: "Polish fail", variant: "destructive" });
    }
  }

  async function handleRefine() {
    if (!activeScript || !editContent.trim() || !refineInstruction.trim()) return;
    try {
      const r = await refineAPI.mutateAsync({
        data: {
          script: editContent,
          instruction: refineInstruction.trim(),
          videoTitle: editTitle,
          niche: channel.niche || "cybersecurity",
        },
      });
      setEditContent(r.script);
      persistScript(editTitle, r.script);
      setIsRefineOpen(false);
      setRefineInstruction("");
      toast({
        title: "Script refined ✨",
        description: "AI ne tumhare instruction ke hisaab se rewrite kar diya.",
      });
    } catch {
      toast({ title: "Refine fail", variant: "destructive" });
    }
  }

  async function handleRegenSection(section: ParsedSection, intent: SectionIntent) {
    if (!activeScript) return;
    try {
      const r = await regenSectionAPI.mutateAsync({
        data: {
          fullScript: editContent,
          sectionName: section.name,
          sectionContent: `${section.heading}\n${section.body}`,
          intent,
          videoTitle: editTitle,
          niche: channel.niche || "cybersecurity",
        },
      });
      const before = editContent.slice(0, section.start);
      const after = editContent.slice(section.end);
      const newSection = r.content.endsWith("\n") ? r.content : r.content + "\n";
      const next = before + newSection + after;
      setEditContent(next);
      persistScript(editTitle, next);
      toast({
        title: `${section.name} updated`,
        description: SECTION_INTENTS.find((i) => i.value === intent)?.label,
      });
    } catch {
      toast({
        title: "Regenerate fail",
        variant: "destructive",
      });
    }
  }

  function handleCopyAll() {
    if (!editContent) return;
    navigator.clipboard.writeText(editContent);
    toast({ title: "Copied", description: "Pura script clipboard me copy ho gaya." });
  }

  function handleDownload() {
    if (!editContent) return;
    const blob = new Blob([editContent], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${editTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "script"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ===== Render =====
  return (
    <div className="space-y-4 md:space-y-6 h-[calc(100vh-100px)] flex flex-col">
      {/* Hero — fuchsia → pink */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-fuchsia-500/15 via-pink-600/10 to-transparent p-4 sm:p-6 shrink-0">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-fuchsia-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-pink-600/20 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-fuchsia-500/30 shrink-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Script Writer
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                AI tumhari Hinglish style me script likhega — hook, B-roll cues, retention hacks sab automatic.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleCreateEmpty}
              className="gap-2 border-fuchsia-500/40 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/10"
              size="sm"
            >
              <Plus className="h-4 w-4" /> Blank
            </Button>

            <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-2 bg-gradient-to-br from-fuchsia-500 to-pink-600 hover:from-fuchsia-500/90 hover:to-pink-600/90 text-white border-0 shadow-md shadow-fuchsia-500/30"
                >
                  <Wand2 className="h-4 w-4" /> AI Generate
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  Generate Script with AI
                </DialogTitle>
                <DialogDescription>
                  Trained on your "Content Creation R1.03" framework — Hinglish, hook-first, with B-roll & vocal cues.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleGenerate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Video</Label>
                  <Select value={genVideoId} onValueChange={setGenVideoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose tracked video (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {videos.length === 0 && (
                        <SelectItem value="__none" disabled>
                          No tracked videos — type custom title below
                        </SelectItem>
                      )}
                      {videos.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Or write a custom title…"
                    value={genTitle}
                    onChange={(e) => setGenTitle(e.target.value)}
                    disabled={!!genVideoId}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select
                      value={genTone}
                      onValueChange={(v) => setGenTone(v as ScriptTone)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="casual">😎 Casual / Dost-style</SelectItem>
                        <SelectItem value="educational">📚 Educational</SelectItem>
                        <SelectItem value="dramatic">🎭 Dramatic / Suspense</SelectItem>
                        <SelectItem value="mrbeast">🚀 MrBeast-style</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select
                      value={genFormat}
                      onValueChange={(v) => setGenFormat(v as ScriptFormat)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long">🎥 Long-form</SelectItem>
                        <SelectItem value="short">⚡ Short / Reel</SelectItem>
                        <SelectItem value="tutorial">🛠️ Tutorial</SelectItem>
                        <SelectItem value="story">📖 Story-driven</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Target duration</Label>
                  <Select value={genDuration} onValueChange={setGenDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Under 1 minute (Shorts)">
                        Under 1 min (Shorts)
                      </SelectItem>
                      <SelectItem value="3-5 minutes">3-5 minutes</SelectItem>
                      <SelectItem value="5-8 minutes">5-8 minutes</SelectItem>
                      <SelectItem value="10+ minutes">10+ minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hook generator */}
                <div className="space-y-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-purple-400" />
                      Hook (opening line)
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-purple-300 hover:text-purple-200 hover:bg-purple-500/10"
                      onClick={handleHookGenerate}
                      disabled={generateHooksAPI.isPending}
                    >
                      {generateHooksAPI.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkle className="h-3 w-3" />
                      )}
                      Generate 5 hooks
                    </Button>
                  </div>
                  {chosenHook ? (
                    <div className="text-xs p-2 rounded-md bg-background/40 border border-purple-500/20 flex items-start justify-between gap-2">
                      <span className="leading-relaxed">"{chosenHook}"</span>
                      <button
                        type="button"
                        onClick={() => setChosenHook("")}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Optional — AI khud likhega agar tum nahi chunte.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Key points to cover (optional)</Label>
                  <Textarea
                    rows={3}
                    placeholder="e.g. Phishing kaise detect kare, do live examples, ek free tool bata"
                    value={genNotes}
                    onChange={(e) => setGenNotes(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 bg-gradient-to-br from-purple-500 to-sky-500 hover:from-purple-500/90 hover:to-sky-500/90 text-white border-0"
                  disabled={generateScriptAPI.isPending}
                >
                  {generateScriptAPI.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Generate Full Script
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {/* Body — responsive layout */}
      <div className="flex flex-1 gap-4 md:gap-6 min-h-0">
        {/* List pane */}
        <div
          className={`${
            showListOnMobile ? "flex" : "hidden"
          } md:flex w-full md:w-72 lg:w-80 flex-col gap-3 shrink-0 min-h-0`}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scripts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {filteredScripts.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
                {search ? "No matches." : "No scripts yet. Tap AI Generate."}
              </div>
            ) : (
              filteredScripts.map((script) => {
                const wc = countWords(script.content);
                const isActive = activeId === script.id;
                return (
                  <Card
                    key={script.id}
                    className={`cursor-pointer transition-all hover:border-purple-500/40 ${
                      isActive
                        ? "border-purple-500/60 bg-purple-500/5 shadow-[0_0_0_1px_rgba(168,85,247,0.2)]"
                        : ""
                    }`}
                    onClick={() => openScript(script)}
                  >
                    <CardHeader className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-sm line-clamp-2 leading-snug">
                            {script.title}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Hash className="h-2.5 w-2.5" />
                              {wc} words
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatReadTime(wc)}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {format(new Date(script.updatedAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 -mt-1 -mr-1 shrink-0"
                          onClick={(e) => handleDelete(script.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Editor pane */}
        <div
          className={`${
            showListOnMobile ? "hidden" : "flex"
          } md:flex flex-1 flex-col gap-3 min-h-0`}
        >
          {activeScript ? (
            <>
              {/* Editor toolbar */}
              <Card className="shrink-0">
                <div className="flex items-center gap-2 p-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8"
                    onClick={() => setShowListOnMobile(true)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-semibold text-base sm:text-lg border-none hover:bg-muted/50 focus-visible:ring-0 px-2 flex-1 min-w-0"
                  />

                  {/* Stats */}
                  <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                    <Badge variant="outline" className="gap-1">
                      <Hash className="h-3 w-3" />
                      {totalWords}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {readTime}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <ListChecks className="h-3 w-3" />
                      {sections.length} sections
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 pb-3 flex-wrap border-t border-border/50 pt-3">
                  {/* View mode toggle */}
                  <div className="flex rounded-md border border-border/60 p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setDocMode("preview")}
                      className={`px-2.5 py-1 text-xs rounded inline-flex items-center gap-1 transition-colors ${
                        docMode === "preview"
                          ? "bg-background shadow text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Eye className="h-3 w-3" /> Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocMode("edit")}
                      className={`px-2.5 py-1 text-xs rounded inline-flex items-center gap-1 transition-colors ${
                        docMode === "edit"
                          ? "bg-background shadow text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>

                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-gradient-to-br from-purple-500 to-sky-500 hover:from-purple-500/90 hover:to-sky-500/90 text-white border-0"
                    onClick={() => setIsRefineOpen(true)}
                    disabled={!editContent.trim()}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Refine with AI
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={handlePolish}
                    disabled={polishAPI.isPending || !editContent.trim()}
                  >
                    {polishAPI.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    )}
                    Polish
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setIsFullscreenOpen(true)}
                    disabled={!editContent.trim()}
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-sky-400" />
                    Fullscreen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setIsTeleOpen(true)}
                    disabled={!editContent.trim()}
                  >
                    <Tv2 className="h-3.5 w-3.5 text-emerald-400" />
                    Teleprompter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={handleCopyAll}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={handleDownload}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 ml-auto"
                    onClick={() => persistScript(editTitle, editContent)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
                {/* Mobile-only stats */}
                <div className="flex md:hidden items-center gap-2 px-3 pb-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {totalWords} words
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {readTime}
                  </span>
                  <span>•</span>
                  <span>{sections.length} sections</span>
                </div>
              </Card>

              {/* Single continuous document */}
              <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {docMode === "edit" ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder={`Start writing your script…\n\nTip: use ## SECTION NAME (mm:ss – mm:ss) headings to break it into sections.\nUse [B-ROLL: ...], (pause), [POPUP: ...], [PATTERN BREAK: ...] for production cues.`}
                    className="flex-1 resize-none border-0 focus-visible:ring-0 p-4 sm:p-6 text-[15px] leading-relaxed font-mono bg-transparent"
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-8">
                    {editContent.trim() ? (
                      <ScriptDocument
                        content={editContent}
                        sections={sections}
                        regenPendingSection={
                          regenSectionAPI.isPending
                            ? regenSectionAPI.variables?.data.sectionName ?? null
                            : null
                        }
                        onRegenerate={handleRegenSection}
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2">
                        <FileText className="h-10 w-10 opacity-40" />
                        <p className="text-sm">
                          Empty script. Switch to <strong>Edit</strong> mode ya AI Generate karo.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed rounded-lg text-center space-y-4 p-6">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500/15 to-sky-500/15 border border-purple-500/30 flex items-center justify-center">
                <FileText className="h-8 w-8 text-purple-300" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">No script open</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Left side se ek script choose karo, ya AI Generate par tap karke nayi banao.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-br from-purple-500 to-sky-500 text-white border-0"
                onClick={() => setIsGenerateOpen(true)}
              >
                <Wand2 className="h-4 w-4" /> Generate one
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Hooks dialog */}
      <Dialog open={isHooksOpen} onOpenChange={setIsHooksOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-400" />
              5 Hook Variations
            </DialogTitle>
            <DialogDescription>
              Sabse strong hook chuno — wahi pehle 15 seconds me viewer ko rok lega.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {hookResults
              .slice()
              .sort((a, b) => b.curiosityScore - a.curiosityScore)
              .map((h, idx) => {
                const meta = HOOK_STYLE_META[h.style];
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-border/60 hover:bg-muted/30 transition-colors p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${meta.color}`}
                          >
                            {meta.emoji} {meta.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-1 bg-amber-500/10 border-amber-500/30 text-amber-300"
                          >
                            <Star className="h-2.5 w-2.5 fill-current" />
                            {h.curiosityScore}/10
                          </Badge>
                        </div>
                        <p className="font-medium text-sm leading-snug">
                          "{h.hook}"
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {h.reasoning}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          setChosenHook(h.hook);
                          setIsHooksOpen(false);
                        }}
                        className="gap-1 shrink-0 bg-gradient-to-br from-purple-500 to-sky-500 hover:from-purple-500/90 hover:to-sky-500/90 text-white border-0"
                      >
                        <Plus className="h-3.5 w-3.5" /> Use
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Refine dialog */}
      <Dialog open={isRefineOpen} onOpenChange={setIsRefineOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-400" />
              Refine with AI
            </DialogTitle>
            <DialogDescription>
              Bata kya change karna hai — AI poora script us hisaab se rewrite kar dega.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              placeholder='e.g. "Hook aur strong banao", "Intro chhota karo", "Har section me ek real example add karo", "Tone aur dramatic karo"'
              className="min-h-[100px]"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                "Hook aur strong banao",
                "Intro chhota karo",
                "Har section me ek example add karo",
                "Tone aur dramatic banao",
                "More Hinglish flavor",
                "Add more B-roll cues",
                "CTA aur creative banao",
                "Pura script tighter karo",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRefineInstruction(s)}
                  className="text-[11px] px-2 py-1 rounded-full border border-border/60 hover:bg-muted/50 hover:border-purple-500/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <Button
              onClick={handleRefine}
              disabled={refineAPI.isPending || !refineInstruction.trim()}
              className="w-full gap-2 bg-gradient-to-br from-purple-500 to-sky-500 hover:from-purple-500/90 hover:to-sky-500/90 text-white border-0"
            >
              {refineAPI.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Refine Script
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen reader */}
      <FullscreenReaderDialog
        open={isFullscreenOpen}
        onOpenChange={setIsFullscreenOpen}
        title={editTitle}
        content={editContent}
        sections={sections}
        totalWords={totalWords}
        readTime={readTime}
      />

      {/* Teleprompter */}
      <TeleprompterDialog
        open={isTeleOpen}
        onOpenChange={setIsTeleOpen}
        title={editTitle}
        content={editContent}
      />
    </div>
  );
}

// ===== Cue type detection =====
type CueKind = "broll" | "popup" | "pattern" | "curiosity" | "sfx" | "generic";
function detectCue(label: string): CueKind {
  const l = label.toLowerCase().trim();
  if (l.startsWith("b-roll") || l.startsWith("broll") || l.startsWith("visual"))
    return "broll";
  if (l.startsWith("popup") || l.startsWith("text overlay") || l.startsWith("on-screen"))
    return "popup";
  if (l.startsWith("pattern")) return "pattern";
  if (l.startsWith("curiosity")) return "curiosity";
  if (l.startsWith("sfx") || l.startsWith("sound") || l.startsWith("music"))
    return "sfx";
  return "generic";
}

const CUE_META: Record<
  CueKind,
  { label: string; color: string; icon: typeof Film }
> = {
  broll: {
    label: "B-ROLL",
    color: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    icon: Film,
  },
  popup: {
    label: "POPUP",
    color: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: MessageSquare,
  },
  pattern: {
    label: "PATTERN BREAK",
    color: "border-pink-500/40 bg-pink-500/10 text-pink-300",
    icon: Zap,
  },
  curiosity: {
    label: "CURIOSITY LOOP",
    color: "border-purple-500/40 bg-purple-500/10 text-purple-300",
    icon: Sparkles,
  },
  sfx: {
    label: "SFX",
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: Mic,
  },
  generic: {
    label: "CUE",
    color: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    icon: Sparkle,
  },
};

// Render a single line of script body — splits cues into chips, narration into prose.
function renderLine(line: string, idx: number) {
  const trimmed = line.trim();
  if (!trimmed) return <div key={idx} className="h-2" />;

  // Whole line is a single bracketed cue → big chip block
  const fullCueMatch = trimmed.match(/^`?\[([^\]]+)\]`?$/);
  if (fullCueMatch) {
    const inner = fullCueMatch[1];
    const colonIdx = inner.indexOf(":");
    const labelText = colonIdx > 0 ? inner.slice(0, colonIdx) : inner;
    const valueText = colonIdx > 0 ? inner.slice(colonIdx + 1).trim() : "";
    const kind = detectCue(labelText);
    const meta = CUE_META[kind];
    const Icon = meta.icon;
    return (
      <div
        key={idx}
        className={`my-2 flex items-start gap-2 rounded-lg border px-3 py-2 ${meta.color}`}
      >
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-xs leading-relaxed">
          <span className="font-semibold tracking-wide uppercase text-[10px] mr-1.5 opacity-80">
            {labelText.trim()}
          </span>
          {valueText && <span className="opacity-95">{valueText}</span>}
        </div>
      </div>
    );
  }

  // Otherwise: prose line with possible inline cues + parentheticals
  const parts: React.ReactNode[] = [];
  // Split by inline brackets and parentheticals while keeping them.
  const tokens = trimmed.split(/(`?\[[^\]]+\]`?|\([^)]+\))/g);
  tokens.forEach((tok, i) => {
    if (!tok) return;
    const bracketMatch = tok.match(/^`?\[([^\]]+)\]`?$/);
    if (bracketMatch) {
      const inner = bracketMatch[1];
      const colonIdx = inner.indexOf(":");
      const labelText = colonIdx > 0 ? inner.slice(0, colonIdx) : inner;
      const valueText = colonIdx > 0 ? inner.slice(colonIdx + 1).trim() : "";
      const kind = detectCue(labelText);
      const meta = CUE_META[kind];
      const Icon = meta.icon;
      parts.push(
        <span
          key={i}
          className={`mx-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-[10px] font-medium ${meta.color}`}
        >
          <Icon className="h-2.5 w-2.5" />
          <span className="opacity-90 uppercase tracking-wide">
            {labelText.trim()}
          </span>
          {valueText && (
            <span className="font-normal normal-case opacity-95">
              : {valueText}
            </span>
          )}
        </span>,
      );
      return;
    }
    const parenMatch = tok.match(/^\(([^)]+)\)$/);
    if (parenMatch) {
      parts.push(
        <span
          key={i}
          className="mx-1 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[10px] italic text-emerald-300"
        >
          <Mic className="h-2.5 w-2.5" />
          {parenMatch[1].trim()}
        </span>,
      );
      return;
    }
    // plain prose — render bold **x** support
    const boldSplit = tok.split(/(\*\*[^*]+\*\*)/g);
    boldSplit.forEach((seg, j) => {
      if (!seg) return;
      const b = seg.match(/^\*\*([^*]+)\*\*$/);
      if (b) {
        parts.push(
          <strong key={`${i}-${j}`} className="font-semibold text-foreground">
            {b[1]}
          </strong>,
        );
      } else {
        parts.push(<span key={`${i}-${j}`}>{seg}</span>);
      }
    });
  });

  return (
    <p key={idx} className="leading-relaxed text-foreground/90">
      {parts}
    </p>
  );
}

function ScriptSectionPreview({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-1.5 text-[15px] leading-relaxed">
      {lines.map((line, i) => renderLine(line, i))}
    </div>
  );
}

// ===== Continuous Script Document =====
function ScriptDocument({
  content,
  sections,
  regenPendingSection,
  onRegenerate,
}: {
  content: string;
  sections: ParsedSection[];
  regenPendingSection: string | null;
  onRegenerate: (section: ParsedSection, intent: SectionIntent) => void;
}) {
  // If no `## ` headings, render the whole content as one prose block.
  if (sections.length === 0) {
    return (
      <article className="max-w-3xl mx-auto">
        <ScriptSectionPreview body={content} />
      </article>
    );
  }

  // Render: [pre-section preamble (if any)] + each section with heading + body
  const preamble = content.slice(0, sections[0].start).trim();

  return (
    <article className="max-w-3xl mx-auto space-y-6">
      {preamble && (
        <div className="pb-4 border-b border-border/40">
          <ScriptSectionPreview body={preamble} />
        </div>
      )}
      {sections.map((sec, idx) => {
        const heading = sec.heading.replace(/^##\s*/, "");
        const headMatch = heading.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        const headName = headMatch ? headMatch[1].trim() : heading;
        const headTime = headMatch ? headMatch[2].trim() : null;
        const wc = countWords(sec.body);
        const isPending = regenPendingSection === sec.name;

        return (
          <section
            key={`${sec.start}-${idx}`}
            className="scroll-mt-4 group"
            id={`section-${idx}`}
          >
            <header className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-purple-500/20">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h2 className="text-base sm:text-lg font-bold tracking-wide uppercase text-purple-300">
                  {headName}
                </h2>
                {headTime && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-purple-500/30 bg-purple-500/10 text-purple-200"
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {headTime}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Hash className="h-2.5 w-2.5" />
                  {wc}
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {formatReadTime(wc)}
                </Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs opacity-60 group-hover:opacity-100 transition-opacity"
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 text-purple-400" />
                    )}
                    <span className="hidden sm:inline">Regenerate</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Regenerate this section as…</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SECTION_INTENTS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => onRegenerate(sec, opt.value)}
                    >
                      <span className="mr-2">{opt.emoji}</span>
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <ScriptSectionPreview body={sec.body} />
          </section>
        );
      })}
    </article>
  );
}

// (Legacy single-section editor — kept for potential future use, not currently rendered)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _SectionEditorLegacy({
  section,
  onChange,
  onRegenerate,
  isPending,
}: {
  section: ParsedSection;
  onChange: (newBody: string) => void;
  onRegenerate: (intent: SectionIntent) => void;
  isPending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const wc = countWords(section.body);
  const heading = section.heading.replace(/^##\s*/, "");

  // Try to split heading into name + (timestamp)
  const headMatch = heading.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const headName = headMatch ? headMatch[1].trim() : heading;
  const headTime = headMatch ? headMatch[2].trim() : null;

  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="p-3 sm:p-4 border-b border-border/50 bg-gradient-to-r from-purple-500/5 to-transparent flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm font-bold tracking-wide uppercase text-purple-300 line-clamp-1">
              {headName}
            </CardTitle>
            {headTime && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 border-purple-500/30 bg-purple-500/10 text-purple-200"
              >
                <Clock className="h-2.5 w-2.5" />
                {headTime}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] gap-1">
              <Hash className="h-2.5 w-2.5" />
              {wc}
            </Badge>
            <Badge variant="outline" className="text-[10px] gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatReadTime(wc)}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 text-purple-400" />
                )}
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Regenerate this section as…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SECTION_INTENTS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => onRegenerate(opt.value)}
                >
                  <span className="mr-2">{opt.emoji}</span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {editing ? (
          <Textarea
            value={section.body}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[180px] resize-y border-0 focus-visible:ring-0 p-4 sm:p-5 text-sm leading-relaxed font-mono bg-transparent"
            autoFocus
          />
        ) : (
          <div
            className="p-4 sm:p-5 cursor-text"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            {section.body.trim() ? (
              <ScriptSectionPreview body={section.body} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Empty section — click Edit to add content.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== Fullscreen reader =====
function FullscreenReaderDialog({
  open,
  onOpenChange,
  title,
  content,
  sections,
  totalWords,
  readTime,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  content: string;
  sections: ParsedSection[];
  totalWords: number;
  readTime: string;
}) {
  const [zoom, setZoom] = useState(17);
  const [showCues, setShowCues] = useState(true);

  // Strip cue brackets + parentheticals + markdown when "narration only" is on.
  const filteredContent = useMemo(() => {
    if (showCues) return content;
    return content
      .replace(/`?\[[^\]]*\]`?/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\s{2,}/g, " ");
  }, [content, showCues]);

  const filteredSections = useMemo(
    () => parseSections(filteredContent),
    [filteredContent],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none w-screen h-[100dvh] sm:h-screen p-0 gap-0 rounded-none border-0 sm:rounded-none flex flex-col">
        <span className="sr-only">
          <DialogTitle>Fullscreen reader</DialogTitle>
        </span>
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-border/60 bg-background/95 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 flex-wrap pr-8">
            <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 min-w-0 flex-1">
              <Maximize2 className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="truncate">{title || "Untitled Script"}</span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
              <Badge variant="outline" className="gap-1">
                <Hash className="h-3 w-3" />
                {totalWords}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {readTime}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <ListChecks className="h-3 w-3" />
                {sections.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowCues((v) => !v)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                  showCues
                    ? "border-purple-500/40 bg-purple-500/10 text-purple-200"
                    : "border-border/60 text-muted-foreground hover:bg-muted/40"
                }`}
                title="Toggle B-roll / cues"
              >
                {showCues ? "Cues ON" : "Cues OFF"}
              </button>
              <div className="hidden sm:flex items-center gap-1.5 px-2 border-l border-border/60 ml-1 pl-2">
                <span className="text-[10px] text-muted-foreground">Size</span>
                <input
                  type="range"
                  min={13}
                  max={28}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="accent-sky-400 w-20"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">
                  {zoom}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background to-background/60">
          <div
            className="max-w-3xl mx-auto px-5 sm:px-10 py-8 sm:py-12"
            style={{ fontSize: zoom }}
          >
            {filteredContent.trim() ? (
              <ScriptDocument
                content={filteredContent}
                sections={filteredSections}
                regenPendingSection={null}
                onRegenerate={() => {}}
              />
            ) : (
              <p className="text-center text-muted-foreground py-20">
                Empty script.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== Teleprompter =====
function TeleprompterDialog({
  open,
  onOpenChange,
  title,
  content,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  content: string;
}) {
  const [speed, setSpeed] = useState(40); // px / sec
  const [fontSize, setFontSize] = useState(28);
  const [playing, setPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [open]);

  useEffect(() => {
    if (!playing) return;
    function tick(ts: number) {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += speed * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
          setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, [playing, speed]);

  // Strip cue brackets so reader sees clean prose only.
  const cleanContent = useMemo(
    () =>
      content
        .replace(/\[[^\]]*\]/g, "")
        .replace(/^##\s*/gm, "\n— ")
        .trim(),
    [content],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <Tv2 className="h-5 w-5 text-emerald-400" />
            Teleprompter — {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/50 text-xs">
          <Button
            size="sm"
            onClick={() => setPlaying((p) => !p)}
            className={`gap-1.5 ${
              playing
                ? "bg-red-500 hover:bg-red-500/90"
                : "bg-emerald-500 hover:bg-emerald-500/90"
            } text-white border-0`}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = 0;
              setPlaying(false);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Speed</span>
            <input
              type="range"
              min={10}
              max={120}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="accent-emerald-400"
            />
            <span className="font-mono w-10 text-right">{speed}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Font</span>
            <input
              type="range"
              min={16}
              max={56}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="accent-emerald-400"
            />
            <span className="font-mono w-10 text-right">{fontSize}</span>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 sm:p-12 bg-black/40"
        >
          <div
            className="max-w-3xl mx-auto whitespace-pre-wrap leading-relaxed text-foreground"
            style={{ fontSize, lineHeight: 1.6 }}
          >
            {cleanContent || "Empty script."}
            <div className="h-[40vh]" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
