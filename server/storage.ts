/**
 * Storage local em disco — compatível com qualquer hospedagem (Render, Railway, etc.)
 * Arquivos são salvos em /tmp/apk-storage/ e servidos via rota Express.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const STORAGE_DIR = process.env.STORAGE_DIR || "/tmp/apk-storage";

// Garante que o diretório existe
function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\//g, "_");
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  ensureDir();
  const key = appendHashSuffix(normalizeKey(relKey));
  const filePath = path.join(STORAGE_DIR, key);

  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data as any);
  fs.writeFileSync(filePath, buffer);

  const url = `/api/storage/${key}`;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = `/api/storage/${key}`;
  return { key, url };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/api/storage/${key}`;
}

export function getStoragePath(key: string): string {
  return path.join(STORAGE_DIR, key);
}
