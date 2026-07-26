import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyLinks, extractLinks, githubSlug, maskCode, type Verdict } from './link-check';

/**
 * Lo spec dello STRUMENTO, non del repo. Il gate sui documenti e' in `doc-links.spec.ts`.
 *
 * Esiste perche' nella sessione che ha misurato i link rotti della Fase H **tre volte su quattro
 * il misuratore era piu' rotto dell'oggetto misurato**: due bug facevano contare meno del vero,
 * uno segnalava rotti due documenti corretti, e uno gonfiava il totale da 17 a 18. Un gate che
 * sbaglia e' peggio di nessun gate — il primo tipo di errore lascia passare il debito, il secondo
 * insegna a ignorare il rosso.
 *
 * Ogni caso qui ha una risposta che conosco *prima* di eseguirlo.
 */

describe('githubSlug — i casi in cui GitHub e’ controintuitivo', () => {
  it('minuscolo e spazi in trattini', () => {
    expect(githubSlug('Un Titolo')).toBe('un-titolo');
  });

  it('NON collassa gli spazi consecutivi', () => {
    // Era il bug che segnalava rotti due documenti corretti: con `\s+` questo darebbe `due-spazi`,
    // e il link `#due--spazi` — che su GitHub funziona — sarebbe stato "corretto" in uno rotto.
    expect(githubSlug('Due  spazi')).toBe('due--spazi');
  });

  it('scarta la punteggiatura ma tiene le accentate', () => {
    expect(githubSlug('5.0 Da dove ripartire, e perché')).toBe('50-da-dove-ripartire-e-perché');
  });

  it('rende testo l’inline-code e il grassetto invece di cancellarli', () => {
    expect(githubSlug('Con `codice` e **grassetto**')).toBe('con-codice-e-grassetto');
  });

  it('togliendo un’emoji non lascia la sua variation selector nello slug', () => {
    // U+26A0 e' categoria So e cade col resto dei simboli; U+FE0F e' Mn e sopravviverebbe,
    // producendo un anchor che contiene un carattere invisibile.
    expect(githubSlug('⚠️ Attento')).toBe('-attento');
  });

  it('tiene il § fuori e la cifra dentro', () => {
    expect(githubSlug('§4a. Regole di ingaggio')).toBe('4a-regole-di-ingaggio');
  });
});

describe('maskCode', () => {
  it('azzera le righe dentro un fence', () => {
    const lines = maskCode(['prima', '```ts', 'const x = 1', '```', 'dopo'].join('\n'));
    expect(lines).toEqual(['prima', '', '', '', 'dopo']);
  });

  it('chiude solo su un fence dello stesso carattere', () => {
    const lines = maskCode(['```', 'dentro ~~~', '```', 'fuori'].join('\n'));
    expect(lines[3]).toBe('fuori');
  });

  it('maschera l’inline-code preservando la lunghezza della riga', () => {
    // E' la proprieta' su cui si appoggia `extractLinks` per recuperare il testo vero di un link.
    const span = '`codice qui`';
    const source = `testo ${span} altro`;
    const [masked] = maskCode(source);
    expect(masked).toHaveLength(source.length);
    expect(masked).toBe(`testo ${' '.repeat(span.length)} altro`);
  });

  it('con maskInlineCode=false lascia l’inline-code degli heading', () => {
    expect(maskCode('## Con `codice`', false)).toEqual(['## Con `codice`']);
  });
});

describe('extractLinks', () => {
  it('recupera il testo vero di un link il cui testo e’ inline-code', () => {
    const links = extractLinks('x.md', '- [`useClienti.ts`](../a/b.ts) — nota');
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe('`useClienti.ts`');
    expect(links[0].target).toBe('../a/b.ts');
  });

  it('non estrae nulla da un fence né da un inline-code', () => {
    const content = ['```md', '[a](dentro-fence.md)', '```', '`[b](dentro-inline.md)`'].join('\n');
    expect(extractLinks('x.md', content)).toEqual([]);
  });

  it('non legge un grassetto spezzato su due righe come reference definition', () => {
    // `**DoD\n[ADR-0009]:** design docs...` — il bug che faceva 18 rotti invece di 17.
    const links = extractLinks('x.md', '[ADR-0009]:** design docs aggiornati nello stesso task.');
    expect(links).toEqual([]);
  });

  it('legge una reference definition vera', () => {
    const links = extractLinks('x.md', '[adr]: ./0001-x.md "Titolo"');
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe('definition');
    expect(links[0].target).toBe('./0001-x.md');
  });
});

