import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ALLOWED_BROKEN_LINKS } from './doc-links.allow';
import { BROKEN_VERDICTS, classifyLinks, formatLink, listMarkdownFiles, type ClassifiedLink } from './link-check';

/**
 * Il gate: nessun link relativo rotto nei `.md` versionati, tranne quelli dichiarati in
 * `doc-links.allow.ts` con la loro ragione.
 *
 * Perche' un test e non una rilettura (ADR-0059): la Fase H dell'audit ha corretto ~100 link rotti
 * in 22 documenti, e **nella stessa sessione ne sono stati introdotti due nuovi** — presi dallo
 * strumento, non da chi rileggeva. Un link rotto e' invisibile a occhio: il testo e' giusto, la
 * destinazione no.
 *
 * Vive in un package invece che in uno script alla radice per una ragione sola: cosi' e'
 * typecheckato, lintato e **presidiato da uno spec suo** (`link-check.spec.ts`). Il misuratore di
 * questa cosa e' stato sbagliato quattro volte su quattro tentativi; spedirlo senza casi a
 * risposta nota sarebbe istituzionalizzare l'errore invece di chiuderlo.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');

const files = listMarkdownFiles(ROOT);
const links = classifyLinks(ROOT, files);
const broken = links.filter((l) => BROKEN_VERDICTS.has(l.verdict));

const key = (l: { file: string; target: string }): string => `${l.file} → ${l.target}`;
const allowed = new Set(ALLOWED_BROKEN_LINKS.map(key));

describe('il presidio guarda dove crede di guardare', () => {
  // Senza questi tre, un `git ls-files` che ritorna vuoto, un'estrazione che non matcha piu' nulla
  // o un `resolveCaseSensitive` che risponde sempre `null` darebbero tutti un gate verde o un gate
  // rosso su tutto — e in entrambi i casi il numero non vorrebbe dire niente.
  it('vede i documenti versionati del repo', () => {
    expect(files.length).toBeGreaterThan(250);
    expect(files).toContain('README.md');
  });

  it('estrae i link, e la grande maggioranza risolve', () => {
    expect(links.length).toBeGreaterThan(2500);
    expect(links.filter((l) => l.verdict === 'ok').length / links.length).toBeGreaterThan(0.9);
  });

  it('riconosce ancora un link rotto quando c’e’', () => {
    // Controllo positivo su dati reali, non su una fixture: il placeholder del template ADR e' un
    // link rotto vero e dichiarato. Se il checker smettesse di vedere i rotti, questo diventa rosso
    // prima che il gate cominci a dare falsi verdi.
    expect(broken.map(key)).toContain(ALLOWED_BROKEN_LINKS[0] && key(ALLOWED_BROKEN_LINKS[0]));
  });
});

describe('link dei documenti', () => {
  it('nessun link relativo rotto oltre a quelli dichiarati', () => {
    const undeclared: ClassifiedLink[] = broken.filter((l) => !allowed.has(key(l)));

    expect(
      undeclared.map(formatLink),
      undeclared.length
        ? `\n${undeclared.length} link rotti non dichiarati. Riparali, oppure — se il target non ` +
          'esiste piu\' e il path e\' il testo visibile del link — togli il link e lascia il path ' +
          'in `code`: la frase resta identica e il 404 sparisce. Solo se nessuna delle due strade ' +
          'e\' praticabile, aggiungi una voce a `doc-links.allow.ts` CON la ragione.\n'
        : undefined,
    ).toEqual([]);
  });

  it('nessuna voce inutile nell’allow-list', () => {
    // La regola che impedisce all'allow-list di diventare `deferred.md`: una voce che non
    // corrisponde piu' a un link rotto va cancellata, non lasciata a fare volume.
    const brokenKeys = new Set(broken.map(key));
    const stale = ALLOWED_BROKEN_LINKS.filter((entry) => !brokenKeys.has(key(entry)));

    expect(
      stale.map((e) => `${key(e)} — dichiarato ma non piu' rotto`),
      stale.length ? '\nCancella queste voci da `doc-links.allow.ts`.\n' : undefined,
    ).toEqual([]);
  });

  it('ogni voce dichiarata ha una ragione, non solo un path', () => {
    for (const entry of ALLOWED_BROKEN_LINKS) {
      expect(entry.reason.length, `${key(entry)} senza ragione`).toBeGreaterThan(40);
    }
  });
});
