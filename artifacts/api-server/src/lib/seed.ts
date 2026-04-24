import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { logger } from "./logger";

export async function seedAdminUserFromEnv(): Promise<void> {
  const username = process.env["APP_USERNAME"];
  const password = process.env["APP_PASSWORD"];

  if (!username || !password) {
    return;
  }

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({ username, passwordHash });
    logger.info({ username }, "Seeded admin user from env vars");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
