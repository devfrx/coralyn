import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verifica che ogni link relativo scritto nei `.md` del repo punti a qualcosa che esiste.
 *
 * Perche' esiste (ADR-0059): la Fase H dell'audit ha trovato ~100 link rotti in 22 documenti, e la
 * sessione che li ha corretti ne ha introdotti **due nuovi** — presi dallo strumento, non dalla
 * rilettura. Un documento con un link rotto e' indistinguibile da uno corretto a occhio, quindi
 * l'unica difesa che regge e' un gate.
 *
 * ATTENZIONE, e non e' un avvertimento generico: nella sessione che ha misurato quei ~100 link,
 * **tre volte su quattro lo strumento di misura era piu' rotto dell'oggetto misurato**. I bug
 * pagati, tutti presenti come casi in `link-check.spec.ts`:
 *
 *   1. contare solo i link che iniziano per `.`, saltando tutti i `docs/...` nudi (~32 rotti
 *      invisibili, piu' l'intero README di root);
 *   2. slugificare gli anchor con `\s+` invece di ` `: GitHub NON collassa gli spazi consecutivi,
 *      quindi `## Due  spazi` vale `#due--spazi`. Segnalava rotti due documenti corretti;
 *   3. fidarsi di `fs.existsSync` su Windows, che e' case-insensitive: un link con il case
 *      sbagliato passa in locale e da 404 su GitHub;
 *   4. leggere `**DoD [ADR-0009]:**` — grassetto spezzato su due righe — come una *link reference
 *      definition* con destinazione `**`. Da solo faceva 18 rotti invece di 17.
 *
 * Da cui la regola: ogni funzione qui e' pura o quasi, e ognuna ha casi a risposta nota nello spec.
 * Prima di credere a un numero prodotto da questo file, guarda se lo spec copre il caso.
 */

export type LinkKind = 'inline' | 'image' | 'html' | 'definition';

export type Verdict =
  /** il target esiste (file o directory), e l'eventuale anchor c'e' */
  | 'ok'
  /** http(s), mailto, tel, ftp, data: fuori perimetro, nessuna rete in un gate */
  | 'external'
  /** il file non esiste */
  | 'broken-path'
  /** il file esiste con un case diverso: verde su Windows/macOS, 404 su GitHub e in CI */
  | 'broken-case'
  /** il file esiste ma l'anchor no */
  | 'broken-anchor'
  /** `#frammento` su una directory: non esiste heading da raggiungere */
  | 'anchor-on-dir'
  /** path assoluto: su GitHub e' relativo al dominio, non alla radice del repo */
  | 'absolute'
  /** risolve fuori dalla radice del repo (es. un repo sorello) */
  | 'outside-repo'
  /** `[testo]()` */
  | 'empty'
  /** il target esiste ma non e' leggibile per gli anchor */
  | 'unreadable';

export interface Link {
  readonly file: string;
  readonly line: number;
  readonly kind: LinkKind;
  readonly target: string;
  readonly text: string;
}

export interface ClassifiedLink extends Link {
  readonly verdict: Verdict;
  readonly detail?: string;
}

/** I verdetti che fanno rosso il gate. `external` e `ok` non ci sono, e non e' una dimenticanza. */
export const BROKEN_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>([
  'broken-path',
  'broken-case',
  'broken-anchor',
  'anchor-on-dir',
  'absolute',
  'outside-repo',
  'empty',
  'unreadable',
]);

// --------------------------------------------------------------------------- codice vs prosa

/**
 * Neutralizza il codice, riga per riga. Un `[link](x)` dentro un blocco di codice e' un esempio,
 * non un link.
 *
 * Due proprieta' su cui si appoggia il resto del file:
 *  - le righe dentro un fence diventano stringa vuota (non producono match);
 *  - il mascheramento dell'inline-code **preserva la lunghezza della riga**, quindi gli offset dei
 *    match valgono anche sulla riga originale. E' cosi' che `extractLinks` recupera il testo vero
 *    di un link il cui testo e' a sua volta inline-code.
 *
 * `maskInlineCode: false` maschera i soli fence: serve per gli heading, dove
 * `## Con \`codice\`` deve conservare il testo o lo slug nasce sbagliato.
 */
