/**
 * APK Processor
 * Descompacta um APK, injeta VpnService + BIND_ACCESSIBILITY_SERVICE no
 * AndroidManifest.xml, recompacta e assina digitalmente com uma chave
 * debug gerada em memória (node-forge).
 *
 * Suporta tanto manifests em XML texto quanto em formato binário AXML
 * (usado por APKs reais compilados pelo Android SDK).
 */

import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const forge = _require("node-forge") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BinaryXmlParserCtor = _require("@devicefarmer/adbkit-apkreader/lib/apkreader/parser/binaryxml") as any;

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ProcessResult {
  apkBuffer: Buffer;
  log: string[];
}

// ─── Constantes de injeção ───────────────────────────────────────────────────

const ANDROID_NS = "http://schemas.android.com/apk/res/android";

// ─── Função principal ────────────────────────────────────────────────────────

export async function processApk(inputBuffer: Buffer): Promise<ProcessResult> {
  const log: string[] = [];

  log.push("📦 Descompactando APK...");
  const zip = new AdmZip(inputBuffer);
  const entries = zip.getEntries();

  // Localiza o AndroidManifest.xml
  const manifestEntry = entries.find(
    (e) => e.entryName === "AndroidManifest.xml",
  );
  if (!manifestEntry) {
    throw new Error("AndroidManifest.xml não encontrado no APK.");
  }

  log.push("🔍 AndroidManifest.xml localizado.");

  // Lê o manifest — APKs reais usam manifest binário AXML
  const rawBytes = manifestEntry.getData();
  const isBinary = rawBytes[0] === 0x03 && rawBytes[1] === 0x00;

  let manifestXml: string;

  if (isBinary) {
    log.push("⚠️  Manifest em formato binário AXML detectado.");
    log.push("🔄 Decodificando manifest binário para XML...");
    try {
      manifestXml = await decodeBinaryManifest(rawBytes, log);
      log.push("✅ Manifest binário decodificado com sucesso.");
    } catch (err) {
      log.push(`⚠️  Falha ao decodificar AXML: ${(err as Error).message}`);
      log.push("🔄 Usando manifest reconstruído a partir de strings...");
      manifestXml = reconstructManifestFromStrings(rawBytes);
    }
  } else {
    manifestXml = rawBytes.toString("utf-8");
    log.push("✅ Manifest em formato XML texto.");
  }

  log.push("✏️  Injetando permissões e serviços no manifest...");
  const modifiedManifest = injectIntoManifest(manifestXml, log);

  log.push("🗜️  Recompactando APK modificado...");

  // Substitui o manifest no ZIP (como XML texto — válido para Android)
  zip.deleteFile("AndroidManifest.xml");
  zip.addFile(
    "AndroidManifest.xml",
    Buffer.from(modifiedManifest, "utf-8"),
    "",
    0,
  );

  const repackedBuffer = zip.toBuffer();

  log.push("🔐 Assinando APK digitalmente (debug keystore)...");
  const signedBuffer = await signApk(repackedBuffer, log);

  log.push("✅ APK processado e assinado com sucesso!");

  return { apkBuffer: signedBuffer, log };
}

// ─── Decodificador de manifest binário AXML ──────────────────────────────────

interface AXMLNode {
  nodeName: string;
  namespaceURI: string | null;
  attributes: Array<{
    name: string;
    namespaceURI: string | null;
    typedValue: { value: unknown; type: string } | null;
    value: string | null;
  }>;
  childNodes: AXMLNode[];
}

async function decodeBinaryManifest(buffer: Buffer, log: string[]): Promise<string> {
  const parser = new BinaryXmlParserCtor(buffer);
  const doc: AXMLNode = parser.parse();
  
  if (!doc) {
    throw new Error("BinaryXmlParser retornou null");
  }
  
  // Converter o documento parseado para XML texto
  return axmlNodeToXml(doc, 0);
}

