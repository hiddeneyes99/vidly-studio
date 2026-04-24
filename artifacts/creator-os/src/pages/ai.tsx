import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useCreatorData,
  type BrandDefaults,
} from "@/hooks/use-creator-data";
import { useChatData } from "@/hooks/use-chat-data";
import { extractMemoriesFromTurn, type ChatAttachment } from "@/lib/gemini";
import { fetchVideoComments, type YouTubeComment } from "@/lib/youtube";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useGenerateTitlesV2,
  useGenerateDescriptionV2,
  useGenerateWeeklyPlanV2,
  useChatWithMemory,
  useGenerateConversationTitle,
  useGenerateThumbnail,
  useGenerateThumbnailStrategy,
  useScoreThumbnails,
} from "@/lib/ai-hooks";
import {
  type TitleVariant,
  type DescriptionV2,
  type WeeklyPlanV2,
  type ThumbnailStrategy,
  type ThumbnailStylePreset,
  type ThumbnailScore,
} from "@/lib/gemini";
import {
  Wand2,
  Loader2,
  Copy,
  FileText,
  Hash,
  Calendar,
  MessageSquare,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Crown,
  TrendingUp,
  Send,
  Eye,
  Clock,
  AlertCircle,
  PanelLeft,
  Database,
  ArrowDown,
  X,
  Paperclip,
  Brain,
  FileIcon,
  Image as ImageIcon,
  Palette,
  Zap,
  Sliders,
  ChevronDown,
  RefreshCw,
  Download,
  Trophy,
  Trash,
  Upload,
  Crosshair,
  ScanEye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ============ Helpers ============
const TRIGGER_META: Record<string, { color: string; emoji: string }> = {
  curiosity: { color: "bg-purple-500/15 text-purple-300 border-purple-500/30", emoji: "🧐" },
  fear: { color: "bg-red-500/15 text-red-300 border-red-500/30", emoji: "⚠️" },
  greed: { color: "bg-amber-500/15 text-amber-300 border-amber-500/30", emoji: "💰" },
  social_proof: { color: "bg-sky-500/15 text-sky-300 border-sky-500/30", emoji: "👥" },
  urgency: { color: "bg-orange-500/15 text-orange-300 border-orange-500/30", emoji: "⏰" },
  identity: { color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", emoji: "🪪" },
};

function highlightPowerWords(title: string, powerWords: string[]) {
  if (!powerWords?.length) return title;
  const re = new RegExp(`\\b(${powerWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  const parts = title.split(re);
  return parts.map((p, i) => {
    const isPower = powerWords.some((w) => w.toLowerCase() === p.toLowerCase());
    return isPower ? (
      <strong key={i} className="text-amber-300 font-bold">{p}</strong>
    ) : (
      <span key={i}>{p}</span>
    );
  });
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  const tone =
    value >= 8 ? "bg-emerald-400" : value >= 6 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buildSocialBlock(b: BrandDefaults) {
  const lines = [
    "🌐 Follow Me on Social Media:",
    "",
    b.socialLinks.youtube ? `🎥 YouTube: ${b.socialLinks.youtube}` : "",
    b.socialLinks.instagram ? `📸 Instagram: ${b.socialLinks.instagram}` : "",
    b.socialLinks.telegram ? `💬 Telegram Community: ${b.socialLinks.telegram}` : "",
    b.socialLinks.twitter ? `🐦 Twitter: ${b.socialLinks.twitter}` : "",
    b.socialLinks.facebook ? `📘 Facebook: ${b.socialLinks.facebook}` : "",
    "",
    "💼.......... BUSINESS REQUEST ..........💼",
    "",
    `Ⓜ ${b.businessTagline} 👌`,
    b.businessEmail ? `📩 ${b.businessEmail}` : "",
    b.signOffLine ? `\n${b.signOffLine}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function assembleDescription(d: DescriptionV2, brand: BrandDefaults): string {
  const chapters = d.chapters.map((c) => `${c.time} - ${c.title}`).join("\n");
  const hashtagLine = d.hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h.replace(/^#?/, "")}`))
    .join(" ");
  return [
    d.hook,
    "",
    d.body,
    "",
    "⏱️ CHAPTERS:",
    chapters,
    "",
    `👉 ${d.ctas.subscribe}`,
    `💬 ${d.ctas.comment}`,
    `👍 ${d.ctas.like}`,
    "",
    buildSocialBlock(brand),
    "",
    hashtagLine,
  ].join("\n");
}

// ============ Chat sub-components ============

const SETUP_SQL = `-- Run this once in your Supabase SQL Editor
create table if not exists public.chat_conversations (
  id text primary key,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_conversations_updated_at_idx
  on public.chat_conversations (updated_at desc);

create table if not exists public.chat_messages (
  id text primary key,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages       enable row level security;

create policy "anon read"   on public.chat_conversations for select using (true);
create policy "anon insert" on public.chat_conversations for insert with check (true);
create policy "anon update" on public.chat_conversations for update using (true) with check (true);
create policy "anon delete" on public.chat_conversations for delete using (true);

create policy "anon read"   on public.chat_messages for select using (true);
create policy "anon insert" on public.chat_messages for insert with check (true);
create policy "anon update" on public.chat_messages for update using (true) with check (true);
create policy "anon delete" on public.chat_messages for delete using (true);

-- Cross-conversation memory (facts about user/channel)
create table if not exists public.chat_memories (
  id text primary key,
  content text not null,
  category text,
  importance int not null default 5,
  created_at timestamptz not null default now()
);
create index if not exists chat_memories_created_at_idx
  on public.chat_memories (created_at desc);

alter table public.chat_memories enable row level security;

create policy "anon read"   on public.chat_memories for select using (true);
create policy "anon insert" on public.chat_memories for insert with check (true);
create policy "anon update" on public.chat_memories for update using (true) with check (true);
create policy "anon delete" on public.chat_memories for delete using (true);
`;

function ChatTablesSetup() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(SETUP_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    toast({ title: "SQL copied" });
  };
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-amber-400" />
          Chat ke liye ek baar Supabase setup karna hai
        </CardTitle>
        <CardDescription>
          Naye design me chat ek alag table me save hoti hai (taaki Supabase me clean dikhe).
          Ye SQL apne Supabase dashboard → SQL Editor me run kar do — bas ek baar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="text-[11px] sm:text-xs bg-background/60 border border-border/60 rounded-md p-3 overflow-x-auto leading-relaxed max-h-[280px]">
          <code>{SETUP_SQL.trim()}</code>
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCopy} size="sm" className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy SQL"}
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a
              href="https://supabase.com/dashboard/project/_/sql/new"
              target="_blank"
              rel="noreferrer"
            >
              Open Supabase SQL Editor
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.location.reload()}
          >
            Reload after running
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tables ban jaane ke baad page reload karo — purani chat (agar koi thi)
          automatically migrate ho jayegi.
        </p>
      </CardContent>
    </Card>
  );
}

type ConvSidebarProps = {
  conversations: { id: string; title: string; updatedAt: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
};

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: ConvSidebarProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-3 border-b border-border/60">
        <Button onClick={onNewChat} size="sm" className="w-full gap-1.5">
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-3">
            Koi conversation nahi. New chat se shuru karo — sab kuch DB me save hota hai,
            AI ko sab yaad rahega.
          </p>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeId;
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer text-sm ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-muted/40 active:bg-muted/60"
              }`}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate flex-1">{c.title}</span>
              <button
                type="button"
                className="md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ Page ============
export default function AiStudio() {
  const {
    channel,
    videos,
    goals,
    ideas,
    scripts,
    schedule,
    recentYouTubeVideos,
    chatConversations: legacyConvs,
    chatMessages: legacyMsgs,
    brandDefaults,
  } = useCreatorData();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Chat data lives in dedicated Supabase tables (chat_conversations / chat_messages)
  const {
    status: chatStatus,
    conversations: chatConversations,
    messages: chatMessages,
    memories: chatMemories,
    createConversation: createChatConversation,
    deleteConversation: deleteChatConversation,
    touchConversation: touchChatConversation,
    renameConversation: renameChatConversation,
    addMessage: addChatMessage,
    addMemory: addChatMemory,
    deleteMemory: deleteChatMemory,
  } = useChatData({ conversations: legacyConvs, messages: legacyMsgs });

  // Generators
  const generateTitles = useGenerateTitlesV2();
  const generateDescription = useGenerateDescriptionV2();
  const generateWeeklyPlan = useGenerateWeeklyPlanV2();
  const chatMutation = useChatWithMemory();
  const titleMutation = useGenerateConversationTitle();

  // Results
  const [titleResult, setTitleResult] = useState<{
    titles: TitleVariant[];
    topPicks: { title: string; reason: string }[];
    overallNotes: string;
  } | null>(null);
  const [descResult, setDescResult] = useState<DescriptionV2 | null>(null);
  const [planResult, setPlanResult] = useState<WeeklyPlanV2 | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
    toast({ title: "Copied" });
  };

  // ===== Titles =====
  const handleGenTitles = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await generateTitles.mutateAsync({
        data: {
          concept: fd.get("concept") as string,
          channelName: channel.name,
          niche: channel.niche,
          language: (fd.get("language") as string) || "Hinglish",
          audience: channel.audiencePersona?.oneLineSummary,
        },
      });
      // mark top picks
      const topSet = new Set(res.topPicks.map((t) => t.title));
      const reasonMap = new Map(res.topPicks.map((t) => [t.title, t.reason]));
      const enriched = res.titles.map((t) => ({
        ...t,
        isTopPick: topSet.has(t.title),
        topPickReason: reasonMap.get(t.title),
      }));
      setTitleResult({ ...res, titles: enriched });
      toast({ title: "10 titles generated" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  // ===== Description =====
  const [descTitleInput, setDescTitleInput] = useState("");
  const [descConceptInput, setDescConceptInput] = useState("");
  const handleGenDesc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!descTitleInput.trim()) return;
    try {
      const res = await generateDescription.mutateAsync({
        data: {
          title: descTitleInput,
          concept: descConceptInput || undefined,
          channelName: channel.name,
          niche: channel.niche,
          language: "Hinglish",
          audience: channel.audiencePersona?.oneLineSummary,
        },
      });
      setDescResult(res.description);
      toast({ title: "Description ready" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  // ===== Weekly Plan =====
  const handleGenPlan = async () => {
    try {
      const pendingIdeas = ideas.map((i) => ({ title: i.title, type: i.type }));
      const readyScripts = scripts
        .filter((s) => s.content && s.content.length > 200)
        .map((s) => ({ title: s.title }));
      const upcomingSchedule = schedule
        .filter((s) => new Date(s.date).getTime() > Date.now() - 24 * 3600 * 1000)
        .map((s) => {
          const v = videos.find((vv) => vv.id === s.videoId);
          return {
            date: s.date,
            title: v?.title ?? "Scheduled item",
            platform: (s.platforms?.[0] ?? "youtube") as string,
          };
        });
      const recentPerformance = recentYouTubeVideos.slice(0, 10).map((v) => ({
        title: v.title,
        views: v.views,
        type: (v as any).type ?? "Long",
      }));

      const res = await generateWeeklyPlan.mutateAsync({
        data: {
          channelName: channel.name,
          niche: channel.niche,
          subscriberCount: channel.subscriberCount,
          totalViews: channel.totalViews,
          goals: goals.map((g) => ({
            title: g.title,
            type: g.type,
            currentValue: g.currentValue,
            targetValue: g.targetValue,
            deadline: g.deadline,
          })),
          pendingIdeas,
          readyScripts,
          upcomingSchedule,
          recentPerformance,
          postsPerWeek: 3,
        },
      });
      setPlanResult(res.plan);
      toast({ title: "Weekly plan generated" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  // ===== Chat (with memory) =====
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("titles");

  // ===== Thumbnail Studio (standalone) =====
  const generateThumb = useGenerateThumbnail();
  const generateStrategy = useGenerateThumbnailStrategy();
  const scoreThumbs = useScoreThumbnails();

  const [thumbTitle, setThumbTitle] = useState("");
  const [thumbHook, setThumbHook] = useState("");
  const [thumbTags, setThumbTags] = useState("");
  const [thumbStyle, setThumbStyle] = useState<ThumbnailStylePreset | null>(null);
  const [thumbHd, setThumbHd] = useState(false);
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbStrategy, setThumbStrategy] = useState<ThumbnailStrategy | null>(null);
  const [thumbAdvancedOpen, setThumbAdvancedOpen] = useState(false);

  // ===== A/B Tester state =====
  type AbCandidate = { id: string; mimeType: string; data: string; preview: string };
  const [abCandidates, setAbCandidates] = useState<AbCandidate[]>([]);
  const [abTitle, setAbTitle] = useState("");
  const [abScores, setAbScores] = useState<{
    scores: ThumbnailScore[];
    winnerIndex: number;
    verdict: string;
  } | null>(null);
  const abFileInputRef = useRef<HTMLInputElement | null>(null);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When entering the Chat tab: if current conversation already has messages,
  // start fresh (so the user lands on an empty draft each time).
  // If current is empty / null, keep it — don't pile up empty conversations.
  useEffect(() => {
    if (activeTab !== "chat") return;
    if (!activeConversationId) return;
    const hasMessages = chatMessages.some(
      (m) => m.conversationId === activeConversationId,
    );
    if (hasMessages) {
      setActiveConversationId(null);
      setChatInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const activeMessages = useMemo(
    () =>
      chatMessages
        .filter((m) => m.conversationId === activeConversationId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [chatMessages, activeConversationId],
  );

  // Auto-scroll on new message
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: 9_999_999, behavior: "smooth" });
  }, [activeMessages.length, chatMutation.isPending]);

  // Auto-grow the chat textarea — generous max so long text stays visible
  useEffect(() => {
    const ta = chatTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxH = Math.max(180, Math.floor(window.innerHeight * 0.4));
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
  }, [chatInput]);

  const startNewConversation = async () => {
    const conv = await createChatConversation("New chat");
    if (conv) {
      setActiveConversationId(conv.id);
      setChatInput("");
      setMobileSidebarOpen(false);
      // Focus the input shortly after the panel mounts
      setTimeout(() => chatTextareaRef.current?.focus(), 60);
    } else {
      toast({
        title: "Couldn't start chat",
        description: "Supabase chat tables not reachable.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await deleteChatConversation(id);
    if (activeConversationId === id) setActiveConversationId(null);
  };

  // ===== File upload helpers =====
  const MAX_ATTACH_BYTES = 8 * 1024 * 1024; // 8 MB per file
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(",") ? result.split(",", 2)[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const additions: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACH_BYTES) {
        toast({
          title: `${file.name} too large`,
          description: "Max 8 MB per file.",
          variant: "destructive",
        });
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast({
          title: `${file.name} not supported`,
          description: "Only images and PDFs.",
          variant: "destructive",
        });
        continue;
      }
      try {
        const data = await fileToBase64(file);
        additions.push({ name: file.name, mimeType: file.type, data });
      } catch (err) {
        console.error("[chat] file read failed", err);
      }
    }
    if (additions.length) {
      setChatAttachments((prev) => [...prev, ...additions]);
    }
    // Reset input so re-selecting the same file works
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setChatAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  };

  // ===== Pre-fetch comments from latest videos so the chatbot can reference them =====
  // We pull the top ~8 comments (by relevance) from the 5 most recent uploads when the
  // Chat tab is active. This way the AI has live audience reactions in its context
  // without the user having to ask separately.
  const chatCommentVideos = useMemo(
    () =>
      [...recentYouTubeVideos]
        .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
        .slice(0, 5),
    [recentYouTubeVideos],
  );

  const chatCommentQueries = useQueries({
    queries: chatCommentVideos.map((v) => ({
      queryKey: ["chat-yt-comments", v.id] as const,
      queryFn: () => fetchVideoComments(v.id, 8, "relevance" as const),
      enabled: activeTab === "chat",
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  const chatCommentsByVideo = useMemo(() => {
    const map: Record<string, YouTubeComment[]> = {};
    chatCommentQueries.forEach((q, i) => {
      const v = chatCommentVideos[i];
      if (!v) return;
      if (q.data && q.data.length) map[v.id] = q.data;
    });
    return map;
  }, [chatCommentQueries, chatCommentVideos]);

  const buildContextSnapshot = (): string => {
    const lines: string[] = [];
    const fmt = (n: number) => n.toLocaleString();
    const daysAgo = (iso: string): string => {
      if (!iso) return "?";
      const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (d <= 0) return "today";
      if (d === 1) return "1 day ago";
      if (d < 30) return `${d} days ago`;
      if (d < 365) return `${Math.floor(d / 30)} months ago`;
      return `${Math.floor(d / 365)} years ago`;
    };

    // ---- Channel identity & stats ----
    lines.push(`## CHANNEL`);
    lines.push(`Name: ${channel.name || "(not set)"}`);
    if (channel.niche) lines.push(`Niche: ${channel.niche}`);
    if (channel.detectedLanguage) lines.push(`Language: ${channel.detectedLanguage}`);
    if (channel.country) lines.push(`Country: ${channel.country}`);
    if (channel.channelHandle) lines.push(`Handle: ${channel.channelHandle}`);
    if (channel.description) {
      const desc = channel.description.slice(0, 400);
      lines.push(`About: ${desc}${channel.description.length > 400 ? "…" : ""}`);
    }
    if (channel.keywords?.length) {
      lines.push(`Keywords: ${channel.keywords.slice(0, 12).join(", ")}`);
    }
    lines.push(
      `Stats: ${fmt(channel.subscriberCount)} subs · ${fmt(channel.totalViews)} total views · ${fmt(channel.totalVideos)} videos`,
    );
    if (channel.channelAge) lines.push(`Channel age: ${channel.channelAge}`);
    if (channel.bestPostingTimes?.length) {
      lines.push(`Best posting times: ${channel.bestPostingTimes.join(", ")}`);
    }

    // ---- Audience persona ----
    if (channel.audiencePersona?.oneLineSummary) {
      lines.push(`\n## AUDIENCE`);
      lines.push(channel.audiencePersona.oneLineSummary);
      const ap: any = channel.audiencePersona;
      if (ap.painPoints?.length) {
        lines.push(`Pain points: ${ap.painPoints.slice(0, 4).join("; ")}`);
      }
      if (ap.interests?.length) {
        lines.push(`Interests: ${ap.interests.slice(0, 6).join(", ")}`);
      }
    }

    // ---- Goals ----
    if (goals.length) {
      lines.push(`\n## GOALS (${goals.length})`);
      goals.slice(0, 8).forEach((g) => {
        const pct = g.targetValue ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
        const due = g.deadline ? ` · due ${g.deadline}` : "";
        lines.push(
          `- [${g.type}] ${g.title}: ${fmt(g.currentValue)}/${fmt(g.targetValue)} (${pct}%)${due}`,
        );
      });
    }

    // ---- Recent YouTube uploads (FULL detail, sorted newest first) ----
    if (recentYouTubeVideos.length) {
      const sorted = [...recentYouTubeVideos].sort(
        (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
      );
      const last = sorted[0];
      const avgViews =
        sorted.reduce((s, v) => s + (v.views || 0), 0) / sorted.length;

      lines.push(`\n## LAST UPLOAD (most recent)`);
      lines.push(`Title: "${last.title}"`);
      lines.push(`Published: ${daysAgo(last.publishedAt)} (${last.publishedAt?.slice(0, 10)})`);
      lines.push(
        `Performance: ${fmt(last.views)} views · ${fmt(last.likes)} likes · ${fmt(last.comments)} comments`,
      );
      const vsAvg = avgViews ? Math.round((last.views / avgViews) * 100) : 0;
      lines.push(`Vs channel avg: ${vsAvg}% (avg = ${fmt(Math.round(avgViews))} views)`);
      const dur = last.durationSeconds || 0;
      lines.push(
        `Format: ${dur > 0 && dur < 90 ? "Short" : "Long-form"} (${dur}s)`,
      );
      if (last.tags?.length) lines.push(`Tags: ${last.tags.slice(0, 8).join(", ")}`);
      if (last.description) {
        const d = last.description.replace(/\s+/g, " ").slice(0, 200);
        lines.push(`Desc: ${d}${last.description.length > 200 ? "…" : ""}`);
      }
      lines.push(`URL: ${last.url}`);

      // Full video index — up to 30 entries with rich detail so the AI can
      // look up ANY video by title/keyword the user mentions and answer about
      // its stats, format, tags, link, etc.
      const indexLimit = Math.min(sorted.length, 30);
      lines.push(
        `\n## ALL RECENT UPLOADS (${indexLimit} videos, newest → oldest — use this index to find any video the user mentions by title)`,
      );
      sorted.slice(0, indexLimit).forEach((v, i) => {
        const dur = v.durationSeconds || 0;
        const fmtTag = dur > 0 && dur < 90 ? "Short" : "Long";
        const cmt =
          (v as any).comments != null && (v as any).comments >= 0
            ? `${fmt((v as any).comments)} comments`
            : "comments hidden";
        const tagPart = v.tags?.length
          ? ` · tags: ${v.tags.slice(0, 4).join(", ")}`
          : "";
        lines.push(
          `${i + 1}. [${fmtTag} ${dur}s] "${v.title}" (id:${v.id}) — ${fmt(v.views)} views · ${fmt(v.likes)} likes · ${cmt} · ${daysAgo(v.publishedAt)}${tagPart}`,
        );
        lines.push(`   URL: ${v.url}`);
      });

      const top = [...sorted].sort((a, b) => b.views - a.views).slice(0, 5);
      lines.push(`\n## TOP UPLOADS (by views)`);
      top.forEach((v, i) => {
        lines.push(`${i + 1}. "${v.title}" — ${fmt(v.views)} views (${daysAgo(v.publishedAt)})`);
      });
    }

    // ---- Recent comments from latest videos ----
    // Pre-fetched in the background when user is on the Chat tab. Lets the AI
    // reference real audience reactions without needing a separate tool call.
    const commentVideoIds = chatCommentVideos
      .map((v) => v.id)
      .filter((id) => chatCommentsByVideo[id]?.length);
    if (commentVideoIds.length) {
      lines.push(`\n## RECENT COMMENTS (top relevance, from ${commentVideoIds.length} latest videos)`);
      commentVideoIds.forEach((vid) => {
        const video = chatCommentVideos.find((v) => v.id === vid);
        const cs = chatCommentsByVideo[vid] ?? [];
        if (!video || !cs.length) return;
        const shortTitle =
          video.title.length > 60 ? video.title.slice(0, 57) + "…" : video.title;
        lines.push(`\n### "${shortTitle}" (${daysAgo(video.publishedAt)})`);
        cs.slice(0, 8).forEach((c, i) => {
          const text = (c.textPlain || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 220);
          const reply = c.replyCount ? ` · ${c.replyCount} replies` : "";
          lines.push(
            `${i + 1}. ${c.author} (${fmt(c.likes)} likes${reply}): ${text}${(c.textPlain || "").length > 220 ? "…" : ""}`,
          );
        });
      });
    }

    // ---- Tracked production pipeline ----
    if (videos.length) {
      lines.push(`\n## PRODUCTION PIPELINE (${videos.length} tracked)`);
      const byStatus = videos.reduce<Record<string, number>>((acc, v) => {
        acc[v.status] = (acc[v.status] || 0) + 1;
        return acc;
      }, {});
      lines.push(
        Object.entries(byStatus)
          .map(([s, n]) => `${s}: ${n}`)
          .join(" · "),
      );
      videos.slice(0, 8).forEach((v) => {
        lines.push(`- [${v.status}/${v.type}] "${v.title}"${v.publishDate ? ` → ${v.publishDate}` : ""}`);
      });
    }

    // ---- Pending ideas ----
    if (ideas.length) {
      lines.push(`\n## PENDING IDEAS (${ideas.length})`);
      ideas.slice(0, 10).forEach((i) => {
        lines.push(`- [${i.difficulty}/${i.type}] ${i.title}${i.hook ? ` — hook: ${i.hook.slice(0, 80)}` : ""}`);
      });
    }

    // ---- Saved scripts ----
    if (scripts.length) {
      lines.push(`\n## SAVED SCRIPTS (${scripts.length})`);
      scripts.slice(0, 6).forEach((s) => {
        const wc = s.content ? s.content.split(/\s+/).length : 0;
        lines.push(`- "${s.title}" (${wc} words)`);
      });
    }

    // ---- Upcoming schedule ----
    const upcoming = schedule
      .filter((s) => +new Date(s.date) > Date.now() - 86400000)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 8);
    if (upcoming.length) {
      lines.push(`\n## UPCOMING SCHEDULE`);
      upcoming.forEach((s) => {
        const v = videos.find((vv) => vv.id === s.videoId);
        const platforms = s.platforms?.join("/") || "youtube";
        lines.push(
          `- ${s.date.slice(0, 16).replace("T", " ")} [${platforms}] "${v?.title || "Scheduled item"}"`,
        );
      });
    }

    return lines.join("\n");
  };

  // ===== Personalized starter suggestions =====
  // Re-randomized whenever the chat tab is (re)entered or the active conversation
  // resets, so the user gets a fresh, contextual set of prompts every time.
  const [suggestionSeed, setSuggestionSeed] = useState(0);
  useEffect(() => {
    if (activeTab === "chat" && !activeConversationId) {
      setSuggestionSeed((s) => s + 1);
    }
  }, [activeTab, activeConversationId]);

  const starterSuggestions = useMemo<string[]>(() => {
    const pool: string[] = [];
    const sortedRecent = [...recentYouTubeVideos].sort(
      (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
    );
    const last = sortedRecent[0];
    const avgViews =
      sortedRecent.length > 0
        ? sortedRecent.reduce((s, v) => s + v.views, 0) / sortedRecent.length
        : 0;
    const niche = channel.niche || "channel";

    // ---- Last upload analysis ----
    if (last) {
      const shortTitle =
        last.title.length > 36 ? last.title.slice(0, 33) + "…" : last.title;
      if (avgViews && last.views < avgViews * 0.7) {
        pool.push(`"${shortTitle}" kyu nahi chala? analyze karo`);
      } else if (avgViews && last.views > avgViews * 1.5) {
        pool.push(`"${shortTitle}" itna kyu chala? pattern nikalo`);
      } else {
        pool.push(`Last upload "${shortTitle}" pe feedback do`);
      }
      pool.push(`Last video ke liye 5 follow-up ideas do`);
    } else {
      pool.push(`Mere niche me viral ho rahi 5 ideas suggest karo`);
    }

    // ---- Top performer learning ----
    if (sortedRecent.length >= 3) {
      const top = [...sortedRecent].sort((a, b) => b.views - a.views)[0];
      const topShort = top.title.length > 30 ? top.title.slice(0, 27) + "…" : top.title;
      pool.push(`Mera best video "${topShort}" se kya seekhna chahiye?`);
    }

    // ---- Goals-driven ----
    if (goals.length) {
      const g = goals[Math.floor(Math.random() * goals.length)];
      pool.push(`${g.title} reach karne ka 30-day plan banao`);
      pool.push(`Mere ${g.type} goal pe abhi kaha hu, kya gap hai?`);
    } else {
      pool.push(`Mere channel ke liye 3 SMART goals suggest karo`);
    }

    // ---- Pipeline / production ----
    if (ideas.length >= 2) {
      pool.push(`Mere ${ideas.length} pending ideas me se best 3 batao`);
    }
    if (videos.some((v) => v.status === "Scripted" || v.status === "Recorded")) {
      pool.push(`Pipeline me jo videos hain unka publish order kya ho?`);
    }

    // ---- Schedule / planning ----
    pool.push(`Next 7 days ka content plan banao`);
    pool.push(`Is week konsa video pehle upload karu?`);

    // ---- Channel-strategy generic ----
    pool.push(`${niche} me abhi kya trending hai?`);
    pool.push(`Mere channel ka biggest weakness kya hai?`);
    pool.push(`Subscribe CTA ke 5 fresh ideas do`);
    pool.push(`Thumbnail strategy kya honi chahiye mere channel ke liye?`);
    pool.push(`Mere channel ka ek-line USP kya hai?`);
    if (channel.subscriberCount < 10000) {
      pool.push(`10K subs jaldi reach karne ka shortcut kya hai?`);
    } else if (channel.subscriberCount < 100000) {
      pool.push(`100K silver play button ke liye next steps?`);
    } else {
      pool.push(`Next milestone ke liye scaling plan do`);
    }

    // ---- Shuffle (Fisher-Yates) and pick 4 ----
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    suggestionSeed,
    recentYouTubeVideos,
    goals,
    ideas,
    videos,
    channel.niche,
    channel.subscriberCount,
  ]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatMutation.isPending) return;

    if (chatStatus === "missing") {
      toast({
        title: "Chat tables not set up",
        description: "Run the Supabase SQL shown on this tab first.",
        variant: "destructive",
      });
      return;
    }

    let convId = activeConversationId;
    if (!convId) {
      // Initial title is just a placeholder — auto-title runs after first AI reply.
      const conv = await createChatConversation("New chat");
      if (!conv) {
        toast({
          title: "Couldn't start chat",
          description: "Supabase write failed.",
          variant: "destructive",
        });
        return;
      }
      convId = conv.id;
      setActiveConversationId(convId);
    }
    // Auto-title fires for ANY conversation that has zero messages so far —
    // covers both auto-created and explicit "New chat" button conversations.
    const isFirstMessage = !chatMessages.some((m) => m.conversationId === convId);

    // Snapshot attachments for THIS message, then clear from input area
    const sentAttachments = chatAttachments;

    // Build a friendly content string that mentions attachment names so the
    // chat history visibly references them.
    const attachmentSummary = sentAttachments.length
      ? `\n\n📎 Attached: ${sentAttachments.map((a) => a.name).join(", ")}`
      : "";

    const userMsg = await addChatMessage(convId, "user", text + attachmentSummary);
    if (!userMsg) {
      toast({
        title: "Message not saved",
        description: "Supabase write failed.",
        variant: "destructive",
      });
      return;
    }
    setChatInput("");
    setChatAttachments([]);

    // Build full history (prior + this new user msg) — sliding window of last 30 turns
    const history = [
      ...chatMessages.filter((m) => m.conversationId === convId),
      userMsg,
    ]
      .slice(-30)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await chatMutation.mutateAsync({
        data: {
          history,
          contextSnapshot: buildContextSnapshot(),
          memories: chatMemories.map((m) => m.content),
          attachments: sentAttachments,
        },
      });
      await addChatMessage(convId, "assistant", res.reply);
      await touchChatConversation(convId);

      // Auto-title brand new conversations after first reply
      if (isFirstMessage) {
        try {
          const t = await titleMutation.mutateAsync({ data: { message: text } });
          if (t) await renameChatConversation(convId, t);
        } catch {}
      }

      // Background: extract long-term facts and persist to chat_memories
      // (don't block the UI — user already saw the reply)
      void (async () => {
        try {
          const facts = await extractMemoriesFromTurn({
            userMessage: text,
            assistantReply: res.reply,
            existingMemories: chatMemories.map((m) => m.content),
          });
          for (const f of facts) {
            await addChatMemory(f);
          }
        } catch (err) {
          console.warn("[chat] memory extraction failed:", err);
        }
      })();
    } catch (err: any) {
      toast({
        title: "Chat failed",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  // ===== Thumbnail Studio handlers =====
  const STYLE_PRESETS: { id: ThumbnailStylePreset; label: string; emoji: string }[] = [
    { id: "money", label: "Money", emoji: "💰" },
    { id: "tech", label: "Tech / AI", emoji: "⚡" },
    { id: "tutorial", label: "Tutorial", emoji: "📘" },
    { id: "drama", label: "Drama", emoji: "🔥" },
    { id: "before_after", label: "Before / After", emoji: "🔄" },
  ];

  const buildIdea = () => ({
    title: thumbTitle.trim(),
    hook: thumbHook.trim() || undefined,
    tags: thumbTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    niche: channel.niche || undefined,
  });

  const runThumbSmartGenerate = async () => {
    if (!thumbTitle.trim()) {
      toast({
        title: "Title chahiye",
        description: "Pehle ek video title likho — strategist usi pe plan banayega.",
        variant: "destructive",
      });
      return;
    }
    try {
      const out = await generateThumb.mutateAsync({
        data: {
          useStrategy: true,
          hd: thumbHd,
          stylePreset: thumbStyle ?? undefined,
          idea: buildIdea(),
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

  const runThumbStrategyOnly = async () => {
    if (!thumbTitle.trim()) {
      toast({ title: "Title chahiye", variant: "destructive" });
      return;
    }
    try {
      const out = await generateStrategy.mutateAsync({
        data: { stylePreset: thumbStyle ?? undefined, idea: buildIdea() },
      });
      setThumbStrategy(out.strategy);
      setThumbPrompt(out.strategy.imagePrompt);
      setThumbAdvancedOpen(true);
      toast({ title: "Strategy ready", description: "Prompt edit karke neeche Generate dabao." });
    } catch (err: any) {
      toast({
        title: "Strategy failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const runThumbManualGenerate = async () => {
    if (!thumbPrompt.trim()) return;
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

  const sendCurrentToAB = () => {
    if (!thumbPreview) return;
    const m = thumbPreview.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return;
    const cand: AbCandidate = {
      id: `gen-${Date.now()}`,
      mimeType: m[1],
      data: m[2],
      preview: thumbPreview,
    };
    setAbCandidates((prev) => (prev.length >= 5 ? prev : [...prev, cand]));
    if (!abTitle && thumbTitle) setAbTitle(thumbTitle);
    setActiveTab("thumbnail-ab");
    toast({ title: "Added to A/B Lab", description: "Upload more variants to compare." });
  };

  // ===== A/B Tester handlers =====
  const handleAbFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 5 - abCandidates.length;
    const list = Array.from(files).slice(0, remaining);
    const additions: AbCandidate[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) {
        toast({ title: `${f.name} skipped`, description: "Not an image file", variant: "destructive" });
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: `${f.name} skipped`, description: "Max 5 MB", variant: "destructive" });
        continue;
      }
      try {
        // Use FileReader to safely produce a data URL even for multi-MB files.
        // (Spreading Uint8Array into String.fromCharCode blows the call-stack on >~64KB.)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsDataURL(f);
        });
        const commaIdx = dataUrl.indexOf(",");
        const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : "";
        if (!b64) throw new Error("Empty image data");
        additions.push({
          id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          mimeType: f.type,
          data: b64,
          preview: dataUrl,
        });
      } catch (err: any) {
        toast({
          title: `${f.name} failed`,
          description: err?.message ?? "Could not read file",
          variant: "destructive",
        });
      }
    }
    if (additions.length) {
      setAbCandidates((prev) => [...prev, ...additions]);
      toast({
        title: `${additions.length} thumbnail${additions.length === 1 ? "" : "s"} added`,
        description: "Add 1-2 more aur 'Score thumbnails' dabao.",
      });
    }
    if (abFileInputRef.current) abFileInputRef.current.value = "";
  };

  const removeAbCandidate = (id: string) => {
    setAbCandidates((prev) => prev.filter((c) => c.id !== id));
    setAbScores(null);
  };

  const runAbScore = async () => {
    if (abCandidates.length < 2) {
      toast({ title: "Need 2+ thumbnails", description: "Upload at least 2 to compare.", variant: "destructive" });
      return;
    }
    try {
      const out = await scoreThumbs.mutateAsync({
        data: {
          videoTitle: abTitle.trim() || thumbTitle.trim() || undefined,
          niche: channel.niche || undefined,
          thumbnails: abCandidates.map((c) => ({ mimeType: c.mimeType, data: c.data })),
        },
      });
      setAbScores(out);
      toast({ title: "Scoring complete", description: out.verdict });
    } catch (err: any) {
      toast({
        title: "Scoring failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const sortedConversations = useMemo(
    () =>
      [...chatConversations].sort(
        (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
      ),
    [chatConversations],
  );

  return (
    <div className="space-y-6">
      {/* Hero — violet → black premium */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 via-purple-700/10 to-zinc-950/40 p-4 sm:p-6">
        <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-violet-500/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-purple-600/25 blur-3xl pointer-events-none" />

        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-violet-400 via-purple-500 to-zinc-950 text-white flex items-center justify-center shadow-lg shadow-violet-500/40 border border-violet-300/40 shrink-0">
            <Wand2 className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              AI Studio
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Smarter titles, descriptions, weekly plans & a strategist that remembers everything.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 lg:w-[840px] h-auto">
          <TabsTrigger value="titles" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <FileText className="h-3.5 w-3.5" /> Titles
          </TabsTrigger>
          <TabsTrigger value="description" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <Hash className="h-3.5 w-3.5" /> Description
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <Calendar className="h-3.5 w-3.5" /> Weekly
          </TabsTrigger>
          <TabsTrigger value="thumbnail" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <ImageIcon className="h-3.5 w-3.5" /> Thumbnail
          </TabsTrigger>
          <TabsTrigger value="thumbnail-ab" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <Trophy className="h-3.5 w-3.5" /> A/B Lab
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </TabsTrigger>
        </TabsList>

        {/* ============ TITLES ============ */}
        <TabsContent value="titles" className="space-y-4 mt-6">
          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-400" /> CTR Title Strategist
                </CardTitle>
                <CardDescription>
                  10 viral title variations across all formulas with trigger + score analysis.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleGenTitles}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="concept">Video concept / topic</Label>
                    <Textarea
                      id="concept"
                      name="concept"
                      required
                      placeholder="e.g. Ghar pe ek hacker lab kaise banaye under 3000 rupees"
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select name="language" defaultValue="Hinglish">
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hinglish">Hinglish</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="English">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full gap-2" disabled={generateTitles.isPending}>
                    {generateTitles.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Generate 10 Titles
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="space-y-3">
              {!titleResult && !generateTitles.isPending && (
                <div className="border border-dashed rounded-lg p-12 text-center text-sm text-muted-foreground">
                  Apna video concept de aur AI 10 viral title variations + top 3 A/B test recommendations dega.
                </div>
              )}
              {generateTitles.isPending && (
                <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Crafting 10 titles…
                </div>
              )}

              {titleResult && (
                <>
                  {titleResult.overallNotes && (
                    <Card className="bg-purple-500/5 border-purple-500/30">
                      <CardContent className="p-4 flex gap-3 items-start">
                        <TrendingUp className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-purple-100">{titleResult.overallNotes}</p>
                      </CardContent>
                    </Card>
                  )}

                  {titleResult.titles.map((t, idx) => {
                    const meta = TRIGGER_META[t.trigger] ?? TRIGGER_META.curiosity;
                    const tooLong = t.charCount > 60;
                    return (
                      <Card
                        key={idx}
                        className={`hover-elevate ${
                          t.isTopPick ? "border-amber-500/50 bg-amber-500/5" : ""
                        }`}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {t.isTopPick && (
                                  <Badge className="bg-amber-500 text-black gap-1 hover:bg-amber-500">
                                    <Crown className="h-3 w-3" /> TOP PICK
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-[10px]">
                                  {t.formula}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] ${meta.color}`}>
                                  {meta.emoji} {t.trigger.replace("_", " ")}
                                </Badge>
                              </div>
                              <p className="text-base font-semibold leading-snug">
                                {highlightPowerWords(t.title, t.powerWords)}
                              </p>
                              {t.topPickReason && (
                                <p className="text-xs text-amber-200/80 mt-1.5 italic">
                                  Why: {t.topPickReason}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopy(t.title, `t-${idx}`)}
                            >
                              {copied === `t-${idx}` ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-0">
                            <span className="flex items-center gap-1">
                              <span className="text-emerald-400">SEO</span>
                              <span className="font-mono">{t.seoScore}/10</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-rose-400">CTR</span>
                              <span className="font-mono">{t.ctrScore}/10</span>
                            </span>
                            <span
                              className={`flex items-center gap-1 ${
                                tooLong ? "text-orange-400" : ""
                              }`}
                            >
                              <span>chars</span>
                              <span className="font-mono">{t.charCount}</span>
                              {tooLong && <AlertCircle className="h-3 w-3" />}
                            </span>
                            {t.powerWords?.length > 0 && (
                              <span className="text-amber-400">
                                ⚡ {t.powerWords.join(", ")}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ============ DESCRIPTION ============ */}
        <TabsContent value="description" className="space-y-4 mt-6">
          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-emerald-400" /> SEO Description Specialist
                </CardTitle>
                <CardDescription>
                  5-zone YouTube description (Hook → Body → Chapters → CTA → Hashtags) + SEO audit. Social block auto-appended.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleGenDesc}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="descTitle">Video title</Label>
                    <Input
                      id="descTitle"
                      value={descTitleInput}
                      onChange={(e) => setDescTitleInput(e.target.value)}
                      required
                      placeholder="Paste the final title"
                    />
                    {videos.length > 0 && (
                      <Select onValueChange={(v) => setDescTitleInput(v)}>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="…or pick from your videos" />
                        </SelectTrigger>
                        <SelectContent>
                          {videos.map((v) => (
                            <SelectItem key={v.id} value={v.title}>
                              {v.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descConcept">Concept / key points (optional)</Label>
                    <Textarea
                      id="descConcept"
                      value={descConceptInput}
                      onChange={(e) => setDescConceptInput(e.target.value)}
                      rows={4}
                      placeholder="Kya cover ho raha hai? Helps AI write better keywords."
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full gap-2" disabled={generateDescription.isPending}>
                    {generateDescription.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Generate Description
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="space-y-3">
              {!descResult && !generateDescription.isPending && (
                <div className="border border-dashed rounded-lg p-12 text-center text-sm text-muted-foreground">
                  Title de aur full SEO description with chapters, CTA, hashtags, audit — sab ek click me.
                </div>
              )}
              {generateDescription.isPending && (
                <div className="border rounded-lg p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Writing description…
                </div>
              )}

              {descResult && (
                <>
                  {/* Final assembled, copy-ready */}
                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Eye className="h-4 w-4" /> Final description (copy-ready)
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          handleCopy(assembleDescription(descResult, brandDefaults), "final")
                        }
                      >
                        {copied === "final" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy all
                      </Button>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground/90 max-h-96 overflow-y-auto bg-background/40 rounded p-3 border border-border/40">
                        {assembleDescription(descResult, brandDefaults)}
                      </pre>
                    </CardContent>
                  </Card>

                  {/* Zone breakdown */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Card>
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                          Zone 1 — Hook
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-sm">{descResult.hook}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {descResult.hook.length} chars (≤160)
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                          Zone 2 — Body
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-sm whitespace-pre-wrap">{descResult.body}</p>
                      </CardContent>
                    </Card>

                    <Card className="sm:col-span-2">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                          Zone 3 — Chapters
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1 space-y-1">
                        {descResult.chapters.map((c, i) => (
                          <div key={i} className="text-sm flex gap-3">
                            <span className="font-mono text-emerald-400 w-12 shrink-0">{c.time}</span>
                            <span>{c.title}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="sm:col-span-2">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                          Zone 4 — CTAs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1 space-y-2 text-sm">
                        <p>👉 <strong>Subscribe:</strong> {descResult.ctas.subscribe}</p>
                        <p>💬 <strong>Comment:</strong> {descResult.ctas.comment}</p>
                        <p>👍 <strong>Like:</strong> {descResult.ctas.like}</p>
                      </CardContent>
                    </Card>

                    <Card className="sm:col-span-2">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                          Zone 5 — Hashtags
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-1">
                        <p className="text-sm text-sky-400">
                          {descResult.hashtags
                            .map((h) => (h.startsWith("#") ? h : `#${h.replace(/^#?/, "")}`))
                            .join(" ")}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* SEO Audit */}
                  <Card className="border-purple-500/30 bg-purple-500/5">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-purple-400" /> SEO Audit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">Primary keyword:</span>{" "}
                          <span className="text-foreground font-medium">{descResult.seoAudit.primaryKeyword}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Placement:</span>{" "}
                          <span>{descResult.seoAudit.primaryKeywordPlacement}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Char count:</span>{" "}
                          <span className="font-mono">{descResult.seoAudit.charCount}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Density:</span>{" "}
                          <span className="font-mono">{descResult.seoAudit.keywordDensityPct}%</span>
                        </div>
                      </div>
                      <p className="text-muted-foreground italic">{descResult.seoAudit.readabilityNote}</p>
                      <div className="pt-1">
                        <p className="text-muted-foreground mb-1">Improvement suggestions:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          {descResult.seoAudit.improvementSuggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ============ WEEKLY PLAN ============ */}
        <TabsContent value="plan" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-400" /> Context-Aware Weekly Plan
              </CardTitle>
              <CardDescription>
                AI tumhare goals, ideas, ready scripts, schedule aur recent video performance — sab dekh kar 7-day execution plan banayega.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 text-xs mb-4">
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3 w-3" /> {goals.length} active goals
                </Badge>
                <Badge variant="outline" className="gap-1">
                  💡 {ideas.length} ideas in bank
                </Badge>
                <Badge variant="outline" className="gap-1">
                  📝 {scripts.filter((s) => s.content?.length > 200).length} ready scripts
                </Badge>
                <Badge variant="outline" className="gap-1">
                  📅 {schedule.length} scheduled
                </Badge>
                <Badge variant="outline" className="gap-1">
                  📺 {recentYouTubeVideos.length} recent uploads
                </Badge>
              </div>
              <Button
                onClick={handleGenPlan}
                disabled={generateWeeklyPlan.isPending}
                className="gap-2"
              >
                {generateWeeklyPlan.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Build my week
              </Button>
            </CardContent>
          </Card>

          {planResult && (
            <>
              <Card className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 border-sky-500/30">
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-sky-300">Week theme</p>
                  <p className="text-lg font-semibold">{planResult.weekTheme}</p>
                </CardContent>
              </Card>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {planResult.days.map((d, i) => (
                  <Card key={i} className="hover-elevate">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{d.day}</CardTitle>
                        {d.videoType && d.videoType !== "Off" && (
                          <Badge variant="outline" className="text-[10px]">
                            {d.videoType}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">{d.focus}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-2 text-sm">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground mb-1">Tasks</p>
                        <ul className="space-y-1 text-xs">
                          {d.tasks.map((t, ti) => (
                            <li key={ti} className="flex gap-1.5">
                              <span className="text-emerald-400">•</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Deliverable:</span>{" "}
                        <span className="text-foreground">{d.deliverable}</span>
                      </div>
                      <div className="text-xs italic text-purple-300/90">
                        🎯 {d.goalImpact}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm">Week summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <p className="text-sm">{planResult.weekSummary}</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-500/30 bg-orange-500/5">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-400" /> Risks to watch
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <ul className="text-sm space-y-1">
                      {planResult.risks.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-orange-400">⚠</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ============ THUMBNAIL STUDIO ============ */}
        <TabsContent value="thumbnail" className="space-y-4 mt-6">
          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* LEFT: form */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-purple-400" /> Thumbnail Studio
                  <Badge
                    variant="outline"
                    className="ml-1 text-[10px] gap-1 border-purple-500/40 text-purple-300"
                  >
                    <Zap className="h-3 w-3" /> Viral Strategist
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Title + hook do, AI MrBeast-style strategy banayega aur Nano Banana se thumbnail generate karega.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="thumb-title-input" className="text-xs">Video title *</Label>
                  <Input
                    id="thumb-title-input"
                    value={thumbTitle}
                    onChange={(e) => setThumbTitle(e.target.value)}
                    placeholder='e.g. "Yeh AI Tool Tumhari Privacy Chura Raha Hai"'
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="thumb-hook-input" className="text-xs">Hook (optional)</Label>
                  <Textarea
                    id="thumb-hook-input"
                    rows={2}
                    value={thumbHook}
                    onChange={(e) => setThumbHook(e.target.value)}
                    placeholder="Ek line jo viewer ko shock kare..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="thumb-tags-input" className="text-xs">Tags (comma separated)</Label>
                  <Input
                    id="thumb-tags-input"
                    value={thumbTags}
                    onChange={(e) => setThumbTags(e.target.value)}
                    placeholder="ai, privacy, hacking, scam"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Style preset (optional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_PRESETS.map((p) => {
                      const active = thumbStyle === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setThumbStyle(active ? null : p.id)}
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

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 bg-muted/20">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">HD mode (Nano Banana Pro)</p>
                    <p className="text-xs text-muted-foreground">
                      Slower, sharper. Off = fast Flash.
                    </p>
                  </div>
                  <Switch checked={thumbHd} onCheckedChange={setThumbHd} />
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={runThumbSmartGenerate}
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
                    {thumbPreview ? "Re-generate Smart Thumbnail" : "Generate Smart Thumbnail"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={runThumbStrategyOnly}
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
                </div>
              </CardContent>
            </Card>

            {/* RIGHT: preview + strategy + advanced */}
            <div className="space-y-4">
              <div className="card-premium p-4 space-y-4">
                <div className="relative aspect-video w-full rounded-lg border border-border/60 overflow-hidden bg-gradient-to-br from-muted/40 to-muted/10 flex items-center justify-center">
                  {generateThumb.isPending ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                      <p className="text-sm">
                        {thumbHd ? "Cooking up HD…" : "Strategist + Nano Banana working…"}
                      </p>
                      <p className="text-xs opacity-70">
                        Stage 1: planning CTR. Stage 2: drawing pixels.
                      </p>
                    </div>
                  ) : thumbPreview ? (
                    <img src={thumbPreview} alt="thumbnail preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground px-6 text-center">
                      <ImageIcon className="h-10 w-10 opacity-50" />
                      <p className="text-sm">
                        Form bharo aur{" "}
                        <span className="text-purple-300 font-medium">Generate Smart Thumbnail</span> dabao.
                      </p>
                    </div>
                  )}
                </div>

                {thumbPreview && (
                  <div className="flex flex-wrap gap-2 justify-end">
                    <a
                      href={thumbPreview}
                      download={`thumbnail-${Date.now()}.png`}
                      className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-border/60 hover:bg-muted/50 transition-colors"
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                    <Button type="button" variant="outline" size="sm" onClick={sendCurrentToAB} className="gap-2">
                      <Trophy className="h-4 w-4" /> Send to A/B Lab
                    </Button>
                  </div>
                )}
              </div>

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
                      <p className="font-medium capitalize">{thumbStrategy.emotion}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Hook word</p>
                      <p className="font-medium uppercase">{thumbStrategy.hookWord}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Expression</p>
                      <p className="font-medium line-clamp-2">{thumbStrategy.expression}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Focal point</p>
                      <p className="font-medium line-clamp-2">{thumbStrategy.focalPoint}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      <Palette className="h-3 w-3" /> Text:
                    </span>
                    {thumbStrategy.textColors?.map((c, i) => (
                      <span key={`tc-${i}`} className="h-4 w-4 rounded border border-border/60" style={{ background: c }} title={c} />
                    ))}
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2">
                      BG:
                    </span>
                    {thumbStrategy.bgColors?.map((c, i) => (
                      <span key={`bc-${i}`} className="h-4 w-4 rounded border border-border/60" style={{ background: c }} title={c} />
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Overlay: <span className="text-foreground font-medium">"{thumbStrategy.textOverlay}"</span>
                    </span>
                  </div>
                </div>
              )}

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
                      rows={5}
                      value={thumbPrompt}
                      onChange={(e) => setThumbPrompt(e.target.value)}
                      placeholder="Describe the exact thumbnail image you want… or hit 'Plan only' to let the strategist write it."
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={runThumbManualGenerate}
                        disabled={generateThumb.isPending || !thumbPrompt.trim()}
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
            </div>
          </div>
        </TabsContent>

        {/* ============ THUMBNAIL A/B LAB ============ */}
        <TabsContent value="thumbnail-ab" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" /> Thumbnail A/B Lab
                <Badge variant="outline" className="ml-1 text-[10px] gap-1 border-amber-500/40 text-amber-300">
                  <ScanEye className="h-3 w-3" /> CTR Judge
                </Badge>
              </CardTitle>
              <CardDescription>
                2-5 thumbnails upload karo (ya Studio se bhejo). AI har ek ko CTR, emotion, readability, curiosity gap pe score karega aur winner batayega.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="ab-title" className="text-xs">Video title (optional, helps the judge)</Label>
                  <Input
                    id="ab-title"
                    value={abTitle}
                    onChange={(e) => setAbTitle(e.target.value)}
                    placeholder='e.g. "Yeh AI Tool Tumhari Privacy Chura Raha Hai"'
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    ref={abFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleAbFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abFileInputRef.current?.click()}
                    disabled={abCandidates.length >= 5}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" /> Upload
                  </Button>
                  <Button
                    type="button"
                    onClick={runAbScore}
                    disabled={scoreThumbs.isPending || abCandidates.length < 2}
                    className="gap-2 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-500/90 hover:to-orange-600/90 text-white border-0"
                  >
                    {scoreThumbs.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Crosshair className="h-4 w-4" />
                    )}
                    Score thumbnails
                  </Button>
                </div>
              </div>

              {abCandidates.length === 0 ? (
                <div className="border border-dashed border-border/60 rounded-lg p-8 text-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mx-auto opacity-40 mb-2" />
                  <p className="text-sm">Upload 2-5 thumbnails to compare. Or generate one in the Thumbnail tab and "Send to A/B Lab".</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {abCandidates.map((c, idx) => {
                    const score = abScores?.scores.find((s) => s.index === idx);
                    const isWinner = abScores && abScores.winnerIndex === idx;
                    return (
                      <div
                        key={c.id}
                        className={`rounded-lg border overflow-hidden bg-muted/10 ${
                          isWinner ? "border-amber-400/70 shadow-lg shadow-amber-400/20 ring-1 ring-amber-400/40" : "border-border/60"
                        }`}
                      >
                        <div className="relative aspect-video">
                          <img src={c.preview} alt={`candidate ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
                            #{idx + 1}
                          </div>
                          {isWinner && (
                            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-bold">
                              <Trophy className="h-3 w-3" /> WINNER
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAbCandidate(c.id)}
                            className="absolute bottom-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md bg-black/60 hover:bg-red-600/80 text-white transition-colors"
                            aria-label="Remove"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {score ? (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CTR Score</span>
                              <span className={`text-2xl font-bold tabular-nums ${
                                score.ctrScore >= 8 ? "text-emerald-400" : score.ctrScore >= 6 ? "text-amber-400" : "text-rose-400"
                              }`}>
                                {score.ctrScore}/10
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <ScoreBar label="Emotion" value={score.emotionImpact} />
                              <ScoreBar label="Readable" value={score.textReadability} />
                              <ScoreBar label="Curiosity" value={score.curiosityGap} />
                              <ScoreBar label="Focal" value={score.focalClarity} />
                              <ScoreBar label="Mobile" value={score.mobileReadability} />
                            </div>
                            {score.strengths?.length > 0 && (
                              <div className="text-[11px]">
                                <p className="text-emerald-400 font-medium">+ Strengths</p>
                                <ul className="text-muted-foreground space-y-0.5 ml-2 mt-0.5 list-disc list-inside">
                                  {score.strengths.slice(0, 3).map((s, i) => (
                                    <li key={i} className="line-clamp-2">{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {score.weaknesses?.length > 0 && (
                              <div className="text-[11px]">
                                <p className="text-rose-400 font-medium">− Weaknesses</p>
                                <ul className="text-muted-foreground space-y-0.5 ml-2 mt-0.5 list-disc list-inside">
                                  {score.weaknesses.slice(0, 3).map((s, i) => (
                                    <li key={i} className="line-clamp-2">{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {score.improvements?.length > 0 && (
                              <div className="text-[11px]">
                                <p className="text-amber-400 font-medium">→ Try this</p>
                                <ul className="text-muted-foreground space-y-0.5 ml-2 mt-0.5 list-disc list-inside">
                                  {score.improvements.slice(0, 3).map((s, i) => (
                                    <li key={i} className="line-clamp-2">{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 text-center text-[11px] text-muted-foreground">
                            Press "Score thumbnails" to analyse
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {abScores && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
                  <Trophy className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-300 mb-0.5">Verdict</p>
                    <p className="text-sm">{abScores.verdict}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CHAT (with memory) ============ */}
        <TabsContent value="chat" className="mt-4 md:mt-6">
          {chatStatus === "missing" ? (
            <ChatTablesSetup />
          ) : (
            <div className="fixed inset-0 z-50 bg-background flex md:grid md:grid-cols-[280px_1fr]">
              {/* Desktop sidebar (hidden on mobile) */}
              <div className="hidden md:flex border-r border-border/60 flex-col bg-muted/20 min-h-0">
                <ConversationSidebar
                  conversations={sortedConversations}
                  activeId={activeConversationId}
                  onSelect={handleSelectConversation}
                  onNewChat={startNewConversation}
                  onDelete={handleDeleteConversation}
                />
              </div>

              {/* Conversation pane */}
              <div className="flex flex-col min-h-0 flex-1">
                {/* Header */}
                <div className="border-b border-border/60 flex items-center justify-between gap-2 bg-background/95 backdrop-blur px-3 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:py-2.5 md:pt-2.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Back button to exit chat (both mobile + desktop, since chat is fullscreen) */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setActiveTab("titles")}
                      className="h-9 w-9 shrink-0 -ml-1"
                      aria-label="Back"
                      title="Close chat"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                    {/* Mobile: open sidebar */}
                    <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="md:hidden h-9 w-9 shrink-0"
                          aria-label="Open chats"
                        >
                          <PanelLeft className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="left"
                        className="p-0 w-[300px] sm:w-[340px] flex flex-col bg-muted/20 z-[60]"
                      >
                        <SheetHeader className="p-3 border-b border-border/60 text-left">
                          <SheetTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-primary" />
                            Conversations
                          </SheetTitle>
                        </SheetHeader>
                        <ConversationSidebar
                          conversations={sortedConversations}
                          activeId={activeConversationId}
                          onSelect={(id) => {
                            handleSelectConversation(id);
                            setMobileSidebarOpen(false);
                          }}
                          onNewChat={() => {
                            startNewConversation();
                            setMobileSidebarOpen(false);
                          }}
                          onDelete={handleDeleteConversation}
                        />
                      </SheetContent>
                    </Sheet>
                    <MessageSquare className="h-4 w-4 text-primary shrink-0 hidden md:block" />
                    <span className="font-semibold truncate text-sm md:text-base">
                      {sortedConversations.find((c) => c.id === activeConversationId)?.title ||
                        "Strategic Assistant"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMemoryPanelOpen(true)}
                      className="h-9 w-9"
                      aria-label="Memory"
                      title="Saved memory"
                    >
                      <Brain className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={startNewConversation}
                      className="md:hidden h-9 w-9"
                      aria-label="New chat"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div
                  ref={chatScrollRef}
                  className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 overscroll-contain"
                >
                  {!activeConversationId || activeMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 text-muted-foreground px-2 py-6">
                      <MessageSquare className="h-10 w-10 opacity-50" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Strategic Assistant</p>
                        <p className="text-sm max-w-md">
                          Sab kuch yaad rahega — channel info, goals, ideas. Pucho jo bhi ho.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center max-w-xl pt-2">
                        {starterSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              setChatInput(s);
                              chatTextareaRef.current?.focus();
                            }}
                            className="text-xs px-3 py-1.5 rounded-full border border-border/60 hover:bg-muted/40 active:scale-95 transition text-left"
                          >
                            {s}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSuggestionSeed((x) => x + 1)}
                          className="text-xs px-3 py-1.5 rounded-full border border-dashed border-border/60 hover:bg-muted/40 active:scale-95 transition opacity-70"
                          title="Shuffle suggestions"
                        >
                          ↻ aur dikhao
                        </button>
                      </div>
                    </div>
                  ) : (
                    activeMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                            m.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))
                  )}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input area: attachment chips + form */}
                <div className="border-t border-border/60 bg-background pb-[max(env(safe-area-inset-bottom),0.625rem)]">
                  {chatAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-2.5 sm:px-3 pt-2.5">
                      {chatAttachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 bg-muted rounded-lg border border-border/60 text-xs max-w-[200px]"
                        >
                          {att.mimeType.startsWith("image/") ? (
                            <img
                              src={`data:${att.mimeType};base64,${att.data}`}
                              alt={att.name}
                              className="w-7 h-7 object-cover rounded"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                              <FileIcon className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                          <span className="truncate max-w-[120px]" title={att.name}>
                            {att.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="ml-0.5 h-5 w-5 rounded-full hover:bg-destructive/20 flex items-center justify-center shrink-0"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form
                    onSubmit={handleSendChat}
                    className="p-2.5 sm:p-3 flex gap-2 items-end"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 w-10 shrink-0"
                      aria-label="Attach file"
                      title="Attach image or PDF"
                      disabled={chatMutation.isPending}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Textarea
                      ref={chatTextareaRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                          e.preventDefault();
                          handleSendChat(e as unknown as React.FormEvent);
                        }
                      }}
                      placeholder="Pucho kuch bhi…"
                      disabled={chatMutation.isPending}
                      rows={1}
                      className="flex-1 min-h-[44px] max-h-[40dvh] resize-none text-base md:text-sm py-2.5 leading-relaxed overflow-y-auto"
                    />
                    <Button
                      type="submit"
                      disabled={
                        (!chatInput.trim() && chatAttachments.length === 0) ||
                        chatMutation.isPending
                      }
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Memory panel — list of facts the AI remembers across conversations */}
      <Sheet open={memoryPanelOpen} onOpenChange={setMemoryPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col z-[60]">
          <SheetHeader className="p-4 border-b border-border/60 text-left">
            <SheetTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Memory
              <Badge variant="secondary" className="text-[10px]">
                {chatMemories.length}
              </Badge>
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Ye facts AI har conversation me yaad rakhta hai. Galat lage to delete kar do.
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMemories.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
                <Brain className="h-10 w-10 opacity-40 mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Abhi koi memory nahi
                </p>
                <p className="text-xs mt-1 max-w-[260px]">
                  Jaise jaise tum chat karoge, important facts apne aap save honge.
                </p>
              </div>
            ) : (
              chatMemories.map((m) => (
                <div
                  key={m.id}
                  className="group p-3 rounded-lg border border-border/60 bg-muted/30 flex items-start gap-2"
                >
                  <p className="text-sm flex-1 leading-relaxed">{m.content}</p>
                  <button
                    type="button"
                    onClick={() => deleteChatMemory(m.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded hover:bg-destructive/20 flex items-center justify-center shrink-0"
                    aria-label="Delete memory"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