export function maskCode(text: string, maskInlineCode = true): string[] {
  const out: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (const line of text.split('\n')) {
    if (fenceChar === null) {
      const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (open) {
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        out.push('');
        continue;
      }
      out.push(maskInlineCode ? maskInline(line) : line);
    } else {
      const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) fenceChar = null;
      out.push('');
    }
  }
  return out;
}

/** Sostituisce ogni span `\`...\`` con altrettanti spazi. La lunghezza della riga non cambia. */
function maskInline(line: string): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i];
      i++;
      continue;
    }
    let ticks = 0;
    while (line[i + ticks] === '`') ticks++;
    const end = line.indexOf('`'.repeat(ticks), i + ticks);
    if (end === -1) {
      // backtick spaiato: non e' uno span, e' un carattere
      out += line.slice(i);
      break;
    }
    out += ' '.repeat(end + ticks - i);
    i = end + ticks;
  }
  return out;
}

// --------------------------------------------------------------------------- estrazione

/** `[testo](target "title")`, `![alt](target)`, `[testo](<target>)` */
const INLINE =
  /(!?)\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*(<[^>]*>|[^\s)]*(?:\([^\s)]*\))?[^\s)]*)\s*(?:"[^"]*"|'[^']*')?\s*\)/g;

/**
 * `[ref]: target ["title"]` — e la riga deve contenere SOLO la definizione.
 * `**DoD [ADR-0009]:** design docs aggiornati...` e' un paragrafo in grassetto spezzato su due
 * righe, non una definizione con destinazione `**`. Era il bug #4.
 */
const DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)\s*(?:"[^"]*"|'[^']*'|\([^()]*\))?\s*$/;

/** `<a href="...">`, `<img src="...">` — il markdown del repo li usa in qualche tabella */
const HTML_ATTR = /<(?:a|img)\s[^>]*?(?:href|src)\s*=\s*["']([^"']+)["']/gi;

function unbracket(target: string): string {
  return target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target;
}

export function extractLinks(file: string, content: string): Link[] {
  const rawLines = content.split('\n');
  const masked = maskCode(content);
  const links: Link[] = [];

  masked.forEach((maskedLine, i) => {
    const rawLine = rawLines[i] ?? '';
    const lineNo = i + 1;

    const def = DEFINITION.exec(maskedLine);
    if (def) {
      links.push({
        file,
        line: lineNo,
        kind: 'definition',
        target: unbracket(def[2]),
        text: def[1],
      });
      return;
    }

    for (const m of maskedLine.matchAll(INLINE)) {
      // Il testo va riletto dalla riga ORIGINALE: se e' inline-code (`[\`useClienti.ts\`](...)`)
      // sulla riga mascherata e' una fila di spazi. Gli offset combaciano perche' il
      // mascheramento preserva la lunghezza.
      const sourceSlice = rawLine.slice(m.index, m.index + m[0].length);
      const fromSource = new RegExp(INLINE.source).exec(sourceSlice);
      links.push({
        file,
        line: lineNo,
        kind: m[1] === '!' ? 'image' : 'inline',
        target: unbracket(m[3]),
        text: (fromSource?.[2] ?? m[2]).trim(),
      });
    }

    for (const m of maskedLine.matchAll(HTML_ATTR)) {
      links.push({ file, line: lineNo, kind: 'html', target: m[1], text: '' });
    }
  });

  return links;
}

// ------------------------------------------------------------------ esistenza case-sensitive

/**
 * Risolve un path **confrontando i nomi segmento per segmento** invece di chiedere al filesystem.
 * `fs.existsSync('OK.md')` risponde `true` su Windows e su macOS quando il file e' `ok.md`: il
 * link passerebbe in locale e darebbe 404 su GitHub e in CI (bug #3).
 */
export type Resolution = { readonly kind: 'file' | 'dir' } | { readonly kind: 'case'; readonly actual: string } | null;

