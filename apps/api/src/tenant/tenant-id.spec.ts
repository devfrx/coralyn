import fs from 'node:fs';
import path from 'node:path';

/**
 * `tenant-id.ts` afferma che il tenant di una richiesta nasce in due punti soli — `TenantContext`
 * per il canale staff, `CustomerJwtGuard` per quello cliente — e che ogni altro uso di
 * `tenantIdOf` è una deroga deliberata.
 *
 * Davanti a un'affermazione così la domanda non è «è ancora vera?» ma **«cosa la renderebbe rossa
 * se smettesse di esserlo?»**. Questa è la risposta: un quinto punto di produzione che costruisce
 * un `TenantId` fuori dai due canali fa fallire questo test e **ne stampa il file**. Né il
 * typecheck né il lint se ne accorgerebbero — `tenantIdOf` è una funzione legittima ovunque.
 *
 * Il modello è `packages/data-layer/src/single-source.spec.ts`.
 */
const SRC = path.resolve(__dirname, '..');

/** Punti di produzione autorizzati, con il perché accanto: la lista è la specifica. */
const AUTORIZZATI: Record<string, string> = {
  'tenant/tenant-context.ts': 'produttore: il tenant staff, dal claim del JWT verificato',
  'customer-auth/customer-jwt.guard.ts': 'produttore: il tenant cliente, dal claim del JWT verificato',
  'establishment/legal-profile.service.ts': 'deroga: informativa del titolare, pubblica per obbligo (art. 13/14)',
  'platform/platform-metrics.service.ts': 'deroga: il superuser di piattaforma itera sui lidi del registro',
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'test') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

function usaTenantIdOf(): string[] {
  return sourceFiles(SRC)
    .filter((f) => path.basename(f) !== 'tenant-id.ts')
    .filter((f) => /\btenantIdOf\s*\(/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .sort();
}

describe('TenantId nasce solo dove qualcuno dichiara da dove viene', () => {
  it('il presidio guarda dove crede di guardare', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join('tenant', 'tenant-context.ts')))).toBe(true);
  });

  it('nessun punto di produzione costruisce un TenantId fuori dai quattro dichiarati', () => {
    expect(usaTenantIdOf()).toEqual(Object.keys(AUTORIZZATI).sort());
  });
});
