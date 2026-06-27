import { eq } from "drizzle-orm";
import { dropperJobs, InsertDropperJob, DropperJob } from "../drizzle/schema";
import { getDb } from "./db";

export async function createDropperJob(data: InsertDropperJob): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(dropperJobs).values(data);
}

export async function getDropperJob(id: string): Promise<DropperJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(dropperJobs).where(eq(dropperJobs.id, id)).limit(1);
  return rows[0];
}

export async function updateDropperJob(
  id: string,
  data: Partial<Omit<InsertDropperJob, "id">>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dropperJobs).set(data).where(eq(dropperJobs.id, id));
}
