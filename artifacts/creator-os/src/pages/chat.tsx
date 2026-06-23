import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCreatorData } from "@/hooks/use-creator-data";
import { useChatData } from "@/hooks/use-chat-data";
import { STRATEGIC_ASSISTANT_SYSTEM, extractMemoriesFromTurn, generateConversationTitle, type ChatAttachment } from "@/lib/gemini";
import { getToken, API_BASE } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Search, Trash2, Brain, Download, Mic, MicOff, Paperclip, Send,
  StopCircle, Copy, RefreshCw, ThumbsUp, ThumbsDown, ChevronLeft,
  PanelLeft, Sparkles, X, Check, ImageIcon, FileText, Zap,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
type Role = "user" | "assistant";
interface LocalMessage {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  liked?: boolean | null;
  attachments?: ChatAttachment[];
}

interface PendingAttachment {
  name: string;
  mimeType: string;
  data: string;
  previewUrl?: string;
}

// ── Build creator context snapshot ──────────────────────────────────────────
function buildContextSnapshot(data: ReturnType<typeof useCreatorData>): string {
  const { channel, videos, goals, ideas, scripts, schedule, recentYouTubeVideos } = data;
  const lines: string[] = [];
  const fmt = (n: number) => n.toLocaleString();
  const daysAgo = (iso: string) => {
    if (!iso) return "?";
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d <= 0) return "today";
    if (d === 1) return "1 day ago";
    if (d < 30) return `${d} days ago`;
    if (d < 365) return `${Math.floor(d / 30)} months ago`;
    return `${Math.floor(d / 365)} years ago`;
  };

  lines.push(`## CHANNEL`);
  lines.push(`Name: ${channel.name || "(not set)"}`);
  if (channel.niche) lines.push(`Niche: ${channel.niche}`);
  if (channel.detectedLanguage) lines.push(`Language: ${channel.detectedLanguage}`);
  lines.push(`Stats: ${fmt(channel.subscriberCount)} subs · ${fmt(channel.totalViews)} views · ${fmt(channel.totalVideos)} videos`);
  if (channel.audiencePersona?.oneLineSummary) {
    lines.push(`\n## AUDIENCE\n${channel.audiencePersona.oneLineSummary}`);
  }
  if (goals.length) {
    lines.push(`\n## GOALS`);
    goals.slice(0, 6).forEach((g) => {
      const pct = g.targetValue ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
      lines.push(`- [${g.type}] ${g.title}: ${fmt(g.currentValue)}/${fmt(g.targetValue)} (${pct}%)`);
    });
  }
  if (recentYouTubeVideos.length) {
    const sorted = [...recentYouTubeVideos].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
    const last = sorted[0];
    lines.push(`\n## LAST UPLOAD\nTitle: "${last.title}"\nPublished: ${daysAgo(last.publishedAt)}\nStats: ${fmt(last.views)} views · ${fmt(last.likes)} likes`);
    lines.push(`\n## ALL RECENT UPLOADS`);
    sorted.slice(0, 20).forEach((v, i) => {
      lines.push(`${i + 1}. "${v.title}" — ${fmt(v.views)} views (${daysAgo(v.publishedAt)})`);
    });
  }
  if (videos.length) {
    lines.push(`\n## PRODUCTION PIPELINE`);
    videos.slice(0, 6).forEach((v) => lines.push(`- [${v.status}] "${v.title}"`));
  }
  if (ideas.length) {
    lines.push(`\n## PENDING IDEAS`);
    ideas.slice(0, 8).forEach((i) => lines.push(`- ${i.title}`));
  }
  if (scripts.length) {
    lines.push(`\n## SAVED SCRIPTS`);
    scripts.slice(0, 4).forEach((s) => lines.push(`- "${s.title}"`));
  }
  return lines.join("\n");
}

