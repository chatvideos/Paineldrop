import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { processApk } from "./apkProcessor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMinimalApk(manifestContent: string): Buffer {
  const zip = new AdmZip();
  zip.addFile("AndroidManifest.xml", Buffer.from(manifestContent, "utf-8"));
  zip.addFile("classes.dex", Buffer.from("DEX_PLACEHOLDER"));
  zip.addFile("resources.arsc", Buffer.from("RESOURCES_PLACEHOLDER"));
  return zip.toBuffer();
}

const MINIMAL_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.testapp">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:label="Test App">

        <activity android:name=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>

</manifest>`;

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("processApk", () => {
  it("deve processar um APK válido e retornar buffer e log", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    expect(result.apkBuffer).toBeInstanceOf(Buffer);
    expect(result.apkBuffer.length).toBeGreaterThan(0);
    expect(result.log).toBeInstanceOf(Array);
    expect(result.log.length).toBeGreaterThan(0);
  }, 30000);

  it("deve injetar VpnService no manifest", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    expect(manifestEntry).toBeTruthy();

    const manifestContent = manifestEntry!.getData().toString("utf-8");
    expect(manifestContent).toContain("VpnTunnelService");
    expect(manifestContent).toContain("android.net.VpnService");
  }, 30000);

  it("deve injetar AccessibilityBridgeService no manifest", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    const manifestContent = manifestEntry!.getData().toString("utf-8");

    expect(manifestContent).toContain("AccessibilityBridgeService");
    expect(manifestContent).toContain("android.accessibilityservice.AccessibilityService");
  }, 30000);

  it("deve adicionar permissão BIND_VPN_SERVICE ao manifest", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    const manifestContent = manifestEntry!.getData().toString("utf-8");

    expect(manifestContent).toContain("android.permission.BIND_VPN_SERVICE");
  }, 30000);

  it("deve adicionar permissão BIND_ACCESSIBILITY_SERVICE ao manifest", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const manifestEntry = zip.getEntry("AndroidManifest.xml");
    const manifestContent = manifestEntry!.getData().toString("utf-8");

    expect(manifestContent).toContain("android.permission.BIND_ACCESSIBILITY_SERVICE");
  }, 30000);

  it("deve incluir entradas META-INF no APK assinado", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const zip = new AdmZip(result.apkBuffer);
    const entries = zip.getEntries().map((e) => e.entryName);

    expect(entries.some((e) => e.startsWith("META-INF/"))).toBe(true);
  }, 30000);

  it("deve incluir log com mensagem de sucesso", async () => {
    const inputBuffer = createMinimalApk(MINIMAL_MANIFEST);
    const result = await processApk(inputBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("sucesso");
  }, 30000);

  it("deve lançar erro quando APK não contém AndroidManifest.xml", async () => {
    const zip = new AdmZip();
    zip.addFile("classes.dex", Buffer.from("DEX_PLACEHOLDER"));
    const buffer = zip.toBuffer();

    await expect(processApk(buffer)).rejects.toThrow("AndroidManifest.xml");
  }, 30000);

  it("não deve duplicar serviços se já existirem no manifest", async () => {
    const manifestWithVpn = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.testapp">
    <application android:label="Test">
        <service
            android:name="com.vpn.injected.VpnTunnelService"
            android:permission="android.permission.BIND_VPN_SERVICE">
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>
    </application>
</manifest>`;

    const inputBuffer = createMinimalApk(manifestWithVpn);
    const result = await processApk(inputBuffer);

    const logText = result.log.join("\n");
    expect(logText).toContain("já presente");
  }, 30000);
});
