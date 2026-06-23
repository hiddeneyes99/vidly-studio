import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export type AuthedRequest = Request & { userId?: string };

export const SESSION_DAYS = 7;

/**
 * JWT secret — reads JWT_SECRET env var.
 * Falls back to a stable derived secret so the server never crashes on startup.
 */
function getJwtSecret(): string {
  const s = process.env["JWT_SECRET"];
  if (s && s.length >= 16) return s;
  // Derive a stable fallback from REPL_ID (always available on Replit)
  const seed = process.env["REPL_ID"] ?? process.env["HOSTNAME"] ?? "creator-os-fallback";
  return crypto.createHash("sha256").update("jwt-" + seed).digest("hex");
}

/**
 * Admin credentials — supports both naming conventions:
 *   ADMIN_USERNAME / ADMIN_PASSWORD  (new)
 *   APP_USERNAME   / APP_PASSWORD    (old)
 */
export function getAdminCreds(): { username: string; password: string } | null {
  const username =
    process.env["ADMIN_USERNAME"] ||
    process.env["APP_USERNAME"] ||
    "";
  const password =
    process.env["ADMIN_PASSWORD"] ||
    process.env["APP_PASSWORD"] ||
    "";
  if (!username || !password) return null;
  return { username: username.trim(), password };
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: `${SESSION_DAYS}d`,
  });
}

export function verifySession(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifySession(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.userId = payload.sub;
  next();
}
