import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ChatConversation, ChatMessage } from "@/hooks/use-creator-data";

export type ChatTablesStatus = "loading" | "ready" | "missing" | "error";

export type ChatMemory = {
  id: string;
  content: string;
  category: string | null;
  importance: number;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type MemoryRow = {
  id: string;
  content: string;
  category: string | null;
  importance: number;
  created_at: string;
};

const CONV_TABLE = "chat_conversations";
const MSG_TABLE = "chat_messages";
const MEM_TABLE = "chat_memories";

function rowToConversation(r: ConversationRow): ChatConversation {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  };
}

function rowToMemory(r: MemoryRow): ChatMemory {
  return {
    id: r.id,
    content: r.content,
    category: r.category,
    importance: r.importance,
    createdAt: r.created_at,
  };
}

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

let migrationAttempted = false;

async function migrateLegacyChat(
  legacyConvs: ChatConversation[],
  legacyMsgs: ChatMessage[],
): Promise<void> {
  if (migrationAttempted) return;
  migrationAttempted = true;
  if (!legacyConvs.length && !legacyMsgs.length) return;

  const { count, error } = await supabase
    .from(CONV_TABLE)
    .select("id", { count: "exact", head: true });
  if (error || (count ?? 0) > 0) return;

  if (legacyConvs.length) {
    const convRows = legacyConvs.map((c) => ({
      id: c.id,
      title: c.title,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
    const { error: cErr } = await supabase.from(CONV_TABLE).insert(convRows);
    if (cErr) {
      console.warn("[chat] legacy conversations migration failed:", cErr);
      return;
    }
  }

  if (legacyMsgs.length) {
    const msgRows = legacyMsgs.map((m) => ({
      id: m.id,
      conversation_id: m.conversationId,
      role: m.role,
      content: m.content,
      created_at: m.createdAt,
    }));
    for (let i = 0; i < msgRows.length; i += 200) {
      const slice = msgRows.slice(i, i + 200);
      const { error: mErr } = await supabase.from(MSG_TABLE).insert(slice);
      if (mErr) {
        console.warn("[chat] legacy messages migration failed:", mErr);
        return;
      }
    }
  }
  console.debug("[chat] migrated legacy chat to new tables:", {
    convs: legacyConvs.length,
    msgs: legacyMsgs.length,
  });
}

export function useChatData(legacy?: {
  conversations: ChatConversation[];
  messages: ChatMessage[];
}) {
  const [status, setStatus] = useState<ChatTablesStatus>("loading");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<ChatMemory[]>([]);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const { data: convData, error: convErr } = await supabase
      .from(CONV_TABLE)
      .select("*")
      .order("updated_at", { ascending: false });

    if (convErr) {
      if (isMissingTableError(convErr)) {
        if (mounted.current) setStatus("missing");
      } else {
        console.error("[chat] load conversations error:", convErr);
        if (mounted.current) setStatus("error");
      }
      return;
    }

    const { data: msgData, error: msgErr } = await supabase
      .from(MSG_TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (msgErr) {
      if (isMissingTableError(msgErr)) {
        if (mounted.current) setStatus("missing");
      } else {
        console.error("[chat] load messages error:", msgErr);
        if (mounted.current) setStatus("error");
      }
      return;
    }

    const { data: memData, error: memErr } = await supabase
      .from(MEM_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (memErr) {
      if (isMissingTableError(memErr)) {
        if (mounted.current) setStatus("missing");
        return;
      }
      console.warn("[chat] load memories error:", memErr);
    }

    if (!mounted.current) return;
    setConversations((convData as ConversationRow[]).map(rowToConversation));
    setMessages((msgData as MessageRow[]).map(rowToMessage));
    setMemories(((memData ?? []) as MemoryRow[]).map(rowToMemory));
    setStatus("ready");
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      await reload();
      if (legacy && (legacy.conversations.length || legacy.messages.length)) {
        try {
          await migrateLegacyChat(legacy.conversations, legacy.messages);
          await reload();
        } catch (err) {
          console.warn("[chat] migration failed:", err);
        }
      }
    })();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createConversation = useCallback(
    async (title: string): Promise<ChatConversation | null> => {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const conv: ChatConversation = {
        id,
        title: title.slice(0, 80) || "New chat",
        createdAt: now,
        updatedAt: now,
      };
      setConversations((prev) => [conv, ...prev]);
      const { error } = await supabase.from(CONV_TABLE).insert({
        id: conv.id,
        title: conv.title,
        created_at: conv.createdAt,
        updated_at: conv.updatedAt,
      });
      if (error) {
        console.error("[chat] createConversation error:", error);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        return null;
      }
      return conv;
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<void> => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
      const { error } = await supabase
        .from(CONV_TABLE)
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) console.error("[chat] renameConversation error:", error);
    },
    [],
  );

  const touchConversation = useCallback(async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, updatedAt: now } : c)),
    );
    const { error } = await supabase
      .from(CONV_TABLE)
      .update({ updated_at: now })
      .eq("id", id);
    if (error) console.warn("[chat] touchConversation error:", error);
  }, []);

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      setMessages((prev) => prev.filter((m) => m.conversationId !== id));
      setConversations((prev) => prev.filter((c) => c.id !== id));
      const { error } = await supabase.from(CONV_TABLE).delete().eq("id", id);
      if (error) console.error("[chat] deleteConversation error:", error);
    },
    [],
  );

  const addMessage = useCallback(
    async (
      conversationId: string,
      role: "user" | "assistant",
      content: string,
    ): Promise<ChatMessage | null> => {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      const msg: ChatMessage = { id, conversationId, role, content, createdAt };
      setMessages((prev) => [...prev, msg]);
      const { error } = await supabase.from(MSG_TABLE).insert({
        id,
        conversation_id: conversationId,
        role,
        content,
        created_at: createdAt,
      });
      if (error) {
        console.error("[chat] addMessage error:", error);
        setMessages((prev) => prev.filter((m) => m.id !== id));
        return null;
      }
      return msg;
    },
    [],
  );

  const addMemory = useCallback(
    async (
      content: string,
      category?: string,
      importance: number = 5,
    ): Promise<ChatMemory | null> => {
      const trimmed = content.trim();
      if (!trimmed) return null;
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      const mem: ChatMemory = {
        id,
        content: trimmed,
        category: category ?? null,
        importance,
        createdAt,
      };
      setMemories((prev) => [mem, ...prev]);
      const { error } = await supabase.from(MEM_TABLE).insert({
        id,
        content: trimmed,
        category: category ?? null,
        importance,
        created_at: createdAt,
      });
      if (error) {
        console.error("[chat] addMemory error:", error);
        setMemories((prev) => prev.filter((m) => m.id !== id));
        return null;
      }
      return mem;
    },
    [],
  );

  const deleteMemory = useCallback(async (id: string): Promise<void> => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from(MEM_TABLE).delete().eq("id", id);
    if (error) console.error("[chat] deleteMemory error:", error);
  }, []);

  const clearMemories = useCallback(async (): Promise<void> => {
    setMemories([]);
    const { error } = await supabase.from(MEM_TABLE).delete().neq("id", "");
    if (error) console.error("[chat] clearMemories error:", error);
  }, []);

  return {
    status,
    conversations,
    messages,
    memories,
    reload,
    createConversation,
    renameConversation,
    touchConversation,
    deleteConversation,
    addMessage,
    addMemory,
    deleteMemory,
    clearMemories,
  };
}
