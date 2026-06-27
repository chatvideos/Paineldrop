/**
 * Testes do apkProcessor
 *
 * Usa o APK minimal_built.apk (gerado com apktool) como entrada real,
 * pois o processador requer um APK com AndroidManifest.xml binário (AXML)
 * ou XML texto válido que o apktool consiga decodificar.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import { processApk } from "./apkProcessor";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const APKTOOL_JAR = join(__dirname, "tools", "apktool.jar");

// ─── Helper: criar APK real com apktool ──────────────────────────────────────

async function createRealApk(manifest: string): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "apk-test-"));
  try {
    const appDir = join(workDir, "app");
    const { mkdir } = await import("fs/promises");
    await mkdir(appDir);

    await writeFile(join(appDir, "AndroidManifest.xml"), manifest, "utf-8");
    await writeFile(
      join(appDir, "apktool.yml"),
      [
        "!!brut.androlib.meta.MetaInfo",
        "apkFileName: test.apk",
        "isFrameworkApk: false",
        "packageInfo:",
        "  forcedPackageId: '127'",
        "sdkInfo:",
        "  minSdkVersion: '21'",
        "  targetSdkVersion: '33'",
        "sharedLibrary: false",
        "sparseResources: false",
        "unknownFiles: {}",
        "usesFramework:",
        "  ids:",
        "  - 1",
        "version: 2.9.3",
      ].join("\n"),
      "utf-8"
    );

    const outputApk = join(workDir, "test.apk");
    await execFileAsync("java", [
      "-jar", APKTOOL_JAR,
      "b", "-f",
      appDir,
      "-o", outputApk,
    ], { timeout: 60_000 });

    return await readFile(outputApk);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Manifest de teste ────────────────────────────────────────────────────────

const MINIMAL_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.testapp"
    android:versionCode="1"
    android:versionName="1.0">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:label="Test App">

        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>

</manifest>`;

const MANIFEST_WITH_VPN = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.testapp"
    android:versionCode="1"
    android:versionName="1.0">

    <application android:label="Test">
        <service
            android:name="com.vpn.injected.VpnTunnelService"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>
    </application>

</manifest>`;

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("processApk", () => {
  let realApkBuffer: Buffer;
  let realApkWithVpnBuffer: Buffer;

  beforeAll(async () => {
    realApkBuffer = await createRealApk(MINIMAL_MANIFEST);
    realApkWithVpnBuffer = await createRealApk(MANIFEST_WITH_VPN);
  }, 120_000);

  it("deve processar um APK válido e retornar buffer e log", async () => {
    const result = await processApk(realApkBuffer);

    expect(result.apkBuffer).toBeInstanceOf(Buffer);
    expect(result.apkBuffer.length).toBeGreaterThan(0);
    expect(result.log).toBeInstanceOf(Array);
    expect(result.log.length).toBeGreaterThan(0);
  }, 120_000);

  it("deve gerar APK com manifest binário AXML", async () => {
    const result = await processApk(realApkBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    expect(manifestEntry).toBeTruthy();

    const data = manifestEntry!.getData();
    // Manifest binário AXML começa com 0x03 0x00
    expect(data[0]).toBe(0x03);
    expect(data[1]).toBe(0x00);
  }, 120_000);

  it("deve incluir assinatura META-INF no APK", async () => {
    const result = await processApk(realApkBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const entries = zip.getEntries().map((e) => e.entryName);

    expect(entries.some((e) => e.startsWith("META-INF/"))).toBe(true);
    expect(entries.some((e) => e.endsWith(".SF"))).toBe(true);
    expect(entries.some((e) => e.endsWith(".RSA"))).toBe(true);
  }, 120_000);

  it("deve incluir log com mensagem de sucesso", async () => {
    const result = await processApk(realApkBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("sucesso");
  }, 120_000);

  it("deve injetar permissão BIND_VPN_SERVICE no log", async () => {
    const result = await processApk(realApkBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("BIND_VPN_SERVICE");
  }, 120_000);

  it("deve injetar permissão BIND_ACCESSIBILITY_SERVICE no log", async () => {
    const result = await processApk(realApkBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("BIND_ACCESSIBILITY_SERVICE");
  }, 120_000);

  it("deve injetar VpnTunnelService no log", async () => {
    const result = await processApk(realApkBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("VpnTunnelService");
  }, 120_000);

  it("deve injetar AccessibilityBridgeService no log", async () => {
    const result = await processApk(realApkBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("AccessibilityBridgeService");
  }, 120_000);

  it("não deve duplicar serviços se já existirem no manifest", async () => {
    const result = await processApk(realApkWithVpnBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("já presente");
  }, 120_000);
});
