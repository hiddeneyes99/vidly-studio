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
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  // Check JWT_SECRET first
  if (!process.env["JWT_SECRET"]) {
    res.status(503).json({
      error: "Server not configured: JWT_SECRET is missing. Add it to Replit Secrets.",
    });
    return;
  }

  const creds = getAdminCreds();
  if (!creds) {
    res.status(503).json({
      error: "Server not configured: ADMIN_USERNAME and ADMIN_PASSWORD are missing. Add them to Replit Secrets.",
    });
    return;
  }

  const usernameOk = safeEqual(username.trim(), creds.username.trim());
  const passwordOk = safeEqual(password, creds.password);

  if (!usernameOk || !passwordOk) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  try {
    const token = signSession(creds.username);
    res.json({
      token,
      expiresInDays: SESSION_DAYS,
      user: { username: creds.username },
    });
  } catch (err: any) {
    res.status(503).json({
      error: "Server not configured: " + (err?.message ?? "Unknown error"),
    });
  }
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

// Setup status — tells the frontend which secrets are configured
router.get("/auth/setup-status", (_req, res) => {
  res.json({
    jwtConfigured: !!process.env["JWT_SECRET"],
    adminConfigured: !!(process.env["ADMIN_USERNAME"] && process.env["ADMIN_PASSWORD"]),
    geminiConfigured: !!(
      process.env["GEMINI_API_KEY"] ||
      process.env["GOOGLE_GENAI_API_KEY"] ||
      process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"]
    ),
    dbConfigured: !!(process.env["DATABASE_URL"] || process.env["SUPABASE_DB_URL"]),
  });
});

export default router;
