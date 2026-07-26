import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * La guida al deploy dice all'operatore cosa cercare nei log per sapere che l'API e' partita.
 * Fino al 2026-07-26 gli faceva cercare una stringa che **nessuno stampava**: `main.ts` era di 13
 * righe e in tutto `apps/api/src` non c'era un solo `console.log` (P8-011). Il Passo 7 e' il primo
 * avvio in produzione, cioe' il momento in cui chi legge ha meno modo di capire se il silenzio e'
 * normale o e' un guasto.
 *
 * Il fix e' stato **aggiungere il log**, non ammorbidire la guida. Questo spec e' cio' che tiene
 * insieme le due meta' — sono per forza in due file, quindi la coerenza va asserita: modificare il
 * messaggio in `main.ts` senza toccare la guida (o viceversa) fa rosso, e il rosso nomina entrambi.
 *
 * ADR-0059 §1: un'asserzione su un documento vive qui, non in una rilettura.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');

const GUIDE = 'docs/deploy/README.md';
const BOOTSTRAP = 'apps/api/src/main.ts';

/** Il testo che il Passo 7 fa cercare, fra virgolette, nell'istruzione `logs -f api`. */
const QUOTED_IN_GUIDE = /cerca\s+"([^"]+)"/;

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('il presidio guarda dove crede di guardare', () => {
  // Senza questo, un rename di uno dei due file renderebbe lo spec verde per assenza di materia.
  it('trova entrambi i file, e la guida contiene il Passo 7', () => {
    expect(read(GUIDE)).toContain('logs -f api');
    expect(read(BOOTSTRAP)).toContain('app.listen');
  });
});

describe('la guida al deploy e i log dell’API', () => {
  it('la stringa che il Passo 7 fa cercare e’ davvero stampata da main.ts', () => {
    const guide = read(GUIDE);
    const logLine = guide.split('\n').find((l) => l.includes('logs -f api'));
    const quoted = logLine?.match(QUOTED_IN_GUIDE)?.[1];

    expect(
      quoted,
      `\nIn ${GUIDE}, la riga con \`logs -f api\` deve dire fra virgolette cosa cercare.\n`,
    ).toBeTruthy();

    // La guida cita la porta di produzione (`:3000`); il sorgente la interpola da PORT. Si
    // confronta quindi la parte stabile del messaggio, non la riga intera: pretendere l'uguaglianza
    // esatta obbligherebbe a cablare 3000 nel codice, che e' il difetto opposto.
    const stable = quoted!.replace(/:\d+\s*$/, '').trim();
    expect(stable.length, '\nIl testo da cercare e’ solo una porta: non identifica nulla.\n').toBeGreaterThan(5);

    expect(
      read(BOOTSTRAP),
      `\n${BOOTSTRAP} non stampa «${stable}», che ${GUIDE} fa cercare nei log al Passo 7.\n` +
        'Le due meta\' vanno cambiate insieme: se cambi il messaggio, aggiorna la guida.\n',
    ).toContain(stable);
  });
});