export function resolveCaseSensitive(root: string, relative: string, dirCache = new Map<string, fs.Dirent[] | null>()): Resolution {
  const readDir = (abs: string): fs.Dirent[] | null => {
    if (!dirCache.has(abs)) {
      try {
        dirCache.set(abs, fs.readdirSync(abs, { withFileTypes: true }));
      } catch {
        dirCache.set(abs, null);
      }
    }
    return dirCache.get(abs) ?? null;
  };

  const segments = relative.split('/').filter((s) => s.length > 0 && s !== '.');
  let current = root;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '..') {
      current = path.dirname(current);
      continue;
    }
    const entries = readDir(current);
    if (!entries) return null;

    const exact = entries.find((e) => e.name === segment);
    if (!exact) {
      const insensitive = entries.find((e) => e.name.toLowerCase() === segment.toLowerCase());
      if (insensitive) {
        return { kind: 'case', actual: [...segments.slice(0, i), insensitive.name].join('/') };
      }
      return null;
    }
    current = path.join(current, segment);
    if (i === segments.length - 1) return { kind: exact.isDirectory() ? 'dir' : 'file' };
  }
  return { kind: 'dir' };
}

// --------------------------------------------------------------------------- anchor e slug

/**
 * Riproduce `github-slugger`: minuscolo, via la punteggiatura e i simboli, poi **ogni singolo
 * spazio** diventa `-`. Niente `trim`, niente collasso degli spazi (bug #2).
 */
export function githubSlug(headingText: string): string {
  let s = headingText;

  // Il testo di un heading e' markdown: va reso testo prima di slugificare.
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/(\*\*\*|___)(.*?)\1/g, '$2');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  s = s.replace(/~~(.*?)~~/g, '$1');
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');

  s = s.toLowerCase();

  // U+FE0F, la variation selector che segue le emoji, e' di categoria Mn: sopravviverebbe al
  // filtro sotto e lascerebbe nello slug un carattere invisibile, cioe' farebbe segnalare rotto
  // un anchor corretto — il tipo di falso positivo che insegna a ignorare il rosso. Misurato:
  // compare in 18 heading di questo repo (`## ⚠️ ...`, `## ✅️ ...`), che valgono `#-...`.
  // Gli altri invisibili della famiglia (U+FE0E, ZWJ, modificatori di tono) non compaiono in un
  // solo heading su 315 documenti: sono fuori di proposito, ed e' la ragione per cui qui c'e' un
  // codepoint e non una classe.
  s = s.replace(/\uFE0F/g, '');
  // Tiene lettere (anche accentate), cifre, combining marks, spazio, `-` e `_`.
  s = s.replace(/[^\p{L}\p{N}\p{M} _-]/gu, '');

  return s.replace(/ /g, '-');
}

const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HTML_ANCHOR = /<a\s[^>]*?(?:name|id)\s*=\s*["']([^"']+)["']/gi;

