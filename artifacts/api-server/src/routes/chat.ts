import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/chat/conversations", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, created_at, updated_at FROM chat_conversations ORDER BY updated_at DESC",
    );
    res.json({ conversations: result.rows });
  } catch {
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.post("/chat/conversations", async (req, res) => {
  const { id, title, created_at, updated_at } = req.body ?? {};
  if (!id || !title) {
    res.status(400).json({ error: "id and title required" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO chat_conversations (id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET title = $2, updated_at = $4`,
      [id, title, created_at ?? new Date().toISOString(), updated_at ?? new Date().toISOString()],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.patch("/chat/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const { title, updated_at } = req.body ?? {};
  try {
    await pool.query(
      "UPDATE chat_conversations SET title = COALESCE($1, title), updated_at = $2 WHERE id = $3",
      [title ?? null, updated_at ?? new Date().toISOString(), id],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

router.delete("/chat/conversations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM chat_conversations WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/chat/messages", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, conversation_id, role, content, created_at FROM chat_messages ORDER BY created_at ASC",
    );
    res.json({ messages: result.rows });
  } catch {
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/chat/messages", async (req, res) => {
  const { id, conversation_id, role, content, created_at } = req.body ?? {};
  if (!id || !conversation_id || !role || !content) {
    res.status(400).json({ error: "id, conversation_id, role, content required" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, conversation_id, role, content, created_at ?? new Date().toISOString()],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save message" });
  }
});

router.post("/chat/messages/bulk", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.json({ ok: true });
    return;
  }
  try {
    for (const m of messages) {
      const { id, conversation_id, role, content, created_at } = m;
      if (!id || !conversation_id || !role || !content) continue;
      await pool.query(
        `INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, conversation_id, role, content, created_at ?? new Date().toISOString()],
      );
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to bulk save messages" });
  }
});

router.get("/chat/memories", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, content, category, importance, created_at FROM chat_memories ORDER BY created_at DESC",
    );
    res.json({ memories: result.rows });
  } catch {
    res.status(500).json({ error: "Failed to load memories" });
  }
});

router.post("/chat/memories", async (req, res) => {
  const { id, content, category, importance, created_at } = req.body ?? {};
  if (!id || !content) {
    res.status(400).json({ error: "id and content required" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO chat_memories (id, content, category, importance, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, content, category ?? null, importance ?? 5, created_at ?? new Date().toISOString()],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save memory" });
  }
});

router.delete("/chat/memories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM chat_memories WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

router.delete("/chat/memories", async (_req, res) => {
  try {
    await pool.query("DELETE FROM chat_memories");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to clear memories" });
  }
});

export default router;
