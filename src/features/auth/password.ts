import * as Crypto from 'expo-crypto';

const HASH_ITERATIONS = 1200;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return bytesToHex(bytes);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  let current = `${salt}:${password}`;
  for (let i = 0; i < HASH_ITERATIONS; i += 1) {
    current = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${current}:${i}`,
    );
  }
  return current;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const computed = await hashPassword(password, salt);
  return safeEqual(computed, expectedHash);
}