// ── Streaming chat function ──────────────────────────────────────────────────
async function streamChat(
  body: { prompt: string; systemInstruction: string; attachments?: ChatAttachment[] },
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: Error) => void,
  signal?: AbortSignal,
) {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    onError(err);
    return;
  }
  if (!res.ok) { onError(new Error(`HTTP ${res.status}`)); return; }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") { onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) onChunk(parsed.text);
          if (parsed.error) { onError(new Error(parsed.error)); return; }
        } catch { /* ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  onDone();
}

// ── Markdown message renderer ────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic opacity-90">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <div className="relative group my-2">
                <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto text-xs font-mono leading-relaxed">
                  <code className={cn("text-emerald-300", className)}>{children}</code>
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(String(children))}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-2 py-0.5 text-xs text-white/70"
                >
                  Copy
                </button>
              </div>
            );
          }
          return <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono text-emerald-300" {...props}>{children}</code>;
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-white/20 px-2 py-1 bg-white/10 font-semibold text-left">{children}</th>,
        td: ({ children }) => <td className="border border-white/20 px-2 py-1">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{children}</a>
        ),
        hr: () => <hr className="border-white/10 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// ── Suggested prompt chips ────────────────────────────────────────────────────
const BASE_PROMPTS = [
  "Mera channel growth plan kya hona chahiye?",
  "Is hafte ke liye 3 video ideas do",
  "Mere last video ka performance analyze karo",
  "Shorts vs Long-form: mujhe kya post karna chahiye?",
  "Thumbnail CTR improve karne ke tips do",
  "My audience kya chahti hai?",
  "Trending topics kya hain aaj mere niche mein?",
  "Ek viral hook likh do meri niche ke liye",
  "Mera YouTube channel monetize karne ke tips",
  "Comment section mein engagement kaise badhaun?",
];

function SuggestedPrompts({ onSelect }: { onSelect: (p: string) => void }) {
  const prompts = useMemo(() => {
    const shuffled = [...BASE_PROMPTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, []);
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
      {prompts.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted/80 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ── Conversation sidebar ─────────────────────────────────────────────────────
function ConvSidebar({
  conversations, activeId, search, onSearch, onSelect, onNew, onDelete,
}: {
  conversations: { id: string; title: string; updatedAt: string }[];
  activeId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-border/60 space-y-2 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> New Chat
        </button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No conversations</p>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors",
                c.id === activeId
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onSelect(c.id)}
            >
              <span className="flex-1 truncate text-xs">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main Chat Page ───────────────────────────────────────────────────────────
export default function ChatPage() {
  const creatorData = useCreatorData();
  const { toast } = useToast();

  const {
    status: chatStatus,
    conversations,
    messages: allMessages,
    memories: chatMemories,
    createConversation,
    deleteConversation,
    touchConversation,
    renameConversation,
    addMessage,
    addMemory,
    deleteMemory,
  } = useChatData({ conversations: creatorData.chatConversations, messages: creatorData.chatMessages });

  // UI state
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memPanelOpen, setMemPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [voiceActive, setVoiceActive] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Sync messages from Supabase into local state
  const convMessages = useMemo(
    () => allMessages.filter((m) => m.conversationId === activeConvId),
    [allMessages, activeConvId],
  );

  useEffect(() => {
    setLocalMessages(
      convMessages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    );
  }, [convMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [conversations],
  );

  // Build system instruction
  const buildSystem = useCallback(() => {
    const ctx = buildContextSnapshot(creatorData);
    const memBlock = chatMemories.length
      ? `\n\n## Persistent memory\n${chatMemories.map((m, i) => `${i + 1}. ${m.content}`).join("\n")}`
      : "";
    return STRATEGIC_ASSISTANT_SYSTEM + memBlock + (ctx ? `\n\n## Live channel context\n${ctx}` : "");
  }, [creatorData, chatMemories]);

  // Build prompt from history
  const buildPrompt = useCallback(
    (history: LocalMessage[], attachments: PendingAttachment[]) => {
      const transcript = history
        .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
        .join("\n\n");
      const attNote = attachments.length
        ? `\n\n(Attached: ${attachments.map((a) => `${a.name} [${a.mimeType}]`).join(", ")})`
        : "";
      return `Conversation so far:\n\n${transcript}${attNote}\n\nNow respond to the most recent USER message. Reply only with your message text — no role prefix.`;
    },
    [],
  );

  const startNewConv = useCallback(() => {
    setActiveConvId(null);
    setLocalMessages([]);
    setSidebarOpen(false);
  }, []);

  const selectConv = useCallback((id: string) => {
    setActiveConvId(id);
    setSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (id === activeConvId) startNewConv();
      await deleteConversation(id);
    },
    [activeConvId, deleteConversation, startNewConv],
  );

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const handleExport = useCallback(() => {
    const title = sortedConversations.find((c) => c.id === activeConvId)?.title || "Chat";
    const md = localMessages.map((m) => `**${m.role === "user" ? "You" : "AI"}:**\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([`# ${title}\n\n${md}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [localMessages, activeConvId, sortedConversations]);

  // Voice input
  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice not supported", description: "Use Chrome or Edge", variant: "destructive" }); return; }
    if (voiceActive) {
      recognitionRef.current?.stop();
      setVoiceActive(false);
      return;
    }
    const rec = new SR();
    rec.lang = "hi-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInput(transcript);
    };
    rec.onend = () => setVoiceActive(false);
    rec.onerror = () => setVoiceActive(false);
    recognitionRef.current = rec;
    rec.start();
    setVoiceActive(true);
  }, [voiceActive, toast]);

  // File attachment
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newAtts: PendingAttachment[] = [];
    for (const file of files.slice(0, 4)) {
      if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10MB per file", variant: "destructive" }); continue; }
      const data = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      newAtts.push({ name: file.name, mimeType: file.type, data, previewUrl });
    }
    setPendingAttachments((p) => [...p, ...newAtts]);
    e.target.value = "";
  }, [toast]);

  const removeAttachment = useCallback((name: string) => {
    setPendingAttachments((p) => p.filter((a) => a.name !== name));
  }, []);

  // Send message
  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || streaming) return;

      if (chatStatus === "missing") {
        toast({ title: "Chat tables missing", description: "Setup Supabase tables first (see /ai page)", variant: "destructive" });
        return;
      }

      let convId = activeConvId;
      if (!convId) {
        const conv = await createConversation("New chat");
        if (!conv) { toast({ title: "Couldn't start chat", variant: "destructive" }); return; }
        convId = conv.id;
        setActiveConvId(convId);
      }

      const atts = pendingAttachments;
      const attachSummary = atts.length ? `\n\n📎 Attached: ${atts.map((a) => a.name).join(", ")}` : "";
      const userContent = text + attachSummary;

      const isFirst = !allMessages.some((m) => m.conversationId === convId);
      const userMsg = await addMessage(convId!, "user", userContent);
      if (!userMsg) { toast({ title: "Message not saved", variant: "destructive" }); return; }

      setInput("");
      setPendingAttachments([]);
      const history: LocalMessage[] = [
        ...localMessages,
        { id: userMsg.id, role: "user", content: userContent },
      ].slice(-30);

      const streamId = `stream-${Date.now()}`;
      setStreamingMsgId(streamId);
      setStreaming(true);
      setLocalMessages((prev) => [
        ...prev,
        { id: userMsg.id, role: "user", content: userContent, attachments: atts },
        { id: streamId, role: "assistant", content: "", streaming: true },
      ]);

      abortRef.current = new AbortController();
      let fullReply = "";

      const prompt = buildPrompt(history, atts);
      const system = buildSystem();

      await streamChat(
        { prompt, systemInstruction: system, attachments: atts.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) },
        (chunk) => {
          fullReply += chunk;
          setLocalMessages((prev) =>
            prev.map((m) => m.id === streamId ? { ...m, content: fullReply } : m),
          );
        },
        async () => {
          setStreaming(false);
          setStreamingMsgId(null);
          setLocalMessages((prev) =>
            prev.map((m) => m.id === streamId ? { ...m, streaming: false } : m),
          );
          const saved = await addMessage(convId!, "assistant", fullReply);
          if (saved) {
            setLocalMessages((prev) =>
              prev.map((m) => m.id === streamId ? { ...m, id: saved.id } : m),
            );
          }
          await touchConversation(convId!);
          if (isFirst) {
            try {
              const title = await generateConversationTitle(text);
              if (title) await renameConversation(convId!, title);
            } catch { /* silent */ }
          }
          // Background memory extraction
          try {
            const lastUser = text;
            const { extractMemoriesFromTurn: extract } = await import("@/lib/gemini");
            const newFacts = await extract({ userMessage: lastUser, assistantReply: fullReply, existingMemories: chatMemories.map((m) => m.content) });
            for (const fact of newFacts) await addMemory(fact);
          } catch { /* silent */ }
        },
        (err) => {
          setStreaming(false);
          setStreamingMsgId(null);
          setLocalMessages((prev) => prev.filter((m) => m.id !== streamId));
          toast({ title: "AI error", description: err.message, variant: "destructive" });
        },
        abortRef.current.signal,
      );
    },
    [
      input, streaming, chatStatus, activeConvId, pendingAttachments, localMessages,
      allMessages, createConversation, addMessage, touchConversation, renameConversation,
      addMemory, chatMemories, buildPrompt, buildSystem, toast,
    ],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamingMsgId(null);
  }, []);

  const handleRegenerate = useCallback(
    async (msgId: string) => {
      const idx = localMessages.findIndex((m) => m.id === msgId);
      if (idx < 1) return;
      const history = localMessages.slice(0, idx).filter((m) => m.role === "user" || m.role === "assistant");
      const lastUser = history.findLast?.((m) => m.role === "user");
      if (!lastUser) return;
      setLocalMessages((prev) => prev.filter((m) => m.id !== msgId));
      await handleSend(lastUser.content);
    },
    [localMessages, handleSend],
  );

  const currentTitle = sortedConversations.find((c) => c.id === activeConvId)?.title ?? "New Chat";

  const sidebar = (
    <ConvSidebar
      conversations={sortedConversations}
      activeId={activeConvId}
      search={search}
      onSearch={setSearch}
      onSelect={selectConv}
      onNew={startNewConv}
      onDelete={handleDelete}
    />
  );

  return (
    <div className="fixed inset-0 z-40 bg-background flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-[260px] shrink-0 border-r border-border/60 flex-col bg-muted/10">
        <div className="p-3 border-b border-border/60 flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-sm font-semibold truncate">Creator AI</span>
          </div>
          <Link href="/ai">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Back to AI Studio">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        {sidebar}
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm px-3 py-2.5 flex items-center gap-2">
          {/* Mobile: sidebar sheet trigger */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                <PanelLeft className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px] flex flex-col bg-background">
              <SheetHeader className="p-3 border-b border-border/60">
                <SheetTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Creator AI
                </SheetTitle>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>

          {/* Mobile: back link */}
          <Link href="/ai" className="md:hidden">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>

          <span className="flex-1 text-sm font-medium truncate">{currentTitle}</span>

          <div className="flex items-center gap-1">
            {activeConvId && localMessages.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export as Markdown</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMemPanelOpen(true)}>
                  <Brain className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI Memory ({chatMemories.length})</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={startNewConv}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-3 md:px-6 py-4 space-y-4 pb-2">
            {localMessages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Creator AI Assistant</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Tumhara personal YouTube strategist — channel data, goals, aur videos sab jaanta hai
                  </p>
                </div>
                <SuggestedPrompts onSelect={(p) => { setInput(p); textareaRef.current?.focus(); }} />
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {localMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {/* AI avatar */}
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}

                    <div className={cn("group max-w-[85%] md:max-w-[75%]", msg.role === "user" ? "items-end" : "items-start", "flex flex-col gap-1")}>
                      {/* Attachment previews */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {msg.attachments.map((a) => (
                            <div key={a.name} className="flex items-center gap-1 bg-muted/60 rounded-lg px-2 py-1 text-xs text-muted-foreground">
                              {a.mimeType.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                              {a.name}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm",
                          msg.role === "user"
                            ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-br-sm"
                            : "bg-muted/60 border border-border/40 text-foreground rounded-bl-sm",
                        )}
                      >
                        {msg.role === "assistant" ? (
                          msg.streaming && !msg.content ? (
                            <TypingDots />
                          ) : (
                            <div className="text-sm leading-relaxed">
                              <MarkdownContent content={msg.content} />
                              {msg.streaming && (
                                <motion.span
                                  className="inline-block w-0.5 h-4 bg-current ml-0.5 align-middle"
                                  animate={{ opacity: [1, 0] }}
                                  transition={{ duration: 0.5, repeat: Infinity }}
                                />
                              )}
                            </div>
                          )
                        ) : (
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      {/* Actions */}
                      {!msg.streaming && (
                        <div className={cn("flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", msg.role === "user" ? "justify-end" : "justify-start")}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleCopy(msg.id, msg.content)}
                                className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Copy</TooltipContent>
                          </Tooltip>
                          {msg.role === "assistant" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleRegenerate(msg.id)}
                                  className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                                  disabled={streaming}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Regenerate</TooltipContent>
                            </Tooltip>
                          )}
                          {msg.role === "assistant" && (
                            <>
                              <button
                                onClick={() => setLocalMessages((p) => p.map((m) => m.id === msg.id ? { ...m, liked: m.liked === true ? null : true } : m))}
                                className={cn("p-1 rounded hover:bg-muted/60 transition-colors", msg.liked === true ? "text-green-500" : "text-muted-foreground hover:text-foreground")}
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setLocalMessages((p) => p.map((m) => m.id === msg.id ? { ...m, liked: m.liked === false ? null : false } : m))}
                                className={cn("p-1 rounded hover:bg-muted/60 transition-colors", msg.liked === false ? "text-red-500" : "text-muted-foreground hover:text-foreground")}
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-sm px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attachment previews */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingAttachments.map((a) => (
                  <div key={a.name} className="relative flex items-center gap-1.5 bg-muted/60 border border-border/40 rounded-lg px-2 py-1">
                    {a.previewUrl ? (
                      <img src={a.previewUrl} alt={a.name} className="h-8 w-8 object-cover rounded" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-xs max-w-[100px] truncate text-muted-foreground">{a.name}</span>
                    <button onClick={() => removeAttachment(a.name)} className="ml-1 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 bg-muted/30 border border-border/50 rounded-2xl px-3 py-2 focus-within:border-primary/40 transition-colors">
              {/* Attach */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors self-end mb-0.5"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Attach image/file</TooltipContent>
              </Tooltip>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.md" className="hidden" onChange={handleFileChange} />

              {/* Textarea */}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Kuch bhi pucho apne channel ke baare mein..."
                className="flex-1 min-h-[36px] max-h-[160px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-sm placeholder:text-muted-foreground/60"
                rows={1}
              />

              {/* Voice */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleVoice}
                    className={cn(
                      "shrink-0 p-1.5 rounded-lg transition-colors self-end mb-0.5",
                      voiceActive
                        ? "bg-red-500/20 text-red-500 animate-pulse"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {voiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{voiceActive ? "Stop recording" : "Voice input"}</TooltipContent>
              </Tooltip>

              {/* Send / Stop */}
              {streaming ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-500 transition-colors self-end mb-0.5"
                >
                  <StopCircle className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() && pendingAttachments.length === 0}
                  className="shrink-0 p-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground transition-colors self-end mb-0.5"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground/50">
              <Zap className="inline h-2.5 w-2.5 mr-0.5" />
              Gemini 2.5 Flash · Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* Memory panel */}
      <Sheet open={memPanelOpen} onOpenChange={setMemPanelOpen}>
        <SheetContent side="right" className="w-[320px] flex flex-col">
          <SheetHeader className="pb-2 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-primary" /> AI Memory
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-2">
            AI ye facts yaad rakhta hai tumhare baare mein — sab conversations mein use karta hai.
          </p>
          <ScrollArea className="flex-1 mt-3">
            {chatMemories.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Abhi tak koi memory save nahi hui. Kuch baat karo!
              </p>
            ) : (
              <div className="space-y-2">
                {chatMemories.map((mem) => (
                  <div key={mem.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40 border border-border/30">
                    <p className="text-xs flex-1 leading-relaxed">{mem.content}</p>
                    <button onClick={() => deleteMemory(mem.id)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
