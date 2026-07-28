import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineComponent } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { Permission, Role } from '@coralyn/contracts';
import { mountApp, permissionsOfRole } from '@/test/utils';
import { server } from '@/mocks/server';
import { useCustomers } from '@/features/customers/useCustomers';
import { useSeasons } from '@/features/pricing/useSeasons';
import { useRentalItems } from '@/features/rentals/useRentalItems';

/**
 * Ogni query dichiara il permesso del SUO endpoint (ADR-0064).
 *
 * Il difetto che questo file impedisce di ripetere: il gating della sidebar associa **una** voce a
 * **un** permesso, ma una vista compone dati di endpoint governati da permessi diversi — la Mappa
 * legge anche `/bookings`, `/customers` e `/packages`. Prima di D-063 lo staff aveva un insieme di
 * permessi fisso e la divergenza era irraggiungibile; con i permessi configurabili diventa attiva,
 * e degrada in SILENZIO: misurato, la Mappa rende identica con e senza quei tre endpoint a 403,
 * perché ogni chiamante fa `?? []`. Nessun test la vedeva.
 *
 * La barra è la stessa che l'API si dà in `authorization-coverage.spec.ts`: qui si verifica che
 * ogni query dichiari **un** permesso, non che dichiari **quello giusto** — la seconda cosa resta
 * alla review e alle e2e, esattamente come lato server. E il set di partenza è il **filesystem**,
 * quindi una query nuova entra nel test per il solo fatto di esistere.
 */

// La cwd di vitest è la root del pacchetto (`apps/web-staff`), sia col filtro pnpm sia dal
// `pnpm run test` ricorsivo. `import.meta.url` non è un URL `file:` sotto jsdom.
const SRC = path.resolve(process.cwd(), 'src');

/** ⚠️ Anche i `.vue`: una query scritta in un `<script setup>` è la via più facile perché ne
 *  nasca una senza gate, ed è proprio ciò che l'intestazione promette di non far succedere. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'mocks' ? [] : sourceFiles(full);
    if (!entry.isFile() || entry.name.endsWith('.spec.ts')) return [];
    return entry.name.endsWith('.ts') || entry.name.endsWith('.vue') ? [full] : [];
  });
}

/** Toglie commenti di riga e di blocco. ⚠️ Senza, `includes('hasPermission(')` matcherebbe una
 *  riga `enabled` COMMENTATA e il presidio resterebbe verde mentre il gate è sparito. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Estrae il blocco di opzioni `{ … }` che segue `marker`, a graffe bilanciate.
 *
 * ⚠️ **Le graffe dentro le stringhe non contano.** Senza questa distinzione una `{` sbilanciata in
 * un literal — `k('a{b')` — sbilancia il contatore e il blocco ingloba la query successiva:
 * misurato, 1 blocco invece di 2, quindi una query senza gate resterebbe invisibile e la suite
 * verde.
 *
 * ⚠️ I template literal sono trattati come **opachi** fino al backtick di chiusura, interpolazioni
 * comprese. Un primo tentativo li rientrava dentro sul `${` per contarne le graffe: sbagliato,
 * perché all'uscita dall'interpolazione non si tornava nella stringa e il resto del literal veniva
 * letto come codice — misurato, 24 blocchi invece di 29. Nessun `enabled:` vive dentro un
 * template literal, quindi l'approssimazione opaca non perde nulla di ciò che conta.
 */
export function optionBlocks(source: string, marker: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const hit = source.indexOf(marker, from);
    if (hit === -1) return out;
    let depth = 0;
    let quote: string | null = null; // ' " oppure ` quando siamo dentro una stringa
    let i = hit + marker.length - 1; // sul `{` del marker
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === '\\') i++; // escape: salta il prossimo carattere
        else if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(hit, i + 1));
    from = i + 1;
  }
}

interface Query {
  file: string;
  block: string;
}

const MARKER = ['queryResource({', 'useQuery({'];

const queries: Query[] = sourceFiles(SRC).flatMap((file) => {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  return MARKER.flatMap((m) => optionBlocks(source, m)).map((block) => ({
    file: path.relative(SRC, file).replace(/\\/g, '/'),
    block,
  }));
});

