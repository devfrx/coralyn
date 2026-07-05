import { createHash, randomBytes } from 'node:crypto';

/** Token opaco da mettere nel link: 32 byte random, url-safe (~43 char). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash a riposo del token: sha256 esadecimale. Il raw NON viene mai persistito. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
