import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { listRepoFiles } from './link-check';

/**
 * Ogni runner di test del repo dichiara un tetto ai propri worker (ADR-0061, D-066).
 *
 * Perche' un test e non una convenzione: il difetto non si manifesta come un rosso, ma come un
 * VERDE PIU' PICCOLO. Sotto pressione di memoria le suite che non riescono a partire non falliscono,
 * spariscono — `Tests: 230 passed, 0 failed` con 26 suite mai avviate. Un pacchetto nuovo senza
 * tetto riaprirebbe esattamente quel modo di fallire, e nessuno se ne accorgerebbe leggendo un
 * verde.
 *
 * Il tetto e' ripetuto in 8 file invece di vivere in un modulo condiviso: importare fra pacchetti
 * dentro un file di configurazione creerebbe un arco che non esiste nel workspace, e un modulo alla
 * radice non sarebbe typecheckato (la ragione di ADR-0059 §2). La ripetizione e' resa sicura da
 * qui: e' lo stesso patto di `tenant-id.spec.ts`, che ammette quattro punti di costruzione e
 * fallisce nominando il file se ne compare un quinto.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');

/** «Meta' dei core, ma non piu' di 4»: il tetto assoluto e' la parte che conta, perche' una
 *  percentuale cresce proprio dove il problema e' la macchina grande. */
const CAP_EXPRESSION = 'Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)))';

const repoFiles = listRepoFiles(ROOT);
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * L'insieme da controllare si deriva dai pacchetti che **hanno uno script `test`**, non dai nomi di
 * file presenti nel repo.
 *
 * La differenza non e' teorica: un pacchetto nuovo con `"test": "vitest run"` e **senza**
 * `vitest.config.ts` non produrrebbe alcun file da controllare, e un presidio basato sui nomi
 * sarebbe verde per assenza di materia — proprio sul caso che deve prendere. In dodici giorni sono
 * nati quattro pacchetti; la forma «pacchetto senza config» e' a un passo.
 */
const pacchettiConTest = repoFiles
  .filter((f) => /(^|\/)package\.json$/.test(f) && f !== 'package.json')
  .map((f) => ({ dir: path.posix.dirname(f), pkg: JSON.parse(read(f)) as { scripts?: Record<string, string> } }))
  .filter((p) => typeof p.pkg.scripts?.test === 'string' && p.pkg.scripts.test.length > 0)
  .map((p) => p.dir);

const configOf = (dir: string): string | null =>
  [`${dir}/vitest.config.ts`, `${dir}/jest.config.ts`].find((c) => repoFiles.includes(c)) ?? null;

const configs = pacchettiConTest.map(configOf).filter((c): c is string => c !== null);

describe('il presidio guarda dove crede di guardare', () => {
  it('parte dai pacchetti che hanno uno script `test`, e li trova tutti', () => {
    // Senza questa riga, un `listRepoFiles` che tornasse vuoto darebbe un gate verde su zero file.
    expect(pacchettiConTest.length).toBeGreaterThanOrEqual(8);
    expect(pacchettiConTest).toContain('apps/api');
    expect(pacchettiConTest).toContain('packages/ui-kit');
  });

  it('ogni pacchetto che lancia dei test ha una configurazione di runner', () => {
    // E' il buco che il controllo per nome-file non poteva vedere: senza config non c'e' posto dove
    // il tetto possa vivere, e il test successivo non avrebbe nulla da esaminare.
    const senzaConfig = pacchettiConTest.filter((d) => configOf(d) === null);

    expect(
      senzaConfig,
      senzaConfig.length
        ? '\nQuesti pacchetti lanciano test senza una `vitest.config.ts`/`jest.config.ts`: ' +
          'non c’è dove dichiarare il tetto ai worker (D-066).\n'
        : undefined,
    ).toEqual([]);
  });
});

describe('tetto ai worker dei runner di test', () => {
  it('ogni configurazione dichiara il tetto, con la stessa espressione', () => {
    const senzaTetto = configs.filter((f) => !read(f).includes(CAP_EXPRESSION));

    expect(
      senzaTetto,
      senzaTetto.length
        ? `\n${senzaTetto.length} runner senza tetto ai worker. Aggiungi:\n` +
          `  const MAX_WORKERS = ${CAP_EXPRESSION};\n` +
          "e passalo a `maxWorkers`. Senza, sotto pressione di memoria le suite non falliscono: " +
          'spariscono dal totale (D-066).\n'
        : undefined,
    ).toEqual([]);
  });

  it('il valore dichiarato viene davvero usato come maxWorkers', () => {
    // Dichiarare la costante e non passarla e' il modo silenzioso di disattivare il tetto
    // continuando a superare il test qui sopra.
    // ⚠️ L'ancoraggio a fine riga NON e' cosmetico: senza, `maxWorkers: MAX_WORKERS_LOCAL` — dove
    // MAX_WORKERS_LOCAL vale 24 fuori dalla CI — passava verde. E' il bypass che una review
    // indipendente ha trovato, ed e' proprio la deriva che questo ADR annuncia come prossima
    // («se il tetto dovesse diventare configurabile per pacchetto»): invisibile in CI, perche' li'
    // `process.env.CI` e' impostato. `\r?` perche' un file CRLF non deve fare rosso per l'EOL.
    const inerti = configs.filter((f) => !/maxWorkers:\s*MAX_WORKERS\s*,?\s*\r?$/m.test(read(f)));

    expect(
      inerti,
      inerti.length ? '\nMAX_WORKERS dichiarato ma non passato a `maxWorkers`.\n' : undefined,
    ).toEqual([]);
  });

  it('il tetto e’ un numero assoluto, non una percentuale', () => {
    // `50%` era il valore precedente di jest ed era gia' insufficiente: su 32 core sono 16 worker,
    // e D-066 si riproduceva su quel pacchetto da solo. Se ricompare, il tetto non c'e' piu'.
    const percentuali = configs.filter((f) => /maxWorkers:\s*'\d+(\.\d+)?%'/.test(read(f)));

    expect(
      percentuali,
      percentuali.length
        ? '\nUna percentuale cresce con la macchina, cioe’ proprio dove il problema e’ la macchina.\n'
        : undefined,
    ).toEqual([]);
  });
});
