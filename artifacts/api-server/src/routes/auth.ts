import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { signSession, requireAuth, SESSION_DAYS, type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const APP_USERNAME = process.env["APP_USERNAME"];
const APP_PASSWORD = process.env["APP_PASSWORD"];

if (!APP_USERNAME || !APP_PASSWORD) {
  throw new Error(
    "APP_USERNAME and APP_PASSWORD must be set. Use Replit Secrets to configure them.",
  );
}

const USERNAME: string = APP_USERNAME;
const PASSWORD: string = APP_PASSWORD;

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password required" });
    return;
  }

  const userOk = constantTimeEquals(username, USERNAME);
  const passOk = constantTimeEquals(password, PASSWORD);

  if (!userOk || !passOk) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signSession(USERNAME);
  res.json({
    token,
    expiresInDays: SESSION_DAYS,
    user: { username: USERNAME },
  });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: { username: req.userId } });
});

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
