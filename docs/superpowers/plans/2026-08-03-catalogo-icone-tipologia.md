# Catalogo icone della tipologia ombrellone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendere l'icona di una tipologia ombrellone sceglibile fra tutte le 1743 icone Lucide non deprecate, ricercabili, al posto delle tre di oggi.

**Architecture:** il catalogo diventa un sottosistema del ui-kit dietro un entry point separato del package (`@coralyn/ui-kit/icons/lucide`), importato staticamente dalla sola `web-staff`. `Icon.vue` passa da un fallback muto a una catena dichiarata registry → catalogo → alias → fallback visibile. L'API valida contro l'elenco Lucide vero con un decoratore custom. Nessuna migration: `UmbrellaType.icon` è già `String?`.

**Tech Stack:** Vue 3.5 · reka-ui 2 · `@iconify-json/lucide` 1.2.114 (ISC) · NestJS + class-validator · vitest (ui-kit, web-staff) · jest (api).

**Spec:** [2026-08-03-icone-tipologia-catalogo-lucide-design.md](../specs/2026-08-03-icone-tipologia-catalogo-lucide-design.md)

## Global Constraints

- **Nessuna migration**, né di schema né di dati. `UmbrellaType.icon` resta `String?`.
- **`@iconify-json/lucide` va allo stesso range `^1.2.114`** ovunque: è già in `packages/ui-kit`, `apps/web-staff`, `apps/web-platform`, `apps/web-customer`; il piano lo aggiunge ad `apps/api`. Se due range divergono il picker offre nomi che l'API rifiuta con 400.
- **Import tipizzato, mai il JSON grezzo**: `import { icons } from '@iconify-json/lucide'` (tipo `IconifyJSON`). `resolveJsonModule` **non** è attivo in questo repo e non va attivato.
- **Le icone `hidden` (60) sono escluse** dal catalogo. Questo rende corretto il `viewBox` costante: l'unica icona con dimensioni proprie, `search-large` (32×32), è hidden.
- **Le suite girano una alla volta.** Dopo ogni correzione si rigira la suite **intera del pacchetto**, non il solo file: la prima correzione di un difetto può scambiarlo con un altro.
- **Commit**: `tipo(scope): frase in italiano minuscolo`, ultima riga `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Messaggi lunghi con `git commit -F <file>`, mai inline.
- **Non citare righe per numero** nei commenti: cita il selettore o il simbolo.

## File Structure

| File | Responsabilità |
|---|---|
| `packages/ui-kit/src/icons/catalog.ts` | **crea** — tipo `IconCatalog` e funzioni **pure** di risoluzione e ricerca. Non importa Lucide: riceve i dati |
| `packages/ui-kit/src/icons/lucide-catalog.ts` | **crea** — l'unico file che importa `@iconify-json/lucide`; esclude le `hidden`. Dietro entry point separato |
| `packages/ui-kit/src/icons/registered-catalog.ts` | **crea** — stato di registrazione, reattivo. Parte vuoto |
| `packages/ui-kit/src/icons/suggested.ts` | **crea** — l'elenco delle icone suggerite, in **un solo posto** |
| `packages/ui-kit/src/components/IconPicker.vue` | **crea** — compone `SearchInput` + `Popover` esistenti |
| `packages/ui-kit/src/icons/registry.ts` | **modifica** — rinomina due chiavi in conflitto, **rimuove** `FALLBACK_ICON` |
| `packages/ui-kit/src/components/Icon.vue` | **modifica** — catena di risoluzione a quattro livelli |
| `packages/ui-kit/src/index.ts` · `package.json` | **modifica** — export di `IconPicker` e registrazione; entry point `./icons/lucide` |
| `apps/api/src/common/is-icon-key.ts` | **crea** — decoratore sul modello di `is-uuid-shape.ts` |
| `apps/api/src/establishment/dto/*-umbrella-type.dto.ts` | **modifica** — via `ICON_KEYS` e `@IsIn` |
| `apps/web-staff/src/main.ts` · `src/test/setup.ts` | **modifica** — registrano il catalogo. **Entrambi**: vitest non esegue `main.ts` |
| `apps/web-staff/.../panels/BeachPanel.vue` | **modifica** — `IconPicker` al posto della `Select` |
| `apps/web-staff/src/features/map/MapView.vue` | **modifica** — legenda derivata dai dati |

---

### Task 1: Il catalogo — tipo e funzioni pure

Nessuna dipendenza da Lucide: qui si definisce solo *come* si interroga un catalogo. Testabile senza caricare 500 KB di JSON.

**Files:**
- Create: `packages/ui-kit/src/icons/catalog.ts`
- Test: `packages/ui-kit/src/icons/catalog.spec.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `interface IconCatalog { icons: Readonly<Record<string,string>>; aliases: Readonly<Record<string,string>> }`; `resolveFromCatalog(c: IconCatalog, name: string): string | null`; `searchCatalog(c: IconCatalog, query: string, limit: number): { names: string[]; total: number }`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// packages/ui-kit/src/icons/catalog.spec.ts
import { describe, it, expect } from 'vitest';
import { resolveFromCatalog, searchCatalog, type IconCatalog } from './catalog';

const CAT: IconCatalog = {
  icons: { umbrella: '<path d="U"/>', 'tree-palm': '<path d="P"/>', anchor: '<path d="A"/>' },
  aliases: { palmtree: 'tree-palm' },
};

describe('catalog', () => {
  it('risolve un nome canonico', () => {
    expect(resolveFromCatalog(CAT, 'umbrella')).toBe('<path d="U"/>');
  });

  it('risolve un alias verso il body del padre', () => {
    expect(resolveFromCatalog(CAT, 'palmtree')).toBe('<path d="P"/>');
  });

  it('restituisce null per un nome inventato', () => {
    expect(resolveFromCatalog(CAT, 'non-esiste')).toBeNull();
  });

  it('un nome canonico con body vuoto risolve alla stringa vuota, non a null', () => {
    const withEmpty: IconCatalog = {
      icons: { ...CAT.icons, ghost: '' },
      aliases: CAT.aliases,
    };
    expect(resolveFromCatalog(withEmpty, 'ghost')).toBe('');
  });

  it('cerca per sottostringa e riporta il totale, non solo la pagina', () => {
    const r = searchCatalog(CAT, 'a', 2);
    expect(r.names).toHaveLength(2);
    // Quattro, non tre: la ricerca copre anche gli ALIAS, e 'palmtree' contiene una "a".
    expect(r.total).toBe(4); // umbrella, tree-palm, anchor + l'alias palmtree
  });

  it('senza query elenca tutto, sempre col tetto', () => {
    expect(searchCatalog(CAT, '', 10).total).toBe(4); // 3 canonici + 1 alias
    expect(searchCatalog(CAT, '   ', 1).names).toHaveLength(1);
  });

  it('la ricerca ignora le maiuscole', () => {
    expect(searchCatalog(CAT, 'UMBR', 10).names).toEqual(['umbrella']);
  });

  it('la ricerca trova anche per alias', () => {
    expect(searchCatalog(CAT, 'palmtree', 10).names).toContain('palmtree');
  });

  it('un catalogo vuoto non risolve un nome ereditato dalla catena dei prototipi', () => {
    const empty: IconCatalog = { icons: {}, aliases: {} };
    expect(resolveFromCatalog(empty, 'toString')).toBeNull();
    expect(resolveFromCatalog(empty, 'constructor')).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/catalog.spec.ts`
Expected: FAIL — `Failed to resolve import "./catalog"`.

- [ ] **Step 3: Scrivi l'implementazione minima**

```ts
// packages/ui-kit/src/icons/catalog.ts

/**
 * Un catalogo di icone interrogabile a runtime, indipendente dalla libreria che lo popola.
 * `icons` mappa il nome canonico al body SVG; `aliases` mappa un nome alternativo al canonico.
 * I body sono markup statico versionato: non arrivano mai dalla rete né dall'utente.
 */
