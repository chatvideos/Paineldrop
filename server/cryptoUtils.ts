/**
 * Utilitários de criptografia para patch do DEX Android.
 * Implementa Adler32 e SHA-1 em TypeScript puro.
 */

import { createHash } from "crypto";

/**
 * Calcula o checksum Adler32 de um buffer.
 * Usado para atualizar o checksum no header do DEX após patch.
 */
export function createAdler32(data: Buffer): number {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;

  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }

  // >>> 0 converte para uint32 não-negativo
  return ((b << 16) | a) >>> 0;
}

/**
 * Calcula o SHA-1 de um buffer.
 * Usado para atualizar o hash no header do DEX após patch.
 * Retorna um Buffer de 20 bytes.
 */
export function createSha1(data: Buffer): Buffer {
  return createHash("sha1").update(data).digest();
}
