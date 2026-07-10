import { randomInt } from 'node:crypto';

/** PIN operatore (secondo fattore): 6 cifre uniformi, zero-padded. randomInt = CSPRNG. */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