export interface IconCatalog {
  readonly icons: Readonly<Record<string, string>>;
  readonly aliases: Readonly<Record<string, string>>;
}

/** Body SVG del nome dato, seguendo gli alias. `null` se il catalogo non lo conosce. */
export function resolveFromCatalog(catalog: IconCatalog, name: string): string | null {
  // Esistenza della chiave, non verita' del valore: il tipo ammette la stringa vuota, e con un
  // controllo di verita' un body vuoto cadrebbe sul ramo degli alias facendo restituire `null`
  // per un nome che il catalogo invece CONOSCE — cioe' il contrario di cio' che il commento promette.
  if (name in catalog.icons) return catalog.icons[name];
  const parent = catalog.aliases[name];
  return parent !== undefined ? (catalog.icons[parent] ?? null) : null;
}

/**
 * Nomi che contengono `query`, canonici e alias, troncati a `limit`.
 * `total` è il numero di corrispondenze PRIMA del troncamento: senza, un elenco troncato
 * non si distingue da un elenco esaurito e chi cerca conclude che l'icona non esiste.
 */
export function searchCatalog(
  catalog: IconCatalog,
  query: string,
  limit: number,
): { names: string[]; total: number } {
  const q = query.trim().toLowerCase();
  const all = [...Object.keys(catalog.icons), ...Object.keys(catalog.aliases)];
  const matches = q ? all.filter((n) => n.includes(q)) : all;
  return { names: matches.slice(0, limit), total: matches.length };
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/catalog.spec.ts`
Expected: PASS — 9 test.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/icons/catalog.ts packages/ui-kit/src/icons/catalog.spec.ts
git commit -m "feat(ui-kit): il catalogo icone come funzioni pure, senza sorgente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: La sorgente Lucide, dietro un entry point separato

L'entry separato è ciò che impedisce al catalogo di finire nel bundle di `web-customer` e `web-platform`, che non rendono icone di dominio. È il pattern che il repo usa già per `./toasts`.

**Files:**
- Create: `packages/ui-kit/src/icons/lucide-catalog.ts`
- Test: `packages/ui-kit/src/icons/lucide-catalog.spec.ts`
- Modify: `packages/ui-kit/package.json` (campo `exports`, e `@iconify-json/lucide` da devDependencies a dependencies)

**Interfaces:**
- Consumes: `IconCatalog` da Task 1.
- Produces: `lucideCatalog: IconCatalog`, importabile come `@coralyn/ui-kit/icons/lucide`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// packages/ui-kit/src/icons/lucide-catalog.spec.ts
import { describe, it, expect } from 'vitest';
import { lucideCatalog } from './lucide-catalog';
import { resolveFromCatalog, searchCatalog } from './catalog';

describe('lucideCatalog', () => {
  it('offre le 1743 icone non deprecate', () => {
    expect(Object.keys(lucideCatalog.icons)).toHaveLength(1743);
  });

  it('esclude le icone hidden, e con esse la sola 32x32 del set', () => {
    // search-large e' 32x32 e hidden: se entrasse, il viewBox costante la ritaglierebbe a un quarto.
    expect(lucideCatalog.icons['search-large']).toBeUndefined();
  });

  it('porta gli alias, cosi le righe gia salvate come palmtree continuano a risolvere', () => {
    expect(lucideCatalog.aliases['palmtree']).toBe('tree-palm');
    expect(resolveFromCatalog(lucideCatalog, 'palmtree')).toBe(
      resolveFromCatalog(lucideCatalog, 'tree-palm'),
    );
  });

  it('non porta alias orfani verso icone escluse', () => {
    for (const parent of Object.values(lucideCatalog.aliases)) {
      expect(lucideCatalog.icons[parent]).toBeTruthy();
    }
  });

  it('risolve i tre valori scrivibili oggi dal prodotto', () => {
    for (const k of ['umbrella', 'leaf', 'palmtree']) {
      expect(resolveFromCatalog(lucideCatalog, k)).toBeTruthy();
    }
  });

  it('la ricerca su un catalogo vero tronca e dichiara il totale', () => {
    const r = searchCatalog(lucideCatalog, 'arrow', 10);
    expect(r.names).toHaveLength(10);
    expect(r.total).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/lucide-catalog.spec.ts`
Expected: FAIL — `Failed to resolve import "./lucide-catalog"`.

- [ ] **Step 3: Scrivi l'implementazione**

```ts
// packages/ui-kit/src/icons/lucide-catalog.ts
import { icons as lucide } from '@iconify-json/lucide';
import type { IconCatalog } from './catalog';

/**
 * Il catalogo Lucide, senza le icone `hidden`.
 *
 * Le hidden sono deprecate a monte: offrirle significherebbe far scegliere nomi che la libreria
 * puo' togliere. L'esclusione rende inoltre corretto il `viewBox` costante di `Icon.vue`, perche'
 * l'unica icona con dimensioni proprie (`search-large`, 32x32) e' hidden.
 *
 * Import tipizzato dall'entry del pacchetto, NON dal JSON grezzo: `resolveJsonModule` non e' attivo
 * in questo repo.
 */
const icons: Record<string, string> = {};
for (const [name, data] of Object.entries(lucide.icons)) {
  if (!data.hidden) icons[name] = data.body;
}

const aliases: Record<string, string> = {};
for (const [alias, data] of Object.entries(lucide.aliases ?? {})) {
  // Un alias verso un'icona esclusa sarebbe un vicolo cieco: si scarta.
  if (data.parent && icons[data.parent]) aliases[alias] = data.parent;
}

export const lucideCatalog: IconCatalog = { icons, aliases };
```

- [ ] **Step 4: Aggiungi l'entry point e sposta la dipendenza**

In `packages/ui-kit/package.json`, dentro `exports`, dopo la riga di `./toasts`:

```json
    "./icons/lucide": "./src/icons/lucide-catalog.ts",
```

E sposta `"@iconify-json/lucide": "^1.2.114"` da `devDependencies` a `dependencies`: da qui in poi è codice di produzione del kit, non solo un tipo di sviluppo.

- [ ] **Step 5: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/lucide-catalog.spec.ts`
Expected: PASS — 6 test.

⚠️ Se il conteggio non fosse 1743, **non aggiustare il numero nel test**: verifica la versione del pacchetto. Il numero è un'asserzione sul contratto della libreria, ed è anche il totale che `info.json` dichiara.

- [ ] **Step 6: Rigira la suite intera del pacchetto**

Run: `pnpm --filter @coralyn/ui-kit test`
Expected: PASS, **227 test su 41 file** — baseline 214/39, più i **7** di `catalog.spec.ts` (Task 1) e i **6** di `lucide-catalog.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/icons/lucide-catalog.ts packages/ui-kit/src/icons/lucide-catalog.spec.ts packages/ui-kit/package.json
git commit -m "feat(ui-kit): il catalogo lucide dietro un entry point separato

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Le due chiavi che fanno ombra a nomi Lucide veri

Va **prima** del picker: aperto il catalogo, `edit` e `building` sarebbero offerti come nomi Lucide e resi come tutt'altro.

**Files:**
- Modify: `packages/ui-kit/src/icons/registry.ts` (le chiavi `edit` e `building` nell'oggetto `icons`)
- Modify: `packages/ui-kit/src/components/Icon.spec.ts` (l'elenco delle chiavi asserite)
- Modify: i 3 punti che usano `name="edit"`
- Test: `packages/ui-kit/src/icons/registry.spec.ts` (nuovo)

**Interfaces:**
- Consumes: `lucideCatalog` da Task 2.
- Produces: nessuna chiave del registry fa più ombra a un nome Lucide con glifo diverso.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// packages/ui-kit/src/icons/registry.spec.ts
import { describe, it, expect } from 'vitest';
import { icons } from './registry';
import { lucideCatalog } from './lucide-catalog';
import { resolveFromCatalog } from './catalog';

describe('registry — spazio dei nomi condiviso col catalogo', () => {
  // Icon.vue consulta PRIMA il registry: una chiave omonima di un'icona Lucide diversa
  // vincerebbe in silenzio, e chi la sceglie dal picker vedrebbe un altro glifo.
  it('nessuna chiave del registry e omonima di un icona Lucide diversa', () => {
    const ombre = Object.keys(icons).filter((k) => resolveFromCatalog(lucideCatalog, k) !== null);
    // Le chiavi che restano devono essere quelle che rendono ESATTAMENTE l'omonima Lucide.
    // Qui asseriamo che le due note siano state rinominate.
    expect(ombre).not.toContain('edit');
    expect(ombre).not.toContain('building');
  });

  it('le chiavi rinominate esistono col nome canonico Lucide', () => {
    expect(icons['pencil']).toBeTruthy();
    expect(icons['building-2']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/registry.spec.ts`
Expected: FAIL — `expected [ ... 'edit' ... ] not to contain 'edit'`.

- [ ] **Step 3: Rinomina le due chiavi**

In `packages/ui-kit/src/icons/registry.ts`, nell'oggetto `icons`, la riga che contiene `edit: IconEdit` e `building: IconBuilding` diventa:

```ts
  mail: IconMail, renew: IconRenew, pencil: IconEdit, logout: IconLogout, 'building-2': IconBuilding,
```

Gli `import` non cambiano: `IconEdit` è già `~icons/lucide/pencil` e `IconBuilding` è già `~icons/lucide/building-2`. Le chiavi tornano semplicemente a chiamarsi come il glifo che rendono.

- [ ] **Step 4: Aggiorna i chiamanti — tutti e DIECI**

⚠️ La chiave `edit` si usa in **due forme**, e cercarne una sola ne manca sette: `name="edit"` (3 usi, dentro `<Icon>`) e `icon="edit"` (7 usi, la prop di `IconButton`). Il comando che le trova entrambe:

```bash
grep -rn 'name="edit"\|icon="edit"' apps packages --include=*.vue --include=*.ts
```

Atteso: **10 righe**, in `CustomerDetailView.vue`, `EstablishmentView.vue` (due), `BeachPanel.vue`, `PricingView.vue` (quattro), `RentalCatalogView.vue` (due). In tutte, `edit` diventa `pencil`.

`building` invece ha **zero** chiamanti — verificato con lo stesso comando su `name="building"\|icon="building"` — quindi la sua rinomina non tocca nulla.

In `packages/ui-kit/src/components/Icon.spec.ts`, nell'elenco delle chiavi asserite, `'edit'` diventa `'pencil'` e `'building'` diventa `'building-2'`.

- [ ] **Step 5: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/icons/registry.spec.ts src/components/Icon.spec.ts`
Expected: PASS.

- [ ] **Step 6: Rigira le suite intere dei due pacchetti toccati**

Run: `pnpm --filter @coralyn/ui-kit test`
Expected: PASS, **229 test su 42 file** (227 più i 2 di `registry.spec.ts`).

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS, 600 test su 66 file (invariato: nessun test asserisce il nome dell'icona di modifica).

- [ ] **Step 7: Commit**

```bash
git add -u packages/ui-kit apps/web-staff && git add packages/ui-kit/src/icons/registry.spec.ts
git commit -m "fix(ui-kit): due chiavi del registry facevano ombra a icone lucide diverse

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Registrazione e catena di risoluzione

**Files:**
- Create: `packages/ui-kit/src/icons/registered-catalog.ts`
- Modify: `packages/ui-kit/src/components/Icon.vue`
- Modify: `packages/ui-kit/src/icons/registry.ts` (rimozione di `FALLBACK_ICON`)
- Modify: `packages/ui-kit/src/index.ts`
- Test: `packages/ui-kit/src/components/Icon.spec.ts`

**Interfaces:**
- Consumes: `IconCatalog`, `resolveFromCatalog` (Task 1); `lucideCatalog` (Task 2).
- Produces: `registerIconCatalog(c: IconCatalog): void`, `getIconCatalog(): IconCatalog | null`, entrambi esportati dal barrel.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// da aggiungere in coda a packages/ui-kit/src/components/Icon.spec.ts
import { registerIconCatalog, resetIconCatalog } from '../icons/registered-catalog';
import { lucideCatalog } from '../icons/lucide-catalog';

describe('Icon — catena di risoluzione', () => {
  it('senza catalogo registrato, un nome fuori dal registry cade sul fallback', () => {
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.find('svg').exists()).toBe(true);
    expect(w.html()).not.toContain('<path d="M12 6v16');
  });

  it('col catalogo registrato rende il glifo vero, non il fallback', () => {
    registerIconCatalog(lucideCatalog);
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.html()).toContain('circle');
    expect(w.get('svg').attributes('viewBox')).toBe('0 0 24 24');
  });

  it('il registry vince sul catalogo per le icone del chrome', () => {
    registerIconCatalog(lucideCatalog);
    expect(mount(Icon, { props: { name: 'umbrella' } }).find('svg').exists()).toBe(true);
  });

  it('un alias risolve lo stesso glifo del suo padre nel catalogo', () => {
    // 'alert-circle' e' un alias Lucide di 'circle-alert': nessuno dei due e' una chiave del
    // registry (a differenza di 'palmtree', che lo e' e quindi risolverebbe dal registry senza
    // mai toccare il catalogo). Il padre non e' `hidden`, quindi l'alias sopravvive nel catalogo
    // (vedi lucide-catalog.ts).
    registerIconCatalog(lucideCatalog);
    const alias = mount(Icon, { props: { name: 'alert-circle' } });
    const canonico = mount(Icon, { props: { name: 'circle-alert' } });
    const ignoto = mount(Icon, { props: { name: 'nome-che-non-esiste-affatto' } });
    // Stesso glifo del padre: prova che l'alias e' stato seguito, non solo che "c'e' un svg".
    expect(alias.html()).toBe(canonico.html());
    // E diverso dal fallback: prova che non e' semplicemente caduto fuori catalogo.
    expect(alias.html()).not.toBe(ignoto.html());
  });

  it('un nome ignoto non rende NESSUN glifo che una tipologia possa avere addosso', () => {
    // Il difetto vecchio: icons[name] ?? icons['umbrella'] rendeva un ombrellone plausibile per un
    // nome sbagliato, indistinguibile da un ombrellone voluto. Asserire `FALLBACK !== 'umbrella'`
    // non basterebbe: passerebbe con qualsiasi altra chiave, comprese quelle che il picker offre —
    // e allora una tipologia a cui si assegna VOLUTAMENTE quel glifo sarebbe di nuovo
    // indistinguibile da una risoluzione fallita. Il fallback deve stare FUORI dal catalogo.
    registerIconCatalog(lucideCatalog);
    const ignoto = mount(Icon, { props: { name: 'non-esiste-affatto' } }).html();
    for (const sceglibile of ['umbrella', 'alert-triangle', 'circle-help', 'tree-palm']) {
      expect(ignoto).not.toBe(mount(Icon, { props: { name: sceglibile } }).html());
    }
  });

  it('registrare e poi azzerare riporta al comportamento senza catalogo', () => {
    registerIconCatalog(lucideCatalog);
    resetIconCatalog();
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.html()).toBe(mount(Icon, { props: { name: 'altro-ignoto' } }).html());
  });
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/components/Icon.spec.ts`
Expected: FAIL — `Failed to resolve import "../icons/registered-catalog"`.

- [ ] **Step 3: Scrivi lo stato di registrazione**

```ts
// packages/ui-kit/src/icons/registered-catalog.ts
import { shallowRef } from 'vue';
import type { IconCatalog } from './catalog';

/**
 * Il catalogo che l'applicazione ha deciso di caricare. Parte vuoto di proposito.
 *
 * L'inversione (l'app registra, il kit consulta) e' cio' che permette a web-staff di avere il
 * catalogo intero nel bundle senza che web-customer e web-platform — che non rendono icone di
 * dominio — se lo portino dietro dal barrel.
 *
 * `shallowRef` e non una variabile: i `computed` che lo leggono devono invalidarsi se la
 * registrazione avviene dopo che un componente e' gia' montato.
 */
const current = shallowRef<IconCatalog | null>(null);

export function registerIconCatalog(catalog: IconCatalog): void {
  current.value = catalog;
}

export function getIconCatalog(): IconCatalog | null {
  return current.value;
}

/**
 * Azzera la registrazione. Gemello di `clearToasts`: senza, l'isolamento fra un test che registra
 * il catalogo e uno che non lo vuole starebbe tutto nell'ORDINE di dichiarazione dentro il file, e
 * chi aggiunge un caso in testa fa asserire all'altro l'opposto del proprio titolo.
 */
export function resetIconCatalog(): void {
  current.value = null;
}
```

- [ ] **Step 4: Riscrivi la catena in `Icon.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { icons } from '../icons/registry';
import { getIconCatalog } from '../icons/registered-catalog';
import { resolveFromCatalog } from '../icons/catalog';

const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), { size: 16 });

/**
 * Glifo reso quando un nome non risolve: un quadrato tratteggiato con un punto interrogativo.
 *
 * È scritto QUI e non è una chiave, né del registry né del catalogo, e questa è la ragione per cui
 * funziona: nessuna tipologia può averlo addosso per scelta, quindi vederlo significa sempre e solo
 * «questo nome non risolve». Una chiave qualunque — anche `alert-triangle` — sarebbe sceglibile dal
 * picker, e allora un errore tornerebbe indistinguibile da una scelta: cioè il difetto che questo
 * cambiamento esiste per chiudere.
 */
const UNKNOWN_BODY =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/>' +
  '<path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V14"/><path d="M12 17.5v.01"/></g>';

// Catena dichiarata: registry del chrome -> catalogo registrato -> alias -> fallback VISIBILE.
// Il registry vince perche' le sue chiavi sono quelle del chrome, montate staticamente.
const comp = computed(() => icons[props.name]);
const body = computed(() => {
  if (comp.value) return null;
  const catalog = getIconCatalog();
  return (catalog ? resolveFromCatalog(catalog, props.name) : null) ?? UNKNOWN_BODY;
});
</script>

<template>
  <component
    :is="comp" v-if="comp" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
  />
  <!-- Il body arriva da un file statico versionato dentro il bundle: mai dalla rete, mai
       dall'utente, mai dal database. Il nome, che dal database ci arriva, e' solo una chiave di
       lookup e non finisce mai nel markup. -->
  <svg
    v-else viewBox="0 0 24 24" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
    v-html="body"
  />
</template>
```

- [ ] **Step 5: Togli `FALLBACK_ICON`, che ora mentirebbe**

Il fallback non è più una chiave: la costante non ha più un referente. Lasciarla esportata dal barrel col valore `'umbrella'` significherebbe pubblicare un'affermazione falsa sul comportamento del kit.

In `packages/ui-kit/src/icons/registry.ts` cancella la riga di `FALLBACK_ICON`, e in `packages/ui-kit/src/index.ts` toglila dall'export. Sono le sue **uniche** quattro occorrenze di codice — verificale prima:

```bash
git grep -n "FALLBACK_ICON" -- "*.ts" "*.vue"
```

Atteso dopo la modifica: **zero** righe.

⚠️ **Questo ripara un difetto esistente e visibile**, e va detto nell'ADR invece di lasciarlo scoprire: `NoAccessView.vue` passa `icon="lock"`, `lock` **non è** fra le 41 chiavi del registry, e oggi quella schermata rende **un ombrellone** dove il sorgente ha sempre chiesto un lucchetto. Registrato il catalogo, renderà il lucchetto. Non è una rottura: è il sorgente che comincia a essere creduto.

- [ ] **Step 6: Esporta dal barrel**

In `packages/ui-kit/src/index.ts`, accanto alla riga che esporta `icons` (da cui `FALLBACK_ICON` è appena sparito):

```ts
export { registerIconCatalog, getIconCatalog } from './icons/registered-catalog';
export { resolveFromCatalog, searchCatalog, type IconCatalog } from './icons/catalog';
```

- [ ] **Step 7: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/components/Icon.spec.ts`
Expected: PASS.

- [ ] **Step 8: Rigira la suite intera**

Run: `pnpm --filter @coralyn/ui-kit test`
Expected: PASS. ⚠️ Se qualche test di un altro componente arrossa qui, è perché rendeva un'icona con un nome fuori dal registry e prima cadeva sull'ombrellone: è un difetto **scoperto**, non causato.

- [ ] **Step 9: Commit**

```bash
git add -u packages/ui-kit && git add packages/ui-kit/src/icons/registered-catalog.ts
git commit -m "feat(ui-kit): la catena di risoluzione delle icone, e un fallback che si vede

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: L'IconPicker

**Files:**
- Create: `packages/ui-kit/src/icons/suggested.ts`
- Create: `packages/ui-kit/src/components/IconPicker.vue`
- Test: `packages/ui-kit/src/components/IconPicker.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`

**Interfaces:**
- Consumes: `searchCatalog`, `resolveFromCatalog`, `getIconCatalog`, `SearchInput`, `Popover`, `FIELD_LABEL_ID`.
- Produces: componente `IconPicker` con `defineModel<string>()` e prop `limit?: number` (default 60).

- [ ] **Step 1: Scrivi l'elenco suggerito**

```ts
// packages/ui-kit/src/icons/suggested.ts

/**
 * Le icone proposte all'apertura del picker. Non è un vincolo: la ricerca interroga TUTTE le
 * 1743 icone del catalogo, e nessuna è preclusa. Serve solo a non aprire su `a-arrow-down`.
 *
 * Vive in un solo posto: duplicarlo rifarebbe la duplicazione che questo lavoro toglie (D-040).
 */
export const SUGGESTED_ICONS: readonly string[] = [
  // ⚠️ `waves` NON va usata: in lucide 1.2.114 e' `hidden`, quindi il catalogo la esclude e il
  // filtro la scarterebbe in silenzio, aprendo il picker con 25 suggerimenti su 26.
  'umbrella', 'tree-palm', 'leaf', 'tent', 'waves-horizontal', 'anchor', 'sun', 'sunset',
  'shell', 'fish', 'sailboat', 'ship-wheel', 'life-buoy', 'volleyball',
  'armchair', 'bed-double', 'sofa', 'utensils', 'coffee', 'ice-cream-cone',
  'shower-head', 'baby', 'accessibility', 'dog', 'parking-meter', 'star',
];
```

- [ ] **Step 2: Scrivi il test che fallisce**

```ts
// packages/ui-kit/src/components/IconPicker.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import IconPicker from './IconPicker.vue';
import Field from './Field.vue';
import { registerIconCatalog } from '../icons/registered-catalog';
import { lucideCatalog } from '../icons/lucide-catalog';

// ⚠️ Il pacchetto ui-kit NON ha `setupFiles`: ogni spec dichiara i propri stub. reka-ui misura
// l'arrow del Popover con `new ResizeObserver`, che jsdom non implementa e che non e' guardato:
// senza queste due righe i test che aprono il picker esplodono con un ReferenceError, e il difetto
// sembra stare in IconPicker.vue, che invece e' sano. Stesso stub di Popover.spec.ts e Select.spec.ts.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

beforeEach(() => registerIconCatalog(lucideCatalog));

const open = { props: { modelValue: 'umbrella', defaultOpen: true }, global: { stubs: { teleport: true } } };

describe('IconPicker', () => {
  it('apre sulle icone suggerite, non sull ordine alfabetico', async () => {
    const w = mount(IconPicker, open);
    const primo = w.get('[data-testid="icon-option"]');
    expect(primo.attributes('data-icon')).toBe('umbrella');
  });

  it('la ricerca filtra il catalogo intero', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('anchor');
    const nomi = w.findAll('[data-testid="icon-option"]').map((n) => n.attributes('data-icon'));
    expect(nomi).toContain('anchor');
    expect(nomi).not.toContain('umbrella');
  });

  it('emette il nome scelto', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('anchor');
    await w.get('[data-icon="anchor"]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['anchor']);
  });

  it('quando tronca lo DICE: un elenco troncato non e un elenco esaurito', async () => {
    const w = mount(IconPicker, { ...open, props: { ...open.props, limit: 5 } });
    await w.get('input[type="text"]').setValue('arrow');
    expect(w.findAll('[data-testid="icon-option"]')).toHaveLength(5);
    expect(w.get('[data-testid="icon-count"]').text()).toMatch(/\d+/);
  });

  it('una ricerca senza esiti lo dice invece di mostrare il vuoto', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('zzzznonesiste');
    expect(w.findAll('[data-testid="icon-option"]')).toHaveLength(0);
    expect(w.get('[data-testid="icon-empty"]').exists()).toBe(true);
  });

  it('dentro un Field il trigger e etichettato dal Field, non dal valore', () => {
    // AUD-013, WCAG 4.1.2: un <button> non e' un labelable element, quindi il <label> di Field
    // non gli da' alcun nome e lo screen reader annuncerebbe "tree-palm".
    const w = mount(Field, {
      props: { label: 'Icona sulla mappa' },
      slots: { default: h(IconPicker, { modelValue: 'umbrella' }) },
      global: { stubs: { teleport: true } },
    });
    const trigger = w.get('[data-testid="icon-picker-trigger"]');
    const labelledBy = trigger.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(w.get(`#${labelledBy}`).text()).toBe('Icona sulla mappa');
  });

  it('fuori da un Field non inventa un aria-labelledby verso un id inesistente', () => {
    const w = mount(IconPicker, { props: { modelValue: 'umbrella' }, global: { stubs: { teleport: true } } });
    expect(w.get('[data-testid="icon-picker-trigger"]').attributes('aria-labelledby')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/components/IconPicker.spec.ts`
Expected: FAIL — `Failed to resolve import "./IconPicker.vue"`.

- [ ] **Step 4: Scrivi il componente**

```vue
<!-- packages/ui-kit/src/components/IconPicker.vue -->
<script setup lang="ts">
import { computed, inject, ref, useAttrs } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import SearchInput from './SearchInput.vue';
import { FIELD_LABEL_ID } from './field-context';
import { getIconCatalog } from '../icons/registered-catalog';
import { searchCatalog } from '../icons/catalog';
import { SUGGESTED_ICONS } from '../icons/suggested';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ limit?: number; defaultOpen?: boolean }>(), {
  limit: 60, defaultOpen: false,
});
const model = defineModel<string>({ default: '' });

const query = ref('');

// Senza query si mostrano le suggerite; con query si cerca su TUTTO il catalogo.
const risultati = computed(() => {
  const catalog = getIconCatalog();
  if (!catalog) return { names: [] as string[], total: 0 };
  if (!query.value.trim()) {
    return { names: SUGGESTED_ICONS.filter((n) => catalog.icons[n]).slice(0, props.limit), total: 0 };
  }
  return searchCatalog(catalog, query.value, props.limit);
});
const troncato = computed(() => risultati.value.total > risultati.value.names.length);
const vuoto = computed(() => query.value.trim().length > 0 && risultati.value.names.length === 0);

/**
 * Nome accessibile del trigger (AUD-013, WCAG 4.1.2), stessa regola di `Select`: un `<button>` non
 * e' etichettabile da un `<label>`, quindi senza questo lo screen reader annuncerebbe il valore
 * (`tree-palm`) invece di «Icona sulla mappa». Un aria-* del chiamante VINCE.
 */
const attrs = useAttrs();
const fieldLabelId = inject(FIELD_LABEL_ID, null);
const labelledBy = computed(() =>
  attrs['aria-label'] || attrs['aria-labelledby'] ? undefined : (fieldLabelId ?? undefined),
);

function scegli(name: string) { model.value = name; }
</script>

<template>
  <Popover :default-open="defaultOpen" align="start">
    <template #trigger>
      <button
        v-bind="$attrs" type="button" data-testid="icon-picker-trigger" :aria-labelledby="labelledBy"
        class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-left text-[13.5px] text-[var(--color-text)] outline-none focus-visible:border-[var(--color-brand)] focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <span class="inline-flex items-center gap-2 truncate">
          <Icon :name="model" :size="18" /><span class="truncate">{{ model }}</span>
        </span>
        <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-text-muted)]" />
      </button>
    </template>

    <template #content>
      <div class="w-[268px]">
        <SearchInput v-model="query" placeholder="Cerca un'icona…" aria-label="Cerca un'icona" />

        <div v-if="vuoto" data-testid="icon-empty" class="px-1 py-3 text-[12px] text-[var(--color-text-muted)]">
          Nessuna icona per «{{ query }}».
        </div>

        <div v-else class="mt-2.5 grid max-h-[240px] grid-cols-6 gap-1 overflow-y-auto">
          <button
            v-for="n in risultati.names" :key="n" type="button"
            data-testid="icon-option" :data-icon="n" :title="n" :aria-label="n"
            :aria-pressed="n === model"
            class="grid size-9 place-items-center rounded-[9px] text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] aria-pressed:bg-[var(--color-raised)] aria-pressed:text-[var(--color-brand)]"
            @click="scegli(n)"
          ><Icon :name="n" :size="18" /></button>
        </div>

        <!-- Un elenco troncato senza avviso si confonde con un elenco esaurito, e chi cerca
             conclude che l'icona non esista. -->
        <p v-if="troncato" data-testid="icon-count" class="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Mostrate {{ risultati.names.length }} di {{ risultati.total }} — restringi la ricerca.
        </p>
      </div>
    </template>
  </Popover>
</template>
```

- [ ] **Step 5: Esporta dal barrel**

In `packages/ui-kit/src/index.ts`, accanto agli altri componenti:

```ts
export { default as IconPicker } from './components/IconPicker.vue';
export { SUGGESTED_ICONS } from './icons/suggested';
```

- [ ] **Step 6: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/ui-kit exec vitest run src/components/IconPicker.spec.ts`
Expected: PASS — 7 test.

- [ ] **Step 7: Rigira la suite intera e il typecheck**

Run: `pnpm --filter @coralyn/ui-kit test`
Expected: PASS, **242 test su 43 file** (235 dopo Task 4, più i 7 dell'IconPicker).

Run: `pnpm --filter @coralyn/ui-kit typecheck`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add packages/ui-kit/src/components/IconPicker.vue packages/ui-kit/src/components/IconPicker.spec.ts packages/ui-kit/src/icons/suggested.ts && git add -u packages/ui-kit
git commit -m "feat(ui-kit): l'IconPicker, composto sui primitivi che il kit ha gia'

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: L'API valida contro l'elenco vero

**Files:**
- Create: `apps/api/src/common/is-icon-key.ts`
- Test: `apps/api/src/common/is-icon-key.spec.ts`
- Modify: `apps/api/src/establishment/dto/create-umbrella-type.dto.ts`, `update-umbrella-type.dto.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `@iconify-json/lucide` (import tipizzato).
- Produces: `IsIconKey(options?: ValidationOptions)`.

- [ ] **Step 1: Aggiungi la dipendenza**

In `apps/api/package.json`, dentro `dependencies`, con lo **stesso range** degli altri quattro pacchetti:

```json
    "@iconify-json/lucide": "^1.2.114",
```

Poi: `pnpm install`

- [ ] **Step 2: Scrivi il test che fallisce**

```ts
// apps/api/src/common/is-icon-key.spec.ts
import { validate } from 'class-validator';
import { IsIconKey } from './is-icon-key';

class Probe {
  @IsIconKey()
  icon!: string;
}

async function erroriSu(value: unknown): Promise<number> {
  const p = new Probe();
  (p as { icon: unknown }).icon = value;
  return (await validate(p)).length;
}

describe('IsIconKey', () => {
  it('accetta un nome lucide canonico', async () => {
    expect(await erroriSu('anchor')).toBe(0);
  });

  it('accetta i tre valori che il prodotto sa gia scrivere', async () => {
    for (const k of ['umbrella', 'leaf', 'palmtree']) expect(await erroriSu(k)).toBe(0);
  });

  it('accetta un alias, perche le righe gia salvate ne portano uno', async () => {
    expect(await erroriSu('palmtree')).toBe(0);
  });

  it('rifiuta un nome inventato', async () => {
    expect(await erroriSu('non-esiste-affatto')).toBe(1);
  });

  it('rifiuta un icona deprecata, che il picker non offre', async () => {
    expect(await erroriSu('search-large')).toBe(1);
  });

  it('rifiuta un valore non stringa', async () => {
    expect(await erroriSu(42)).toBe(1);
    expect(await erroriSu(null)).toBe(1);
  });
});
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/api test -- is-icon-key`
Expected: FAIL — `Cannot find module './is-icon-key'`.

- [ ] **Step 4: Scrivi il decoratore**

```ts
// apps/api/src/common/is-icon-key.ts
import { registerDecorator, ValidationOptions } from 'class-validator';
import { icons as lucide } from '@iconify-json/lucide';

/**
 * Valida che il valore sia una chiave icona che il prodotto sa davvero rendere: un nome Lucide non
 * deprecato, oppure un suo alias.
 *
 * Esiste perche' `ValidationPipe` gira senza `forbidNonWhitelisted` e il campo e' una `String?` a
 * schema: senza questo controllo un client puo' scrivere spazzatura nel database, e la Mappa
 * renderebbe il fallback per sempre senza che nessun errore venga mai sollevato. Gemello di
 * `IsUuidShape`.
 *
 * Le `hidden` sono escluse per la stessa ragione per cui non le offre il picker: sono deprecate a
 * monte, e accettarle significherebbe persistere nomi che la libreria puo' togliere.
 */
// ⚠️ Il predicato sugli alias dev'essere IDENTICO per costruzione a quello del catalogo (Task 2):
// il padre dev'essere PRESENTE e non hidden. Scrivere solo `!hidden` non basta, perche'
// `undefined?.hidden` e' falsy e un alias con padre inesistente passerebbe dall'API senza che il
// picker lo offra — cioe' l'API accetterebbe un nome che il prodotto non sa rendere.
const RENDIBILI = new Set(
  Object.entries(lucide.icons).filter(([, d]) => !d.hidden).map(([name]) => name),
);
const VALID = new Set<string>([
  ...RENDIBILI,
  ...Object.entries(lucide.aliases ?? {})
    .filter(([, d]) => d.parent && RENDIBILI.has(d.parent))
    .map(([alias]) => alias),
]);

export function IsIconKey(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIconKey',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a known icon key`, ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && VALID.has(value);
        },
      },
    });
  };
}
```

- [ ] **Step 5: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/api test -- is-icon-key`
Expected: PASS — 6 test.

- [ ] **Step 6: Sostituisci nei due DTO**

`apps/api/src/establishment/dto/create-umbrella-type.dto.ts` diventa:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateUmbrellaTypeInput } from '@coralyn/contracts';
import { IsIconKey } from '../../common/is-icon-key';

export class CreateUmbrellaTypeDto implements CreateUmbrellaTypeInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIconKey()
  icon!: string;
}
```

In `update-umbrella-type.dto.ts` applica la **stessa** sostituzione: via `ICON_KEYS` e `@IsIn`, dentro `@IsIconKey()`, conservando l'`@IsOptional()` che quel DTO già ha sui suoi campi.

⚠️ Vanno cambiati **entrambi**: erano duplicati, e correggerne uno solo è il difetto che si ripresenta.

- [ ] **Step 7: Il presidio sui DUE DTO veri, non su una classe fittizia**

Il test dello Step 2 prova il **decoratore**. Non prova che sia stato **applicato** a entrambi i DTO: se si tocca solo il `create`, la PATCH continua a rispondere 400 su ogni nome che il picker propone, e nessun test se ne accorge. Crea `apps/api/src/establishment/dto/umbrella-type-icon.dto.spec.ts`, con la convenzione locale (`plainToInstance` + `validate`):

```ts
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUmbrellaTypeDto } from './create-umbrella-type.dto';
import { UpdateUmbrellaTypeDto } from './update-umbrella-type.dto';

