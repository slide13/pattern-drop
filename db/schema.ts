import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const transferSessions = sqliteTable("transfer_sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("waiting"),
  objectKey: text("object_key"),
  width: integer("width"),
  height: integer("height"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("idx_transfer_sessions_updated_at").on(table.updatedAt),
]);

export const sessionImages = sqliteTable("session_images", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  objectKey: text("object_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index("idx_session_images_session_created").on(table.sessionId, table.createdAt),
]);
