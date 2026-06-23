import { Router, type IRouter } from "express";
import crypto from "crypto";
import { signSession, requireAuth, SESSION_DAYS, type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function getAdminCreds(): { username: string; password: string } | null {
  const username = process.env["ADMIN_USERNAME"];
  const password = process.env["ADMIN_PASSWORD"];
  if (!username || !password) return null;
  return { username, password };
}

function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length) {
      crypto.timingSafeEqual(aBuf, aBuf);
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  const creds = getAdminCreds();
  if (!creds) {
    res.status(503).json({
      error: "Server not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in Replit Secrets.",
    });
    return;
  }

  const usernameOk = safeEqual(username, creds.username);
  const passwordOk = safeEqual(password, creds.password);

  if (!usernameOk || !passwordOk) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signSession(creds.username);
  res.json({
    token,
    expiresInDays: SESSION_DAYS,
    user: { username: creds.username },
  });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: { username: req.userId } });
});

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

router.post("/auth/change-password", requireAuth, (_req, res) => {
  res.status(400).json({
    error: "Password change via API is disabled. Update ADMIN_PASSWORD in Replit Secrets instead.",
  });
});

export default router;