describe('ogni query dichiara il permesso del suo endpoint (ADR-0064)', () => {
  // ⚠️ Lo strumento prima dell'oggetto misurato: un estrattore rotto renderebbe questo file
  // verde per sempre, che è il modo in cui un presidio smette di presidiare senza dirlo.
  it('l’estrattore di blocchi funziona su un caso a risposta nota', () => {
    const finto = [
      "queryResource({ queryKey: () => k(`a/${b}`), queryFn: f, enabled: () => s.hasPermission(P.X) });",
      'queryResource({ queryKey: () => k(), queryFn: f });',
    ].join('\n');
    const blocchi = optionBlocks(finto, 'queryResource({');
    expect(blocchi).toHaveLength(2);
    // il primo è gatato, il secondo NO: se l'estrattore non distinguesse, non proverebbe nulla
    expect(blocchi[0]).toContain('hasPermission(');
    expect(blocchi[1]).not.toContain('hasPermission(');
    // e le graffe di un template literal non devono spezzare il blocco
    expect(blocchi[0]).toContain('enabled');
  });

  // ⚠️ Il buco trovato dalla verifica avversariale: una graffa SBILANCIATA dentro una stringa
  // sballava il contatore, e il blocco inglobava la query successiva — una query senza gate
  // sarebbe rimasta invisibile e la suite verde.
  it('una graffa dentro una stringa non sbilancia il contatore', () => {
    const finto = [
      "queryResource({ queryKey: () => k('a{b'), queryFn: f, enabled: () => s.hasPermission(P.X) });",
      'queryResource({ queryKey: () => k(), queryFn: f });',
    ].join('\n');
    const blocchi = optionBlocks(finto, 'queryResource({');
    expect(blocchi).toHaveLength(2); // con l'estrattore ingenuo qui ce n'era UNO
    expect(blocchi[1]).not.toContain('hasPermission(');
  });

  // ⚠️ Il caso che il presidio NON vedeva: una riga `enabled` commentata lasciava
  // `includes('hasPermission(')` verde. Trovato dalla review avversariale su questa sessione.
  it('una riga `enabled` COMMENTATA non conta come gate', () => {
    const finto = `queryResource({
      queryKey: () => k(),
      queryFn: f,
      // enabled: () => session.hasPermission(Permission.MapRead),
    });`;
    const blocchi = optionBlocks(stripComments(finto), 'queryResource({');
    expect(blocchi).toHaveLength(1);
    expect(blocchi[0]).not.toContain('hasPermission(');
    // controllo: la stessa riga NON commentata conta
    expect(optionBlocks(stripComments(finto.replace('// enabled', 'enabled')), 'queryResource({')[0]).toContain('hasPermission(');
  });

  it('lo scan copre anche i file .vue, non solo i .ts', () => {
    // Non c'e' oggi alcuna query dentro un SFC, quindi non basta contare: si prova che
    // l'elenco dei file SCANDITI include i .vue, altrimenti la promessa dell'intestazione
    // («una query nuova entra per il solo fatto di esistere») sarebbe falsa per gli SFC.
    const scanditi = sourceFiles(SRC).map((f) => path.basename(f));
    expect(scanditi.some((f) => f.endsWith('.vue'))).toBe(true);
    expect(scanditi.filter((f) => f.endsWith('.vue')).length).toBeGreaterThanOrEqual(50);
  });

  it('lo scan trova le query (il test deve poter fallire)', () => {
    // Ancora: se lo scan si rompe, questo numero crolla invece di lasciare la suite verde.
    expect(queries.length).toBeGreaterThanOrEqual(29);
  });

  it('nessuna query parte senza dichiarare un permesso', () => {
    const senzaGate = queries
      .filter((q) => !q.block.includes('hasPermission('))
      .map((q) => `${q.file}: ${q.block.slice(0, 90).replace(/\s+/g, ' ')}…`);
    expect(senzaGate).toEqual([]);
  });
});

/**
 * La metà comportamentale: che il gate SOPPRIMA davvero la richiesta, non che la stringa
 * `hasPermission` compaia nel file. Tre campioni, ciascuno col suo caso di controllo — un
 * operatore che il permesso ce l'ha DEVE far partire la richiesta, altrimenti il test è verde
 * perché non parte mai niente.
 */
describe('il gate sopprime la richiesta, non solo la stringa', () => {
  let chiamati: string[] = [];
  const spia = ({ request }: { request: Request }) => {
    chiamati.push(new URL(request.url).pathname);
  };

  beforeEach(() => {
    chiamati = [];
    server.events.on('request:start', spia);
  });
  afterEach(() => server.events.removeListener('request:start', spia));

  /** ⚠️ La sessione va passata al MOUNT, non dopo: montare da admin farebbe partire la query
   *  prima della restrizione, e il test misurerebbe la finestra invece del gate. */
  async function montaCon(permessi: Permission[], composable: () => unknown) {
    const Sonda = defineComponent({
      setup() {
        composable();
        return () => null;
      },
    });
    mountApp(Sonda, {}, {
      user: {
        id: 'u-1', email: 'bagnino@lido.it', role: Role.Staff,
        establishmentId: 'e-1', establishmentName: 'Lido', permissions: permessi,
      },
    });
    await flushPromises();
    await flushPromises();
  }

  const casi = [
    { nome: '/customers', permesso: Permission.CustomersManage, composable: useCustomers, path: '/api/customers' },
    { nome: '/seasons', permesso: Permission.PricingManage, composable: useSeasons, path: '/api/seasons' },
    { nome: '/rental-items', permesso: Permission.RentalCatalogManage, composable: useRentalItems, path: '/api/rental-items' },
  ];

  it.each(casi)('senza il permesso, $nome non viene chiamato', async ({ permesso, composable, path: atteso }) => {
    await montaCon(permissionsOfRole(Role.Staff).filter((p) => p !== permesso), composable);
    expect(chiamati).not.toContain(atteso);
  });

  it.each(casi)('CONTROLLO — col permesso, $nome viene chiamato', async ({ composable, path: atteso }) => {
    await montaCon(permissionsOfRole(Role.Staff), composable);
    expect(chiamati).toContain(atteso);
  });
});
