import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthedRequest = Request & { userId?: string };

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required. Set it via Replit Secrets.",
  );
}

const SECRET: string = JWT_SECRET;

export const SESSION_DAYS = 7;

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  });
}

export function verifySession(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
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
