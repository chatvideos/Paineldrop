/**
 * Rotas REST para o APK Injector
 * POST /api/apk/upload  — recebe APK, inicia processamento assíncrono
 * GET  /api/apk/status/:id — retorna status + log do job
 * GET  /api/apk/download/:id — redireciona para URL do APK modificado
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { processApk } from "./apkProcessor";
import { storagePut, storageGet } from "./storage";
import { createApkJob, getApkJob, updateApkJob } from "./apkDb";

const router = Router();

// Multer: armazena em memória (limite 200 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/vnd.android.package-archive" ||
      file.mimetype === "application/octet-stream" ||
      file.originalname.toLowerCase().endsWith(".apk")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos .apk são aceitos."));
    }
  },
});

// ─── POST /api/apk/upload ────────────────────────────────────────────────────

router.post("/upload", upload.single("apk"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo APK enviado." });
      return;
    }

    const jobId = uuidv4();
    const originalName = req.file.originalname;

    // Salva APK original no S3
    const { key: originalKey } = await storagePut(
      `apk-jobs/${jobId}/original_${originalName}`,
      req.file.buffer,
      "application/vnd.android.package-archive",
    );

    // Cria registro do job
    await createApkJob({
      id: jobId,
      originalName,
      status: "pending",
      progress: 0,
      originalKey,
    });

    // Processa de forma assíncrona
    processApkAsync(jobId, req.file.buffer, originalName);

    res.json({ jobId, status: "pending" });
  } catch (err) {
    console.error("[APK Upload]", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/apk/status/:id ─────────────────────────────────────────────────

router.get("/status/:id", async (req: Request, res: Response) => {
  try {
    const job = await getApkJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job não encontrado." });
      return;
    }

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      log: job.logText ? job.logText.split("\n") : [],
      originalName: job.originalName,
      downloadUrl: job.modifiedUrl || null,
      errorMessage: job.errorMessage || null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/apk/download/:id ───────────────────────────────────────────────

router.get("/download/:id", async (req: Request, res: Response) => {
  try {
    const job = await getApkJob(req.params.id);
    if (!job || job.status !== "done" || !job.modifiedKey) {
      res.status(404).json({ error: "APK modificado não disponível." });
      return;
    }

    const { url } = await storageGet(job.modifiedKey);
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Processamento assíncrono ─────────────────────────────────────────────────

async function processApkAsync(
  jobId: string,
  inputBuffer: Buffer,
  originalName: string,
): Promise<void> {
  try {
    await updateApkJob(jobId, { status: "processing", progress: 10 });

    await updateApkJob(jobId, {
      progress: 20,
      logText: "📦 Descompactando APK...",
    });

    const result = await processApk(inputBuffer);

    await updateApkJob(jobId, { progress: 70 });

    // Salva APK modificado no S3
    const modifiedName = originalName.replace(/\.apk$/i, "") + "_vpn_injected.apk";
    const { key: modifiedKey, url: modifiedUrl } = await storagePut(
      `apk-jobs/${jobId}/modified_${modifiedName}`,
      result.apkBuffer,
      "application/vnd.android.package-archive",
    );

    await updateApkJob(jobId, { progress: 90 });

    const logText = result.log.join("\n");

    await updateApkJob(jobId, {
      status: "done",
      progress: 100,
      logText,
      modifiedKey,
      modifiedUrl,
    });
  } catch (err) {
    console.error("[APK Process]", err);
    await updateApkJob(jobId, {
      status: "error",
      progress: 0,
      errorMessage: (err as Error).message,
      logText: `❌ Erro durante o processamento: ${(err as Error).message}`,
    });
  }
}

export default router;
