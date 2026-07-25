/**
 * Id sintetici dei seed di sviluppo, in UN solo posto.
 *
 * `seed.ts` e `seed-report-demo.ts` avevano ciascuno la propria `u()`, e il secondo dichiarava in
 * un commento «Stesso helper id di seed.ts» — falso: produceva `…-0000-0000-0000-…` contro
 * `…-0000-4000-8000-…`. Non era una divergenza estetica: `seed-report-demo` usa `u(2,n)`, `u(5,n)`
 * e `u(7,n)` per RIFERIRE fasce, ombrelloni e stagioni che crea `seed.ts`, quindi puntava a id che
 * non esistevano (P1-003/AUD-011).
 *
 * La forma resta RFC-4122-valida (nibble di versione 4, variante 8). Non serve piu' a superare
 * `@IsUUID()` — `common/is-uuid-shape.ts` ha sostituito quel decoratore — ma cambiarla ora
 * orfanerebbe le righe gia' seedate nei database di sviluppo, e il valore di questi id sta nel
 * fatto che sono STABILI.
 */
export function devId(prefix: number, n: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
