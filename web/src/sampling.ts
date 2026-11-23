const MODULUS = 1_000_000;

export function sampleThreshold(sampleRate: number): number {
  if (sampleRate < 0 || sampleRate > 1) {
    throw new Error("sampleRate must be between 0 and 1");
  }
  return Math.round(sampleRate * MODULUS);
}

export async function isSessionIncluded(sessionId: string, sampleRate: number): Promise<boolean> {
  const threshold = sampleThreshold(sampleRate);
  if (threshold <= 0) return false;
  if (threshold >= MODULUS) return true;

  const enc = new TextEncoder();
  const data = enc.encode(sessionId);

  let digest: Uint8Array;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    digest = new Uint8Array(buf);
  } else {
    // Node.js fallback
    const { createHash } = await import("node:crypto");
    digest = createHash("sha256").update(data).digest();
  }

  // Read first 8 bytes as big-endian integer
  let num = 0n;
  for (let i = 0; i < 8; i++) {
    num = (num << 8n) | BigInt(digest[i]);
  }

  const bucket = Number(num % BigInt(MODULUS));
  return bucket < threshold;
}