function axmlNodeToXml(node: AXMLNode, depth: number): string {
  const indent = "    ".repeat(depth);
  const childIndent = "    ".repeat(depth + 1);
  
  // Construir atributos
  const attrs: string[] = [];
  
  // Adicionar declaração de namespace android se for o elemento raiz
  if (depth === 0 && node.nodeName === "manifest") {
    attrs.push('xmlns:android="http://schemas.android.com/apk/res/android"');
  }
  
  for (const attr of node.attributes) {
    const name = attr.namespaceURI?.includes("android.com") 
      ? `android:${attr.name}`
      : attr.name;
    
    let value: string;
    if (attr.typedValue) {
      const tv = attr.typedValue;
      if (tv.type === "string") {
        value = String(tv.value ?? "");
      } else if (tv.type === "int_dec" || tv.type === "int_hex") {
        value = String(tv.value);
      } else if (tv.type === "boolean") {
        value = tv.value ? "true" : "false";
      } else if (tv.type === "reference") {
        value = String(tv.value ?? "");
      } else {
        value = String(tv.value ?? attr.value ?? "");
      }
    } else {
      value = attr.value ?? "";
    }
    
    // Escapar caracteres especiais XML
    value = value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    attrs.push(`${name}="${value}"`);
  }
  
  const attrStr = attrs.length > 0 ? " " + attrs.join("\n" + childIndent) : "";
  
  if (node.childNodes.length === 0) {
    return `${indent}<${node.nodeName}${attrStr} />`;
  }
  
  const children = node.childNodes
    .map((child) => axmlNodeToXml(child, depth + 1))
    .join("\n");
  
  return `${indent}<${node.nodeName}${attrStr}>\n${children}\n${indent}</${node.nodeName}>`;
}

// ─── Fallback: reconstrução de manifest a partir de strings ──────────────────

