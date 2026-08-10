const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 0x0f];
  return out;
}

function randomHex(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

/**
 * 32 hex characters drawn from a CSPRNG. The shape matches an MD5 digest, but
 * the bytes are random rather than derived — a hash of guessable input would
 * make the id guessable.
 */
export function generateDeckId(): string {
  return randomHex(16);
}

export function generateApiKey(): string {
  return `sk_${randomHex(16)}`;
}

export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return toHex(new Uint8Array(digest));
}

/** Constant-time for equal-length inputs; length inequality is not secret here. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match ? match[1] : null;
}
