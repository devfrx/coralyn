import { Transform } from 'class-transformer';

/**
 * Normalizza un campo contatto opzionale: trim della stringa e conversione di
 * `''` (stringa vuota) in `null`. Così un campo svuotato dal form vale "assente"
 * (→ NULL in DB, → undefined nel DTO via proiezione) anziché stringa vuota, e
 * `@IsEmail`/`@IsOptional` non scattano su un valore vuoto. Vedi ADR-0023.
 */
export const NormalizeContatto = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
  });
