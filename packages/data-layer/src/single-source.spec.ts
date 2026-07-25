import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR-0058 §1 afferma che `ApiError` è UNA classe per tutto il monorepo, e che è quella proprietà —
 * non un'astrazione più elegante — a rendere condivisibile `handleUnauthorized`: un
 * `error instanceof ApiError` attraversa il confine app↔package solo se la classe è la stessa.
 *
 * La domanda giusta davanti a un'affermazione del genere non è «è ancora vera?» ma **«cosa la
 * renderebbe rossa se smettesse di esserlo?»** (lezione di Fase F: tre ADR dichiaravano vero ciò
 * che il codice non faceva, e nessun test lo rendeva rosso). Questa è la risposta: ridichiarare
 * `class ApiError` in un'app la fa diventare rossa. Il typecheck non se ne accorgerebbe — le due
 * classi sono strutturalmente identiche — e nemmeno il lint.
 *
 * Vive qui, nel package che possiede la classe, perché è quel package a fare l'affermazione.
 */
const APPS_DIR = path.resolve(import.meta.dirname, '../../../apps');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('ApiError è dichiarata in un posto solo (ADR-0058 §1)', () => {
  it('il presidio guarda dove crede di guardare', () => {
    expect(fs.existsSync(APPS_DIR)).toBe(true);
    expect(sourceFiles(APPS_DIR).length).toBeGreaterThan(100);
  });

  it('nessuna app ridichiara `class ApiError`', () => {
    const colpevoli = sourceFiles(APPS_DIR)
      .filter((f) => /class\s+ApiError\b/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(APPS_DIR, f).split(path.sep).join('/'));

    expect(colpevoli).toEqual([]);
  });
});
