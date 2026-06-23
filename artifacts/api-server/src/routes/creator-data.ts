import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const ROW_ID = "default";

router.get("/creator-data", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT data FROM creator_data WHERE id = $1",
      [ROW_ID],
    );
    if (result.rows.length === 0) {
      res.json({ data: null });
      return;
    }
    res.json({ data: result.rows[0].data });
  } catch (err) {
    res.status(500).json({ error: "Failed to load creator data" });
  }
});

router.put("/creator-data", async (req, res) => {
  const { data } = req.body ?? {};
  if (!data || typeof data !== "object") {
    res.status(400).json({ error: "data (object) required" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO creator_data (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [ROW_ID, JSON.stringify(data)],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save creator data" });
  }
});

export default router;
