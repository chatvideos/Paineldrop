/**
 * dbInit.ts
 * Auto-creates all required tables on server startup using raw SQL.
 * This ensures the database schema is always up-to-date on any hosting
 * environment (Render, Railway, filess.io, etc.) without requiring manual migrations.
 *
 * Uses CURRENT_TIMESTAMP instead of (now()) for compatibility with MySQL 5.x / older versions.
 */

import mysql from "mysql2/promise";

export async function initDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[DB Init] DATABASE_URL not set — skipping table creation");
    return;
  }

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    console.log("[DB Init] Connected to database, ensuring tables exist...");

    // Create users table (if not exists)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`openId\` varchar(64) NOT NULL,
        \`name\` text,
        \`email\` varchar(320),
        \`loginMethod\` varchar(64),
        \`role\` enum('user','admin') NOT NULL DEFAULT 'user',
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`lastSignedIn\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`users_openId_unique\` (\`openId\`)
      )
    `);

    // Create apk_jobs table (if not exists)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`apk_jobs\` (
        \`id\` varchar(64) NOT NULL,
        \`original_name\` varchar(512) NOT NULL,
        \`status\` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
        \`progress\` int NOT NULL DEFAULT 0,
        \`log_text\` text,
        \`original_key\` varchar(512),
        \`modified_key\` varchar(512),
        \`modified_url\` text,
        \`error_message\` text,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      )
    `);

    // Create dropper_jobs table (if not exists)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`dropper_jobs\` (
        \`id\` varchar(64) NOT NULL,
        \`app_name\` varchar(256) NOT NULL,
        \`package_name\` varchar(256),
        \`payload_name\` varchar(512) NOT NULL,
        \`status\` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
        \`progress\` int NOT NULL DEFAULT 0,
        \`log_text\` text,
        \`payload_key\` varchar(512),
        \`icon_key\` varchar(512),
        \`dropper_key\` varchar(512),
        \`dropper_url\` text,
        \`error_message\` text,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      )
    `);

    console.log("[DB Init] All tables are ready.");
  } catch (error) {
    console.error("[DB Init] Failed to initialize database tables:", error);
    // Don't throw — let the server start anyway and fail gracefully on first request
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
