/**
 * Parser di `docs/architecture/deferred.md`.
 *
 * Il registro dice cosa resta da fare, ed era arrivato ad avere **6 voci chiuse fra le aperte, 4
 * aperte fra le chiuse e 2 duplicate** senza che nulla lo segnalasse — mentre `D-064` e `D-066`,
 * cioe' le due decisioni in attesa dell'utente, stavano sotto l'intestazione «Risolte».
 *
 * La causa era meccanica: la sezione delle risolte cominciava a un terzo del file, quindi ogni voce
 * nuova appesa in fondo ci finiva dentro.
 */

export type Status = 'aperta' | 'chiusa';

export interface RegistryEntry {
  readonly id: string;
  readonly status: Status;
  readonly line: number;
  /** l'anchor `<a id="d-0nn">` dichiarato sulla riga della voce, se c'e' */
  readonly anchor: string | null;
  readonly body: string;
}

export interface IndexRow {
  readonly id: string;
  readonly tema: string;
  readonly status: Status;
  readonly line: number;
  /** il target del link nella prima cella, es. `#d-064` */
  readonly href: string;
}

export interface Registry {
  readonly index: readonly IndexRow[];
  readonly entries: readonly RegistryEntry[];
}

const SECTION = /^##\s+(Indice|Aperte|Chiuse)\s*$/;
const INDEX_ROW = /^\|\s*\[(D-\d+)\]\(([^)]+)\)\s*\|([^|]*)\|\s*(?:🔓|✅)?\s*(aperta|chiusa)\s*\|/u;
const ANCHOR = /<a\s+id="([^"]+)"\s*>\s*<\/a>/;
/** riga di tabella: `| <a id="d-002"></a>D-002 | …` — oppure senza anchor */
const TABLE_ENTRY = /^\|\s*(?:<a\s+id="[^"]*"\s*>\s*<\/a>)?\s*\*{0,2}~{0,2}\s*(D-\d+)/;
/** voce estesa: `- <a id="d-059"></a>**D-059** — …` */
const LIST_ENTRY = /^\s*-\s+(?:<a\s+id="[^"]*"\s*>\s*<\/a>)?\s*\*{0,2}~{0,2}\s*(D-\d+)/;

export function parseRegistry(markdown: string): Registry {
  const lines = markdown.split('\n');
  const index: IndexRow[] = [];
  const raw: { id: string; status: Status; line: number; anchor: string | null; start: number }[] = [];

  let section: 'Indice' | 'Aperte' | 'Chiuse' | null = null;

  lines.forEach((line, i) => {
    const s = SECTION.exec(line);
    if (s) {
      section = s[1] as 'Indice' | 'Aperte' | 'Chiuse';
      return;
    }
    if (section === 'Indice') {
      const m = INDEX_ROW.exec(line);
      if (m) index.push({ id: m[1], href: m[2], tema: m[3].trim(), status: m[4] as Status, line: i + 1 });
      return;
    }
    if (section !== 'Aperte' && section !== 'Chiuse') return;

    const m = TABLE_ENTRY.exec(line) ?? LIST_ENTRY.exec(line);
    if (!m) return;
    raw.push({
      id: m[1],
      status: section === 'Aperte' ? 'aperta' : 'chiusa',
      line: i + 1,
      anchor: ANCHOR.exec(line)?.[1] ?? null,
      start: i,
    });
  });

  const entries: RegistryEntry[] = raw.map((e, k) => ({
    id: e.id,
    status: e.status,
    line: e.line,
    anchor: e.anchor,
    body: lines.slice(e.start, k + 1 < raw.length ? raw[k + 1].start : lines.length).join('\n'),
  }));

  return { index, entries };
}

/**
 * I modi in cui una voce di questo registro dichiara di essere chiusa. Tutti misurati sul file:
 * nessuno e' stato immaginato.
 *
 * ⚠️ Si usa in UNA direzione sola — «una voce sotto Chiuse deve dirlo» — e mai nell'altra. `D-061`
 * contiene «D-061 CHIUSA sul piano tecnico» ed e' **aperta**, perche' due righe dopo dice che
 * restano i dati societari e la validazione legale. Un test che pretendesse «nessun marcatore fra
 * le aperte» sarebbe rosso su una voce corretta, e un rosso che ha torto insegna a ignorare i rossi.
 */
export const CLOSURE_MARKERS = /CHIUSA|CHIUSO|CHIUSE|RISOLTA|RISOLTE|IMPLEMENTAT|\bFATTO\b|\bimplementat[ao]\b|\brisolt[ae]\b/;
