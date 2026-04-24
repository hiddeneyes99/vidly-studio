import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { signSession, requireAuth, SESSION_DAYS, type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  try {
    const found = await db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const user = found[0];
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const passOk = await bcrypt.compare(password, user.passwordHash);
    if (!passOk) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = signSession(user.username);
    res.json({
      token,
      expiresInDays: SESSION_DAYS,
      user: { username: user.username },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: { username: req.userId } });
});

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

router.post("/auth/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    newPassword.length < 6
  ) {
    res
      .status(400)
      .json({ error: "currentPassword and newPassword (min 6 chars) required" });
    return;
  }

  const username = req.userId;
  if (!username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const found = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const user = found[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
