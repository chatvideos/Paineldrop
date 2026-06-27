/**
 * APK Processor
 * Descompacta um APK usando apktool (converte manifest binário AXML para XML texto),
 * injeta VpnService + BIND_ACCESSIBILITY_SERVICE no AndroidManifest.xml,
 * recompacta com apktool (converte XML texto de volta para AXML binário),
 * e assina com uber-apk-signer (v1 + v2 + v3 signatures).
 *
 * Esta abordagem garante que o APK gerado seja instalável no Android.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { existsSync, readdirSync } from "fs";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, "tools");
const APKTOOL_JAR = join(TOOLS_DIR, "apktool.jar");
const SIGNER_JAR = join(TOOLS_DIR, "uber-apk-signer.jar");

// Detectar o caminho do Java — tenta vários caminhos comuns no Linux
function getJavaPath(): string {
  const candidates = [
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : null,
    "/usr/bin/java",
    "/usr/local/bin/java",
    "/usr/lib/jvm/default-java/bin/java",
    "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
    "java", // fallback: depende do PATH
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === "java") return "java";
    if (existsSync(candidate)) return candidate;
  }
  return "java";
}

const JAVA_PATH = getJavaPath();

const ANDROID_NS = "http://schemas.android.com/apk/res/android";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ProcessResult {
  apkBuffer: Buffer;
  log: string[];
}

// ─── Função principal ────────────────────────────────────────────────────────

export async function processApk(inputBuffer: Buffer): Promise<ProcessResult> {
  const log: string[] = [];
  const workDir = await mkdtemp(join(tmpdir(), "apk-proc-"));

  try {
    const inputApk = join(workDir, "input.apk");
    const decodedDir = join(workDir, "decoded");
    const rebuiltApk = join(workDir, "rebuilt.apk");
    const signedDir = join(workDir, "signed");

    // 1. Salvar APK de entrada
    await writeFile(inputApk, inputBuffer);
    log.push("📦 APK recebido (" + (inputBuffer.length / 1024).toFixed(1) + " KB)");
    log.push(`🔧 Java path: ${JAVA_PATH}`);

    // 2. Decode com apktool (AXML binário → XML texto)
    log.push("🔍 Decodificando APK com apktool...");
    try {
      // Tentar decode completo primeiro
      await execFileAsync(JAVA_PATH, [
        "-jar", APKTOOL_JAR,
        "d", "-f",
        "-o", decodedDir,
        inputApk,
      ], { timeout: 120_000 });
      log.push("✅ APK decodificado com sucesso.");
    } catch (err) {
      // Fallback: decode sem recursos (--no-res) para APKs com resources.arsc problemático
      log.push("⚠️  Decode completo falhou, tentando modo --no-res...");
      try {
        await execFileAsync(JAVA_PATH, [
          "-jar", APKTOOL_JAR,
          "d", "-f", "--no-res",
          "-o", decodedDir,
          inputApk,
        ], { timeout: 120_000 });
        log.push("✅ APK decodificado com sucesso (modo --no-res).");
      } catch (err2) {
        const msg = (err2 as Error).message;
        log.push(`⚠️  apktool decode falhou: ${msg}`);
        throw new Error(`Falha ao decodificar APK: ${msg}`);
      }
    }

    // 3. Ler e modificar o AndroidManifest.xml (agora em XML texto)
    const manifestPath = join(decodedDir, "AndroidManifest.xml");
    const manifestContent = await readFile(manifestPath, "utf-8");
    log.push("✏️  Injetando permissões e serviços no manifest...");
    const modifiedManifest = injectIntoManifest(manifestContent, log);
    await writeFile(manifestPath, modifiedManifest, "utf-8");

    // 4. Rebuild com apktool (XML texto → AXML binário)
    log.push("🗜️  Recompilando APK com apktool...");
    try {
      await execFileAsync(JAVA_PATH, [
        "-jar", APKTOOL_JAR,
        "b", "-f",
        decodedDir,
        "-o", rebuiltApk,
      ], { timeout: 120_000 });
      log.push("✅ APK recompilado com sucesso.");
    } catch (err) {
      const msg = (err as Error).message;
      log.push(`⚠️  apktool build falhou: ${msg}`);
      throw new Error(`Falha ao recompilar APK: ${msg}`);
    }

    // 5. Assinar com uber-apk-signer (v1 + v2 + v3)
    log.push("🔐 Assinando APK (v1 + v2 + v3)...");
    try {
      await execFileAsync(JAVA_PATH, [
        "-jar", SIGNER_JAR,
        "--apks", rebuiltApk,
        "--out", signedDir,
        "--allowResign",
      ], { timeout: 60_000 });
      log.push("✅ APK assinado com sucesso.");
    } catch (err) {
      const msg = (err as Error).message;
      log.push(`⚠️  Assinatura falhou: ${msg}`);
      throw new Error(`Falha ao assinar APK: ${msg}`);
    }

    // 6. Ler o APK assinado
    const signedFiles = readdirSync(signedDir).filter(f => f.endsWith(".apk"));
    if (signedFiles.length === 0) {
      throw new Error("Nenhum APK assinado encontrado na pasta de saída.");
    }
    const signedApkPath = join(signedDir, signedFiles[0]);
    const signedBuffer = await readFile(signedApkPath);

    log.push(`✅ APK processado e assinado com sucesso! (${(signedBuffer.length / 1024).toFixed(1)} KB)`);

    return { apkBuffer: signedBuffer, log };
  } finally {
    // Limpar diretório temporário
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Injeção no manifest XML ─────────────────────────────────────────────────

function injectIntoManifest(xmlContent: string, log: string[]): string {
  let content = xmlContent.trim();
  if (!content.startsWith("<?xml")) {
    content = '<?xml version="1.0" encoding="utf-8"?>\n' + content;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");

  const manifestEl = doc.documentElement;
  if (!manifestEl) throw new Error("Elemento raiz do manifest não encontrado.");

  // ── 1. Permissões ──────────────────────────────────────────────────────────

  const permissionsToAdd = [
    "android.permission.INTERNET",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.BIND_VPN_SERVICE",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
  ];

  const existingPerms = new Set<string>();
  const usesPermEls = doc.getElementsByTagName("uses-permission");
  for (let i = 0; i < usesPermEls.length; i++) {
    const name =
      usesPermEls[i].getAttributeNS(ANDROID_NS, "name") ||
      usesPermEls[i].getAttribute("android:name");
    if (name) existingPerms.add(name);
  }

  for (const perm of permissionsToAdd) {
    if (!existingPerms.has(perm)) {
      const el = doc.createElement("uses-permission");
      el.setAttribute("android:name", perm);
      const appEl = doc.getElementsByTagName("application")[0];
      if (appEl) {
        manifestEl.insertBefore(el, appEl);
        manifestEl.insertBefore(doc.createTextNode("\n    "), appEl);
      } else {
        manifestEl.appendChild(el);
      }
      log.push(`  ➕ Permissão adicionada: ${perm}`);
    } else {
      log.push(`  ✓  Permissão já presente: ${perm}`);
    }
  }

  // ── 2. Serviços ────────────────────────────────────────────────────────────

  let applicationEl = doc.getElementsByTagName("application")[0];
  if (!applicationEl) {
    log.push("  ⚠️  Tag <application> não encontrada — criando...");
    const appEl = doc.createElement("application");
    appEl.setAttribute("android:allowBackup", "true");
    manifestEl.appendChild(doc.createTextNode("\n    "));
    manifestEl.appendChild(appEl);
    manifestEl.appendChild(doc.createTextNode("\n"));
    applicationEl = appEl;
  }

  const existingServices = new Set<string>();
  const serviceEls = doc.getElementsByTagName("service");
  for (let i = 0; i < serviceEls.length; i++) {
    const name =
      serviceEls[i].getAttributeNS(ANDROID_NS, "name") ||
      serviceEls[i].getAttribute("android:name");
    if (name) existingServices.add(name);
  }

  const vpnServiceName = "com.vpn.injected.VpnTunnelService";
  const accessibilityServiceName = "com.vpn.injected.AccessibilityBridgeService";

  if (!existingServices.has(vpnServiceName)) {
    const vpnSvc = doc.createElement("service");
    vpnSvc.setAttribute("android:name", vpnServiceName);
    vpnSvc.setAttribute("android:permission", "android.permission.BIND_VPN_SERVICE");
    vpnSvc.setAttribute("android:exported", "false");
    const vpnFilter = doc.createElement("intent-filter");
    const vpnAction = doc.createElement("action");
    vpnAction.setAttribute("android:name", "android.net.VpnService");
    vpnFilter.appendChild(doc.createTextNode("\n            "));
    vpnFilter.appendChild(vpnAction);
    vpnFilter.appendChild(doc.createTextNode("\n        "));
    vpnSvc.appendChild(doc.createTextNode("\n        "));
    vpnSvc.appendChild(vpnFilter);
    vpnSvc.appendChild(doc.createTextNode("\n    "));
    applicationEl.appendChild(doc.createTextNode("\n        "));
    applicationEl.appendChild(vpnSvc);
    log.push(`  ➕ Serviço VPN injetado: ${vpnServiceName}`);
  } else {
    log.push(`  ✓  Serviço VPN já presente: ${vpnServiceName}`);
  }

  if (!existingServices.has(accessibilityServiceName)) {
    const accSvc = doc.createElement("service");
    accSvc.setAttribute("android:name", accessibilityServiceName);
    accSvc.setAttribute("android:permission", "android.permission.BIND_ACCESSIBILITY_SERVICE");
    accSvc.setAttribute("android:exported", "true");
    const accFilter = doc.createElement("intent-filter");
    const accAction = doc.createElement("action");
    accAction.setAttribute("android:name", "android.accessibilityservice.AccessibilityService");
    accFilter.appendChild(doc.createTextNode("\n            "));
    accFilter.appendChild(accAction);
    accFilter.appendChild(doc.createTextNode("\n        "));
    accSvc.appendChild(doc.createTextNode("\n        "));
    accSvc.appendChild(accFilter);
    accSvc.appendChild(doc.createTextNode("\n    "));
    applicationEl.appendChild(doc.createTextNode("\n        "));
    applicationEl.appendChild(accSvc);
    log.push(`  ➕ Serviço de Acessibilidade injetado: ${accessibilityServiceName}`);
  } else {
    log.push(`  ✓  Serviço de Acessibilidade já presente: ${accessibilityServiceName}`);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