describe('classifyLinks — fixture a risposta nota', () => {
  let root: string;
  /** riga di `CASI.md` → verdetto atteso */
  let verdictByLine: Map<number, Verdict>;

  const CASI = [
    '# Casi', // 1
    '', // 2
    '[a](./ok.md)', // 3  ok
    '[b](ok.md)', // 4  ok — link nudo senza `./`, il bug #1
    '[c](docs/nested.md)', // 5  ok
    '[d](missing.md)', // 6  broken-path
    '[e](OK.md)', // 7  broken-case — il file e' `ok.md`
    '[f](https://example.com/x)', // 8  external
    '[g](mailto:x@y.z)', // 9  external
    '[h](ok.md#un-titolo)', // 10 ok
    '[i](ok.md#non-esiste)', // 11 broken-anchor
    '[j](ok.md#due--spazi)', // 12 ok — il bug #2
    '[k](ok.md#due-spazi)', // 13 broken-anchor
    '[l](/root-assoluto.md)', // 14 absolute
    '[m](docs)', // 15 ok — una directory e' un target valido
    '[n](docs#titolo)', // 16 anchor-on-dir
    '![o](img.png)', // 17 ok
    '[p](ok.md#ripetuto)', // 18 ok
    '[q](ok.md#ripetuto-1)', // 19 ok — il secondo heading identico
    '[r](ok.md#ripetuto-2)', // 20 broken-anchor — di heading identici ce ne sono due
    '[s](#casi)', // 21 ok — anchor nello stesso file
    '[t](#non-c-e)', // 22 broken-anchor
    '[u](../fuori-dal-repo.md)', // 23 outside-repo
    '<a href="docs/nested.md">html</a>', // 24 ok
    '[v](ok.md "con title")', // 25 ok
    '[w]()', // 26 empty
    '[x](ok.md#con-codice-e-grassetto)', // 27 ok
    '[y](IGNORATO.md)', // 28 broken-path — esiste sul disco ma NON nel repo
  ];

  const EXPECTED: ReadonlyArray<readonly [number, Verdict]> = [
    [3, 'ok'],
    [4, 'ok'],
    [5, 'ok'],
    [6, 'broken-path'],
    [7, 'broken-case'],
    [8, 'external'],
    [9, 'external'],
    [10, 'ok'],
    [11, 'broken-anchor'],
    [12, 'ok'],
    [13, 'broken-anchor'],
    [14, 'absolute'],
    [15, 'ok'],
    [16, 'anchor-on-dir'],
    [17, 'ok'],
    [18, 'ok'],
    [19, 'ok'],
    [20, 'broken-anchor'],
    [21, 'ok'],
    [22, 'broken-anchor'],
    [23, 'outside-repo'],
    [24, 'ok'],
    [25, 'ok'],
    [26, 'empty'],
    [27, 'ok'],
    [28, 'broken-path'],
  ];

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'coralyn-docs-lint-'));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(
      path.join(root, 'ok.md'),
      [
        '# Titolo',
        '## Un titolo',
        '## Due  spazi',
        '## Ripetuto',
        '## Ripetuto',
        '## Con `codice` e **grassetto**',
      ].join('\n\n'),
      'utf8',
    );
    fs.writeFileSync(path.join(root, 'docs', 'nested.md'), '# Nested\n', 'utf8');
    fs.writeFileSync(path.join(root, 'img.png'), 'x', 'utf8');
    fs.writeFileSync(path.join(root, 'CASI.md'), CASI.join('\n'), 'utf8');
    // Esiste sul disco e NON e' nell'elenco del repo: e' il caso di `RUNBOOK.local.md`, che era
    // gitignorato, risolveva in locale e ha fatto rossa la CI. Vedi `RepoIndex`.
    fs.writeFileSync(path.join(root, 'IGNORATO.md'), '# Ignorato\n', 'utf8');

    const classified = classifyLinks(
      root,
      ['CASI.md', 'ok.md', 'docs/nested.md'],
      ['CASI.md', 'ok.md', 'docs/nested.md', 'img.png'],
    );
    verdictByLine = new Map(
      classified.filter((l) => l.file === 'CASI.md').map((l) => [l.line, l.verdict]),
    );
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('estrae un link per riga di caso, e nessuno dai due dentro il codice', () => {
    expect([...verdictByLine.keys()].sort((a, b) => a - b)).toEqual(EXPECTED.map(([line]) => line));
  });

  it.each(EXPECTED)('riga %i → %s', (line, expected) => {
    expect(verdictByLine.get(line)).toBe(expected);
  });

  it('un file che esiste sul disco ma non nel repo NON e’ verde', () => {
    // La regressione che la CI ha trovato e la fixture no: l'esistenza si giudica su cio' che il
    // repo contiene, non sul working tree, altrimenti un target gitignorato e' verde qui e 404 su
    // GitHub. Il controllo dell'altro verso e' la riga 3: il file c'e' davvero ed e' `ok`.
    expect(fs.existsSync(path.join(root, 'IGNORATO.md'))).toBe(true);
    expect(verdictByLine.get(28)).toBe('broken-path');
    expect(verdictByLine.get(3)).toBe('ok');
  });

  it('un file esistente con il case sbagliato NON e’ verde', () => {
    // Il caso che su Windows e macOS passerebbe in silenzio. Se questo test diventasse verde per
    // il motivo sbagliato — cioe' perche' `ok.md` non esiste piu' — la riga 3 sarebbe rossa.
    expect(verdictByLine.get(7)).toBe('broken-case');
    expect(verdictByLine.get(3)).toBe('ok');
  });
});
