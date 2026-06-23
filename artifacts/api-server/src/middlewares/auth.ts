import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthedRequest = Request & { userId?: string };

export const SESSION_DAYS = 7;

function getSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured. Add it to Replit Secrets.",
    );
  }
  return secret;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, getSecret(), {
    expiresIn: `${SESSION_DAYS}d`,
  });
}

export function verifySession(token: string): { sub: string } | null {
  try {
    const secret = process.env["JWT_SECRET"];
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
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