/** Gli anchor raggiungibili in un documento: heading ATX (con il suffisso `-1`, `-2` sui duplicati) e anchor HTML espliciti. */
export function anchorsOf(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  const rawLines = markdown.split('\n');

  // Heading dai soli fence mascherati: l'inline-code dentro un heading e' testo, non codice.
  maskCode(markdown, false).forEach((line, i) => {
    const heading = ATX.exec(line);
    if (heading) {
      const base = githubSlug(heading[2]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const m of (rawLines[i] ?? '').matchAll(HTML_ANCHOR)) anchors.add(m[1]);
  });

  return anchors;
}

// --------------------------------------------------------------------------- classificazione

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Classifica i link di `files` (path relativi alla radice) rispetto al filesystem sotto `root`.
 * Nessuna chiamata di rete: i link esterni sono `external` per costruzione.
 */
export function classifyLinks(root: string, files: readonly string[]): ClassifiedLink[] {
  const dirCache = new Map<string, fs.Dirent[] | null>();
  const anchorCache = new Map<string, Set<string> | null>();

  const anchorsFor = (relative: string): Set<string> | null => {
    if (!anchorCache.has(relative)) {
      try {
        anchorCache.set(relative, anchorsOf(fs.readFileSync(path.join(root, relative), 'utf8')));
      } catch {
        anchorCache.set(relative, null);
      }
    }
    return anchorCache.get(relative) ?? null;
  };

  const hasAnchor = (anchors: Set<string>, anchor: string): boolean =>
    anchors.has(anchor) || anchors.has(decode(anchor)) || anchors.has(decode(anchor).toLowerCase());

  const out: ClassifiedLink[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');

    for (const link of extractLinks(file, content)) {
      out.push(classify(link));
    }
  }

  return out;

  function classify(link: Link): ClassifiedLink {
    const { target } = link;
    if (target === '') return { ...link, verdict: 'empty' };
    if (/^(https?|ftp|data|mailto|tel):/i.test(target)) return { ...link, verdict: 'external' };

    const hash = target.indexOf('#');
    const rawPath = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? '' : target.slice(hash + 1);

    // `#frammento` senza path: anchor nello stesso documento.
    if (rawPath === '') {
      const anchors = anchorsFor(link.file);
      if (!anchors) return { ...link, verdict: 'unreadable', detail: link.file };
      return hasAnchor(anchors, anchor)
        ? { ...link, verdict: 'ok' }
        : { ...link, verdict: 'broken-anchor', detail: `#${anchor} non esiste in ${link.file}` };
    }

    if (rawPath.startsWith('/')) return { ...link, verdict: 'absolute', detail: rawPath };

    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(link.file), decode(rawPath)));
    if (resolved === '..' || resolved.startsWith('../')) {
      return { ...link, verdict: 'outside-repo', detail: resolved };
    }

    const existence = resolveCaseSensitive(root, resolved, dirCache);
    if (existence === null) return { ...link, verdict: 'broken-path', detail: resolved };
    if (existence.kind === 'case') {
      return { ...link, verdict: 'broken-case', detail: `${resolved} → ${existence.actual}` };
    }
    if (existence.kind === 'dir') {
      return anchor
        ? { ...link, verdict: 'anchor-on-dir', detail: resolved }
        : { ...link, verdict: 'ok', detail: resolved };
    }

    if (!anchor) return { ...link, verdict: 'ok', detail: resolved };
    // Un `#L42` su un sorgente e' una convenzione di GitHub, non un heading: fuori perimetro.
    if (!resolved.endsWith('.md')) return { ...link, verdict: 'ok', detail: resolved };

    const anchors = anchorsFor(resolved);
    if (!anchors) return { ...link, verdict: 'unreadable', detail: resolved };
    return hasAnchor(anchors, anchor)
      ? { ...link, verdict: 'ok', detail: `${resolved}#${anchor}` }
      : {
          ...link,
          verdict: 'broken-anchor',
          detail: `${resolved}#${anchor} — anchor presenti: ${[...anchors].slice(0, 8).join(', ')}…`,
        };
  }
}

// --------------------------------------------------------------------------- elenco dei file

/**
 * I `.md` che fanno parte del repo, da `git ls-files`.
 *
 * Non una `readdir` ricorsiva: `RUNBOOK.local.md` e tutto `.superpowers/` sono gitignorati, e
 * scandirli farebbe fallire il gate su file che non stanno nel repo — rosso su una macchina e
 * verde su un'altra. Se `git` manca, e' meglio un errore esplicito di un elenco silenziosamente
 * diverso.
 *
 * `--others --exclude-standard` insieme a `--cached` NON e' un dettaglio: senza, un documento
 * appena scritto e non ancora `git add`-ato e' invisibile al gate, che diventerebbe verde proprio
 * sul file che sta per introdurre il link rotto. In CI la differenza e' nulla (tutto e'
 * committato); in locale e' la differenza fra prendere l'errore prima o dopo il push. Verificato
 * scrivendo questo package: il primo run "verde" non aveva letto l'ADR-0059 ancora untracked.
 */
export function listMarkdownFiles(root: string): string[] {
  const out = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function formatLink(link: ClassifiedLink): string {
  return `${link.file}:${link.line} → ${link.target}   [${link.verdict}]${link.detail ? ` ${link.detail}` : ''}`;
}
