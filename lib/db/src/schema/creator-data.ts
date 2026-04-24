import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const creatorData = pgTable("creator_data", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CreatorDataRow = typeof creatorData.$inferSelect;