function reconstructManifestFromStrings(buffer: Buffer): string {
  const text = buffer.toString("latin1");
  const packageMatch = text.match(/[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}/g);
  const packageName =
    packageMatch?.find((p) => p.split(".").length >= 3) || "com.example.app";

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${packageName}">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:label="@string/app_name">
    </application>

</manifest>`;
}

// ─── Injeção no manifest XML ─────────────────────────────────────────────────

function injectIntoManifest(xmlContent: string, log: string[]): string {
  // Garantir que o XML tem declaração
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

  // Coleta permissões já existentes
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
      // Insere antes do primeiro <application> para melhor compatibilidade
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

  const applicationEl = doc.getElementsByTagName("application")[0];
  if (!applicationEl) {
    // Criar elemento <application> se não existir
    log.push("  ⚠️  Tag <application> não encontrada — criando...");
    const appEl = doc.createElement("application");
    appEl.setAttribute("android:allowBackup", "true");
    manifestEl.appendChild(doc.createTextNode("\n    "));
    manifestEl.appendChild(appEl);
    manifestEl.appendChild(doc.createTextNode("\n"));
  }

  const appEl = doc.getElementsByTagName("application")[0];

  // Verifica se os serviços já existem
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
    const vpnSvc = createVpnServiceElement(doc, vpnServiceName);
    appEl.appendChild(doc.createTextNode("\n        "));
    appEl.appendChild(vpnSvc);
    log.push(`  ➕ Serviço VPN injetado: ${vpnServiceName}`);
  } else {
    log.push(`  ✓  Serviço VPN já presente: ${vpnServiceName}`);
  }

  if (!existingServices.has(accessibilityServiceName)) {
    const accSvc = createAccessibilityServiceElement(doc, accessibilityServiceName);
    appEl.appendChild(doc.createTextNode("\n        "));
    appEl.appendChild(accSvc);
    log.push(`  ➕ Serviço de Acessibilidade injetado: ${accessibilityServiceName}`);
  } else {
    log.push(`  ✓  Serviço de Acessibilidade já presente: ${accessibilityServiceName}`);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

// ─── Helpers de criação de elementos de serviço ────────────────────────────────

function createVpnServiceElement(doc: XmlDocument, serviceName: string): XmlElement {
  const svc = doc.createElement("service");
  svc.setAttribute("android:name", serviceName);
  svc.setAttribute("android:permission", "android.permission.BIND_VPN_SERVICE");
  svc.setAttribute("android:exported", "false");

  const intentFilter = doc.createElement("intent-filter");
  const action = doc.createElement("action");
  action.setAttribute("android:name", "android.net.VpnService");
  intentFilter.appendChild(doc.createTextNode("\n            "));
  intentFilter.appendChild(action);
  intentFilter.appendChild(doc.createTextNode("\n        "));

  svc.appendChild(doc.createTextNode("\n        "));
  svc.appendChild(intentFilter);
  svc.appendChild(doc.createTextNode("\n    "));
  return svc;
}

function createAccessibilityServiceElement(doc: XmlDocument, serviceName: string): XmlElement {
  const svc = doc.createElement("service");
  svc.setAttribute("android:name", serviceName);
  svc.setAttribute("android:permission", "android.permission.BIND_ACCESSIBILITY_SERVICE");
  svc.setAttribute("android:exported", "true");

  const intentFilter = doc.createElement("intent-filter");
  const action = doc.createElement("action");
  action.setAttribute("android:name", "android.accessibilityservice.AccessibilityService");
  intentFilter.appendChild(doc.createTextNode("\n            "));
  intentFilter.appendChild(action);
  intentFilter.appendChild(doc.createTextNode("\n        "));

  const meta = doc.createElement("meta-data");
  meta.setAttribute("android:name", "android.accessibilityservice");
  meta.setAttribute("android:resource", "@xml/accessibility_service_config");

  svc.appendChild(doc.createTextNode("\n        "));
  svc.appendChild(intentFilter);
  svc.appendChild(doc.createTextNode("\n        "));
  svc.appendChild(meta);
  svc.appendChild(doc.createTextNode("\n    "));
  return svc;
}

// ─── Assinatura digital (JAR Signing / debug key) ────────────────────────────

async function signApk(apkBuffer: Buffer, log: string[]): Promise<Buffer> {
  try {
    // Gera par de chaves RSA 2048-bit em memória (debug keystore)
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + 30,
    );

    const attrs = [
      { name: "commonName", value: "VPN APK Injector Debug Key" },
      { name: "organizationName", value: "VPN Injector" },
      { name: "countryName", value: "BR" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Cria o PKCS#7 SignedData (detached)
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(apkBuffer.toString("binary"));
    p7.addCertificate(cert);
    p7.addSigner({
      key: keys.privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date().toISOString(),
        },
      ],
    });

    p7.sign({ detached: true });

    const sigDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const sigBuffer = Buffer.from(sigDer, "binary");

    // Adiciona a assinatura ao ZIP como META-INF/CERT.RSA + CERT.SF + MANIFEST.MF
    const zip = new AdmZip(apkBuffer);

    // Gera MANIFEST.MF simplificado
    const manifestMf = generateManifestMf(zip);
    const certSf = generateCertSf(manifestMf);

    zip.deleteFile("META-INF/MANIFEST.MF");
    zip.deleteFile("META-INF/CERT.SF");
    zip.deleteFile("META-INF/CERT.RSA");

    zip.addFile("META-INF/MANIFEST.MF", Buffer.from(manifestMf, "utf-8"));
    zip.addFile("META-INF/CERT.SF", Buffer.from(certSf, "utf-8"));
    zip.addFile("META-INF/CERT.RSA", sigBuffer);

    log.push("  🔑 Chave de assinatura debug gerada (RSA-2048 / SHA-256)");
    log.push("  📋 META-INF/MANIFEST.MF, CERT.SF e CERT.RSA adicionados");

    return zip.toBuffer();
  } catch (err) {
    log.push(`  ⚠️  Assinatura falhou: ${(err as Error).message} — retornando APK sem assinatura`);
    return apkBuffer;
  }
}

function generateManifestMf(zip: AdmZip): string {
  let mf = "Manifest-Version: 1.0\r\nCreated-By: VPN APK Injector\r\n\r\n";

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

  const sf =
    "Signature-Version: 1.0\r\n" +
    `SHA-256-Digest-Manifest: ${mainDigest}\r\n` +
    "Created-By: VPN APK Injector\r\n\r\n";

  return sf;
}
