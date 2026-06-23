import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  signSession,
  requireAuth,
  SESSION_DAYS,
  getAdminCreds,
  type AuthedRequest,
} from "../middlewares/auth";

const router: IRouter = Router();

function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    // Always run timingSafeEqual to prevent timing attacks even on length mismatch
    const len = Math.max(aBuf.length, bBuf.length);
    const pa = Buffer.alloc(len);
    const pb = Buffer.alloc(len);
    aBuf.copy(pa);
    bBuf.copy(pb);
    const eq = crypto.timingSafeEqual(pa, pb);
    return eq && aBuf.length === bBuf.length;
  } catch {
    return false;
  }
}

router.post("/auth/login", (req, res) => {
  const body = req.body ?? {};
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const creds = getAdminCreds();
  if (!creds) {
    res.status(503).json({
      error:
        "Server is not configured yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to Replit Secrets, then restart the server.",
    });
    return;
  }

  const usernameOk = safeEqual(username, creds.username);
  const passwordOk = safeEqual(password, creds.password);

  if (!usernameOk || !passwordOk) {
    res.status(401).json({ error: "Incorrect username or password." });
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

router.post("/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

router.get("/auth/setup-status", (_req, res) => {
  const creds = getAdminCreds();
  res.json({
    adminConfigured: !!creds,
    jwtConfigured: !!(process.env["JWT_SECRET"] && process.env["JWT_SECRET"].length >= 16),
    geminiConfigured: !!(
      process.env["GEMINI_API_KEY"] ||
      process.env["GOOGLE_GENAI_API_KEY"] ||
      process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"]
    ),
  });
});

export default router;