// I due DTO portavano lo stesso ICON_KEYS duplicato: il presidio deve valere su ENTRAMBI, o
// correggerne uno solo lascia l'altro indietro senza che nulla arrossi.
const erroriCreate = async (icon: unknown): Promise<string[]> =>
  (await validate(plainToInstance(CreateUmbrellaTypeDto, { name: 'Gazebo', icon }))).map((e) => e.property);
const erroriUpdate = async (icon: unknown): Promise<string[]> =>
  (await validate(plainToInstance(UpdateUmbrellaTypeDto, { icon }))).map((e) => e.property);

describe('icona della tipologia — stessa regola sui due DTO', () => {
  it.each([['create', erroriCreate], ['update', erroriUpdate]] as const)(
    '%s accetta un nome lucide e un alias, e rifiuta un nome inventato',
    async (_nome, errori) => {
      expect(await errori('anchor')).toEqual([]);
      expect(await errori('palmtree')).toEqual([]);
      expect(await errori('non-esiste-affatto')).toEqual(['icon']);
    },
  );
});
```

Run: `pnpm --filter @coralyn/api test -- umbrella-type-icon`
Expected: PASS — 2 casi.

- [ ] **Step 8: Rigira la suite intera del pacchetto**

Run: `pnpm --filter @coralyn/api test`
Expected: PASS, **457** test (baseline 449, più i 6 di `is-icon-key.spec.ts` e i 2 casi del file sopra).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/is-icon-key.ts apps/api/src/common/is-icon-key.spec.ts apps/api/src/establishment/dto/umbrella-type-icon.dto.spec.ts && git add -u apps/api
git commit -m "feat(api): l'icona si valida sull'elenco lucide vero, non su tre valori

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: web-staff — registrazione e pannello

**Files:**
- Modify: `apps/web-staff/src/main.ts`, `apps/web-staff/src/test/setup.ts`
- Modify: `apps/web-staff/src/features/establishment/panels/BeachPanel.vue`
- Test: `apps/web-staff/src/features/establishment/panels/BeachPanel.icon.spec.ts` (**nuovo**)

⚠️ `apps/web-staff/package.json` **non si tocca**: `^1.2.114` c'è già e `@coralyn/ui-kit` pure. E la voce in `devDependencies` **deve restare lì**: serve a `unplugin-icons` per compilare i 41 `~icons/lucide/*` del registry.

**Interfaces:**
- Consumes: `IconPicker`, `registerIconCatalog` dal barrel; `lucideCatalog` da `@coralyn/ui-kit/icons/lucide`.

- [ ] **Step 1: Registra il catalogo in ENTRAMBI i punti**

In `apps/web-staff/src/main.ts`, prima del mount:

```ts
import { registerIconCatalog } from '@coralyn/ui-kit';
import { lucideCatalog } from '@coralyn/ui-kit/icons/lucide';

registerIconCatalog(lucideCatalog);
```

⚠️ E **la stessa cosa in `apps/web-staff/src/test/setup.ts`**, al top level. Vitest carica i soli `setupFiles` e **non esegue mai `main.ts`**: senza questa riga il test del picker girerebbe a catalogo vuoto, e il modo peggiore in cui fallirebbe è **passare**, asserendo l'emissione mentre la griglia è vuota.

- [ ] **Step 2: Scrivi il test che fallisce**

⚠️ Il file va **creato**: `form-sync.spec.ts` monta `SectorPanel`/`RowPanel`/`UmbrellaPanel`, **non** `BeachPanel`. Il repo tiene già un file per tema (`BeachPanel.restore.spec.ts`): questo ne segue il pattern.

```ts
// packages/../apps/web-staff/src/features/establishment/panels/BeachPanel.icon.spec.ts
import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import BeachPanel from './BeachPanel.vue';

enableAutoUnmount(afterEach);

const DATA: EstablishmentStructureDTO = {
  sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [] }],
  umbrellaTypes: [],
};

describe('BeachPanel — l icona della tipologia si sceglie dal catalogo', () => {
  it('la form apre il picker, non una Select a tre voci', async () => {
    const w = mountApp(BeachPanel, { props: { data: DATA, canManage: true }, attachTo: document.body });
    await w.get('[data-testid="type-new"]').trigger('click');
    expect(w.find('[data-testid="icon-picker-trigger"]').exists()).toBe(true);
    expect(w.find('[data-testid="type-icon"]').exists()).toBe(false); // la Select non c'e' piu'
  });

  it('riaprendo in modifica NON riporta a ombrellone un icona fuori dai tre nomi vecchi', async () => {
    // Il ramo che lo Step 4 riscrive: se `openEdit` continuasse a normalizzare cio' che non
    // riconosce, riaprire una tipologia con `anchor` la riporterebbe a `umbrella`, e il salvataggio
    // successivo sovrascriverebbe la scelta dell'operatore senza dirglielo.
    const DATI = {
      ...DATA,
      umbrellaTypes: [{ id: 't-1', name: 'Gazebo', sortOrder: 1, icon: 'anchor' }],
    };
    const w = mountApp(BeachPanel, { props: { data: DATI, canManage: true }, attachTo: document.body });
    await w.get('[data-testid="type-edit"]').trigger('click');
    expect(w.get('[data-testid="icon-picker-trigger"]').text()).toContain('anchor');
  });
});
```

- [ ] **Step 3: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/web-staff exec vitest run src/features/establishment/panels/BeachPanel.icon.spec.ts`
Expected: FAIL — l'elemento `icon-picker-trigger` non esiste.

- [ ] **Step 4: Sostituisci il controllo in `BeachPanel.vue`**

Nel blocco `<script setup>`, il `ref` tipizzato diventa una stringa:

```ts
const icon = ref<string>('umbrella');
```

e nella funzione che apre la modifica, il cast al tipo chiuso sparisce:

```ts
function openEdit(t: UmbrellaTypeDTO) { editing.value = t.id; name.value = t.name; icon.value = t.icon ?? 'umbrella'; }
```

Nel template, dentro il `<Field label="Icona sulla mappa">`, la `Select` con i tre `<Option>` diventa:

```vue
              <IconPicker v-model="icon" />
```

E nell'import da `@coralyn/ui-kit`, aggiungi `IconPicker` e togli `Select`/`Option` **solo se** non sono più usati altrove nel file: verificalo, il pannello ne ha altri.

⚠️ **Non** aggiungere un `data-testid` sull'`IconPicker` dal pannello: nel suo template `v-bind="$attrs"` **precede** il `data-testid` statico del trigger, e in `mergeProps` l'ultimo vince — resterebbe in `BeachPanel.vue` un selettore che non seleziona nulla. Il test usa `[data-testid="icon-picker-trigger"]`, che il componente si dà da sé.

- [ ] **Step 5: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/web-staff exec vitest run src/features/establishment/panels/BeachPanel.icon.spec.ts`
Expected: PASS — 2 test. ⚠️ È lo **stesso** file dello Step 3: lanciarne un altro passerebbe in verde senza aver mai eseguito il test appena scritto.

- [ ] **Step 6: Rigira la suite intera del pacchetto**

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS. ⚠️ Attenzione ai test che pilotavano la vecchia `Select` con `selectOption(trigger, label)`: vanno riscritti sul picker, non cancellati.

- [ ] **Step 7: Commit**

```bash
git add -u apps/web-staff
git commit -m "feat(web-staff): il picker delle icone nella form della tipologia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: La legenda della Mappa, derivata dai dati

Il quinto punto. Senza questo, la Mappa disegna l'icona scelta e la legenda continua a dichiarare che `leaf` significa «Mini-palma».

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue` (sezione «Tipologia» del `[data-test="legend-panel"]`)
- Test: `apps/web-staff/src/features/map/MapView.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// da aggiungere in apps/web-staff/src/features/map/MapView.spec.ts
it('la legenda nomina le tipologie del lido, non due etichette scritte a mano', async () => {
  server.use(http.get('/api/map', () => HttpResponse.json({
    date: '2026-06-27',
    umbrellaTypes: [{ id: 't1', name: 'Gazebo', sortOrder: 1, icon: 'anchor' }],
    timeSlots: [{ id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 }],
    sectors: [{ id: 's-c', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
      { id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'u1', label: '1', umbrellaTypeId: 't1', rowId: 'r1', stateBySlot: { 'f-mat': 'free' } },
      ] },
    ] }],
  })));
  const w = await mountMap();
  // ⚠️ La legenda e' chiusa di default E vive in un PORTAL su document.body: non e' discendente
  // del wrapper, quindi `w.get(...)` non la trova e il rosso che si otterrebbe sarebbe
  // «Unable to get [data-test=legend-panel]» — un fallimento che NON distingue la legenda scritta a
  // mano da quella derivata, e che resterebbe identico anche a lavoro finito.
  // Stessa lettura del test gemello gia' presente in questo file.
  await w.get('[data-test="legend-pill"]').trigger('click');
  await flushPromises();
  const legenda = document.body.querySelector('[data-test="legend-panel"]');
  expect(legenda?.textContent).toContain('Gazebo');
  expect(legenda?.textContent).not.toContain('Mini-palma');
  w.unmount();
});
```

`mountMap()` e `server.use(http.get('/api/map', …))` sono gli strumenti che il file già usa in tutti i suoi test: non scriverne di nuovi.

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm --filter @coralyn/web-staff exec vitest run src/features/map/MapView.spec.ts`
Expected: FAIL — la legenda contiene «Mini-palma» e non «Gazebo».

- [ ] **Step 3: Rendi la legenda derivata**

In `MapView.vue`, nella sezione «Tipologia» del pannello legenda, le due righe scritte a mano diventano un ciclo sulle tipologie della mappa:

```vue
                    <span v-for="t in (map?.umbrellaTypes ?? [])" :key="t.id" class="inline-flex items-center gap-1.5">
                      <Icon :name="t.icon ?? 'umbrella'" :size="13" class="text-[var(--color-accent)]" />{{ t.name }}
                    </span>
```

La riga «Normale» col pallino colorato **resta**: non è una tipologia, è l'assenza di tipologia.

⚠️ Adatta `map?.umbrellaTypes` al nome vero della variabile reattiva nel file — il componente ha già `typesById` costruito da lì: leggilo e riusa la stessa sorgente.

- [ ] **Step 4: Esegui e verifica che passi**

Run: `pnpm --filter @coralyn/web-staff exec vitest run src/features/map/MapView.spec.ts`
Expected: PASS, e **nessun test esistente cambia**. Le due asserzioni che nominano «Mini-palma» montano sulla fixture di default, le cui tipologie *sono* Mini-palma e Palma: la legenda derivata produce esattamente lo stesso testo di quella scritta a mano.

⚠️ Proprio per questo la suite esistente **non distingue** le due implementazioni: tutto il presidio di questo task poggia sul test nuovo, che usa una fixture con una tipologia diversa. Non cercare un rosso fra i test vecchi — non arriverà, e «aggiustare» un test verde sarebbe un danno.

- [ ] **Step 5: Rigira la suite intera**

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -u apps/web-staff
git commit -m "fix(web-staff): la legenda della mappa diceva a mano cio' che i dati sanno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: I documenti che diventerebbero falsi

**Files:**
- Create: `docs/architecture/decisions/0068-catalogo-icone-tipologia.md`
- Modify: `docs/architecture/README.md` (indice ADR, **senza presidio**: va aggiornato a mano — D-069)
- Modify: `docs/architecture/deferred.md` (voce D-040)
- Modify: `docs/architecture/decisions/0016-tipologia-ombrellone.md` (Addendum)
- Modify: `docs/design/data-model.md` (voce Tipologia)
- Modify: `packages/contracts/src/index.ts` (due commenti), `apps/api/prisma/schema.prisma` (un commento)

- [ ] **Step 1: Scrivi ADR-0068**

Deve registrare: la scelta del catalogo **nel bundle** invece che lazy, con **entrambi** i numeri (+19% sui byte totali, +69% sul JS che blocca il primo render) e il fatto che è una decisione dell'utente; l'esclusione delle `hidden`; il `v-html` sul body e perché non è una superficie d'iniezione; la rinomina delle due chiavi in ombra; il fallback visibile.

- [ ] **Step 2: Aggiorna i commenti che dichiarano il dominio dei valori**

I tre commenti «icon-registry key» — due in `packages/contracts/src/index.ts` e uno in `apps/api/prisma/schema.prisma` — non sono più veri: la chiave non viene da un registro di 41 voci. ⚠️ Toccare **solo il commento** dello schema: cambiarne altro rigenererebbe il client.

- [ ] **Step 3: Emenda ADR-0016 e data-model.md**

L'Addendum di ADR-0016 vincola il campo a «una chiave del registry icone del `ui-kit`»: dopo questo lavoro sarebbe falso restando in stato accettato. Aggiungi la nota di emendamento con il rimando ad ADR-0068, e il rimando inverso in ADR-0068. Stessa cosa per la voce Tipologia in `data-model.md`.

- [ ] **Step 4: Aggiorna D-040 — senza marcarla conclusa**

La voce traccia **due** duplicazioni: la lista chiavi icona (che questo lavoro elimina) e `SECTOR_KINDS` (che non si tocca). Scrivi **esattamente questo**. ⚠️ Non marcarla conclusa e non usare i marcatori di chiusura: `CLOSURE_MARKERS` di docs-lint è case-sensitive, e dichiarare conclusa a metà una voce è la classe di bugia documentale che questo repo ha già pagato.

- [ ] **Step 5: Aggiungi l'ADR all'indice, e i file nuovi a git PRIMA di linkarli**

Il gate dei link giudica su `git ls-files`: un link a un file non ancora aggiunto è rosso, **e vale anche per gli anchor**.

```bash
git add docs/architecture/decisions/0068-catalogo-icone-tipologia.md
```

- [ ] **Step 6: Verifica i gate**

Run: `pnpm --filter @coralyn/docs-lint test`
Expected: PASS, 68 test su 5 file.

⚠️ Un gate verde non è una review: **docs-lint non giudica la resa Markdown**. Se hai scritto tabelle, conta le celle a mano — Markdown taglia su ogni pipe, code span compresi, e i pipe vanno escapati come `\|`.

- [ ] **Step 7: Commit**

```bash
git add -u docs packages/contracts apps/api
git commit -m "docs: ADR-0068, e i documenti che il catalogo icone rende falsi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifica finale, prima di proporre il merge

- [ ] `pnpm -r --workspace-concurrency=1 test` — ⚠️ **una alla volta**: in parallelo questo host dà falsi rossi di massa. Attesa ~10 min. Non stampa un totale: cattura su file e leggi dopo, con `grep -a`, perché l'output può passare per binario.

  Atteso **1473 test su 198 file**, dalla baseline 1434/191 più:

  | Pacchetto | test nuovi | file nuovi |
  |---|---|---|
  | `ui-kit` | 28 — catalog 7, lucide-catalog 6, registry 2, IconPicker 7, Icon +6 | 4 |
  | `api` | 8 — is-icon-key 6, i due DTO 2 | 2 |
  | `web-staff` | 3 — BeachPanel.icon 2, MapView +1 | 1 |

  ⚠️ Se il totale non torna, **conta prima quale pacchetto sfora**: un numero che non torna qui è quasi sempre un test in più scritto per prudenza, non un difetto — ma va spiegato, non arrotondato.
- [ ] `pnpm --filter @coralyn/api test:e2e` — atteso 544/45, invariato. Richiede Docker su: `docker ps` **prima** di diagnosticare un rosso.
- [ ] `pnpm run lint` — atteso 0 errori.
- [ ] `pnpm run typecheck` — atteso 9 progetti.
- [ ] **Prova visiva del picker.** jsdom dà rettangoli a zero e non calcola la cascata: la griglia e l'anello di fuoco vanno guardati in un browser vero. Le pagine di web-staff sono dietro login, ma per misurare CSS basta una pagina autonoma servita da `node:http` e aperta con `preview_start({url})` — con dentro un caso a risposta nota.
- [ ] **Review avversariale** prima del merge: passaggi distinti in sequenza, quattro lenti per passaggio, **deduplicazione per `file:riga`**, un confutatore ostile per finding, verdetto a tre valori, e una review finale **d'insieme**. Chiedere il via all'utente: costa token.
