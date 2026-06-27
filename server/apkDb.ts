import { eq } from "drizzle-orm";
import { apkJobs, InsertApkJob, ApkJob } from "../drizzle/schema";
import { getDb } from "./db";

export async function createApkJob(data: InsertApkJob): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(apkJobs).values(data);
}

export async function getApkJob(id: string): Promise<ApkJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(apkJobs).where(eq(apkJobs.id, id)).limit(1);
  return rows[0];
}

export async function updateApkJob(
  id: string,
  data: Partial<Omit<InsertApkJob, "id">>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(apkJobs).set(data).where(eq(apkJobs.id, id));
}
