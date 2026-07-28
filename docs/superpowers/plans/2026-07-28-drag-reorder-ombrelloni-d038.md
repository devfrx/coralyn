# D-038 — Riordino dell'ombrellone per trascinamento — Implementation Plan

> **Spec:** [2026-07-28-drag-reorder-ombrelloni-d038-design.md](../specs/2026-07-28-drag-reorder-ombrelloni-d038-design.md)
> **Branch:** `feat/drag-reorder-ombrelloni-d038`
> **Baseline attesa su `main`:** `pnpm run test` → 1268/185 · `test:e2e` → 529/44 · lint 0 err /
> 87 warn · typecheck 9 progetti. **Se i numeri non tornano è l'ambiente, non il codice.**

---

## Global Constraints

**Ambiente**

- `pnpm --filter @coralyn/api exec prisma generate` **prima** di ogni typecheck. Sempre.
- Suite di pacchetti diversi **una alla volta**: in parallelo su questo host danno falsi rossi di
  massa (timeout di collection). e2e con `maxWorkers: 1`, calendario **congelato al 2026-07-15**.
- Dopo un build dei contracts, un dev server già avviato serve la copia vecchia (Vite pre-bundla
  `@coralyn/contracts`): serve `pnpm --filter @coralyn/web-staff dev --force`.
- ⚠️ **`packages/contracts/dist` è tracciato e oggi è già stantio rispetto al suo `src` su `main`**
  (`src/index.ts:69` dice «ADR-0063, Decision 7», il `dist` committato dice «§5.1»; entrambi da
  `b8b4550`). **Non risolverlo in questo branch** — è terreno di
  [D-068](../../architecture/deferred.md#d-068). Distinguere sempre col `git diff --numstat`:
  diff vuoto = rumore CRLF → `git checkout --`; diff reale = da valutare.
- ⚠️ **Mai `git add -A`**: guardare la lista dei file prima di ogni commit.

**Convenzioni non negoziabili**

- `@IsUUID` è **vietato** su `apps/api` (regola eslint): usare `@IsUuidShape()`.
- `ApiError` **sempre** da `@coralyn/data-layer`.
- `forTenant` vuole un `TenantId` brandizzato, non una `string`.
- ⚠️ Su `Button.vue` il `disabled` passato come fallthrough **vince** sul `:disabled` interno: ogni
  `:disabled` su un `Button` deve **ripetere** la condizione di `loading`, o riapre la finestra di
  doppio invio.
- ⚠️ In TanStack Query v5 `isLoading = isPending && isFetching`: con `enabled:false` il primo è
  **falso** e il secondo **vero**. Guardare quale usa il widget prima di concludere.
- Il gate dei link giudica su `git ls-files`: **`git add` di un file nuovo prima di linkarlo**.
- Il parser di `deferred-registry.ts` pretende indice ordinato per numero, anchor = ID, indice e
  voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al totale.
- Su template Vue usare `Edit`, non regex. Molti file sono **CRLF**.

**Numeri liberi:** ADR **0065** · deferred **D-070**.

---

## File Structure

```
packages/contracts/src/index.ts                                    (M) MoveUmbrellaInput
apps/api/src/establishment/dto/move-umbrella.dto.ts                (A)
apps/api/src/establishment/umbrella-order.ts                       (A) logica pura: intervallo e segno
apps/api/src/establishment/umbrella-order.spec.ts                  (A)
apps/api/src/establishment/umbrellas.service.ts                    (M) move() + disclosure su restore
apps/api/src/establishment/umbrellas.controller.ts                 (M) POST :id/move
apps/api/src/establishment/umbrellas.service.spec.ts               (M) guardie + permesso sul metodo
apps/api/test/helpers/seed-map.ts                                  (M) 2° settore + settore special
apps/api/test/establishment-umbrella-move.e2e-spec.ts              (A)
apps/web-staff/src/features/establishment/useEstablishmentStructure.ts  (M) useMoveUmbrella + dayMap
apps/web-staff/src/features/establishment/StructureRow.vue         (M) maniglia + drop target
apps/web-staff/src/features/establishment/EstablishmentStructureView.vue (M) orchestrazione + disclosure
apps/web-staff/src/features/establishment/umbrellaMove.ts           (A) logica pura: rect → indice
apps/web-staff/src/features/establishment/umbrellaMove.spec.ts      (A)
apps/web-staff/src/features/map/MapView.spec.ts                    (M) presidio «prima linea»
docs/architecture/decisions/0065-*.md                              (A)
docs/architecture/deferred.md                                      (M) D-038 chiusa, D-070 e D-071 aperte
docs/design/design-system.md                                       (M) §15 il gesto, e il limite lg+
```

⚠️ **Nessun componente nuovo per la disclosure.** `ConfirmDialog` di ui-kit espone uno `<slot />`
(`ConfirmDialog.vue:44`, con commento a `:40` che spiega che è lì per il contenuto libero): la
disclosure è quel primitivo con contenuto nello slot, come già fa ADR-0052 per il distruttivo.

```
```

---

## Task 1 — Il contratto

`packages/contracts/src/index.ts`: aggiungere

```ts
/** Sposta un ombrellone attivo. `position` = indice 0-based nella fila di destinazione. */
export interface MoveUmbrellaInput { rowId: string; position: number }
```

Nessun altro DTO cambia. `logicalOrder` continua a non attraversare il confine.

**Verifica:** `pnpm --filter @coralyn/contracts build && pnpm --filter @coralyn/contracts typecheck`.
Poi `git diff --numstat packages/contracts/dist` → il diff **sarà reale** (il simbolo è nuovo) e va
committato. ⚠️ Non confonderlo col rumore CRLF preesistente.

---

## Task 2 — L'endpoint e le sue guardie

**DTO** `move-umbrella.dto.ts`: `rowId` con `@IsUuidShape()`, `position` con `@IsInt() @Min(0)`.

**Service** `umbrellas.service.ts` — `move(id, input)` dentro **una sola** `forTenant`, guardie
nell'ordine della spec §4.3:

1. `findUnique` con `include: { row: { select: { sectorId: true, sector: { select: { kind: true } } } } }` → 404 se assente
2. `retiredAt != null` → **409** ⚠️ senza questa, il move **resuscita un ritirato**: nessuna query
   filtra `retiredAt`, l'esclusione dipende solo da `rowId = null`
3. fila di destinazione: `findFirst({ where: { id: input.rowId, establishmentId: tenantId } })` →
   404. ⚠️ **`establishmentId` esplicito**, non come `assertRow` che si affida alla sola RLS
4. `kind` destinazione ≠ `kind` origine → **422**
5. `position` fuori da `[0, n]` → **422**

Scrittura, **due istruzioni** (spec §2.2), con l'intervallo e il segno dipendenti dal caso
(stessa fila in avanti / stessa fila indietro / altra fila).

Il calcolo dell'intervallo va in **`umbrella-order.ts`, modulo suo**, non dentro il service.
⚠️ È la convenzione del repo, non una preferenza: la logica pura vive sempre accanto al service in
un file proprio — `pricing.engine.ts` accanto a `catalog.service.ts`, `mapDerive.ts` accanto a
`MapView.vue`, `structureSelection.ts` accanto ai componenti. Così è provabile senza DB né Nest.

**Controller**: `@Post(':id/move')` con `@RequiresPermission(Permission.StructureManage)`
**sul metodo** — ridondante col guard, deliberato (spec §4.2).

**Verifica — la mutazione nei due versi, dichiarando il runner:**

- togliere la guardia 2 → **rosso** l'e2e «un ritirato non è spostabile» (jest, `test:e2e`)
- invertire il segno dell'incremento → **rosso** l'unit sull'intervallo (jest, `test`)
- togliere `establishmentId` dalla guardia 3 → **rosso** l'e2e cross-tenant

---

## Task 3 — Le fixture che oggi non esistono

⚠️ **Bloccante, e va fatto prima dei test, non dopo.** Il database di sviluppo ha **1 solo settore
e nessuno `special`** (misurato: 2 lidi, 1 settore, 2 file, 199 ombrelloni attivi, 1 ritirato).
Lo spostamento fra settori — **il caso per cui questa slice esiste** — e il rifiuto `grid → special`
non hanno dati su cui girare.

Estendere `apps/api/test/helpers/seed-map.ts` con un **secondo settore `grid`** e un settore
**`special`**, ognuno con almeno una fila e due ombrelloni.

⚠️ `seed-map.ts` crea oggi l'ombrellone `'2'` **prima** di `'1'` apposta, per esercitare
l'ordinamento (`:45-51`), e `map.e2e-spec.ts:56` lo asserisce. **Non rompere quell'inversione**:
aggiungere, non riscrivere.

**Verifica:** `pnpm --filter @coralyn/api test:e2e` resta a **529/44** *prima* di aggiungere i test
nuovi. Se cala, le fixture hanno rotto qualcosa di esistente.

---

## Task 4 — I presìdi API

`apps/api/test/establishment-umbrella-move.e2e-spec.ts` — la tabella della spec §7.2:
dentro la fila (avanti/indietro), fra file dello stesso settore, **fra settori dello stesso
`kind`**, rifiuto `grid → special` (422), ritirato (409), fila di altro tenant (404), `position`
fuori intervallo (422).

⚠️ Le asserzioni sui **valori** di `logicalOrder` leggono Prisma direttamente: via HTTP si vede solo
la sequenza, indistinguibile fra `1,2,3` e `5,9,40` (spec §7.1).

In `umbrellas.service.spec.ts` — **accanto alle altre asserzioni sull'endpoint, non in un file
dedicato a una sola prova** — il presidio che il permesso sia dichiarato **sul metodo**.
⚠️ `authorization-coverage.spec.ts:56-57` legge `metodo ?? classe` e accetterebbe l'eredità: questo
presidio è l'unico che rende la scelta visibile.

**Verifica:** ogni test dichiara *quale* mutazione lo rende rosso, e la mutazione va **eseguita**.

---

## Task 5 — Il frontend: logica pura prima del gesto

`umbrellaMove.ts` — funzioni **pure**, nessun DOM:

- `targetIndex(rects: DOMRect[], pointerY: number, pointerX: number): number`
- `isCompatible(fromKind, toKind): boolean`

⚠️ **Questa separazione non è stile, è l'unico modo di provarlo.** L'ambiente di test è `jsdom`
(`vitest.config.ts:23`), `grep -rn "getBoundingClientRect" apps/web-staff/src packages/ui-kit/src`
→ **zero righe**, e non esiste alcun test di browser (nessun Playwright/Cypress in alcun
`package.json`). jsdom restituisce rettangoli a zero: la geometria si prova **solo** iniettando i
rect in una funzione pura.

⚠️ Il contenitore delle celle contiene **figli che non sono celle** — la ghost `+`
(`StructureRow.vue:49-50`) e il `<p>` «Nessun ombrellone» (`:51`): l'indice del figlio DOM **non è**
l'indice dell'ombrellone. La funzione riceve i rect delle sole celle, filtrati dal chiamante.

**Verifica:** `umbrellaMove.spec.ts` con rect iniettati, compresi i casi limite (fila vuota, drop
oltre l'ultima cella, `flex-wrap` su più righe).

---

## Task 6 — Il gesto

`StructureRow.vue`: **maniglia adiacente alla cella**, non dentro.

⚠️ `UmbrellaCell` è un `<button>` e **oltre 20 asserzioni** indicizzano
`[data-testid="scene-cell"] button` **per posizione** (`EstablishmentStructureView.spec.ts:83,315,
355,377,395,417,434-435,459-460,483-484,512-513,525-526,544-545,560-561`; `StructureScene.spec.ts:44,46`).
Un secondo `<button>` dentro la cella le arrossa tutte **senza che una logica sia rotta**.

Drag **disabilitato** quando `selectMode` è attivo (spec §5.2): `selectMode` si aggancia al primo
Maiusc+clic e da lì ogni clic è additivo — un drag degenerato in clic **toglie** dalla selezione.

⚠️ `selectMode` **non è oggi passato a `StructureRow`** (props: `row/sectorName/types/selection/canManage`):
va aggiunto.

**Verifica:** unit che monta con `selectMode: true` e prova che il gesto non parte.

---

## Task 7 — Il limite `lg+`, reso esplicito e provato

Nessun equivalente da tastiera: **escluso dallo scope su decisione esplicita** (spec §5.3-§5.4).
Sotto 1024px la struttura resta modificabile solo con i percorsi esistenti.

La conseguenza va **implementata**, non subita: la maniglia di trascinamento **non si rende** sotto
`lg` — un'affordance inerte dove il puntatore è morto è peggio della sua assenza. Il gating usa
`useMediaQuery` come già fa la vista per il `Drawer` (`EstablishmentStructureView.vue:35`).

⚠️ **Trappola dei test, da disinnescare qui e non scoprire dopo.** `useMediaQuery` ritorna `false`
quando `matchMedia` manca (`useMediaQuery.ts:6`), quindi **ogni spec dell'editor gira oggi nel ramo
Drawer** — cioè nel ramo in cui il gesto non esiste. Un test del drag scritto senza stub di
`matchMedia` **passerebbe senza esercitare nulla**: il verde direbbe solo che il codice non è
stato eseguito.

Aggiungere lo stub in `apps/web-staff/src/test/setup.ts` accanto a quelli già presenti
(`ResizeObserver`, pointer-capture, `scrollIntoView`), o localmente nei soli spec del drag.

**Verifica — la mutazione nei due versi:** con lo stub attivo la maniglia esiste e il gesto parte;
senza stub (cioè sotto `lg`) la maniglia **non è nel DOM**. Se il secondo test passa in entrambi i
casi, lo stub non sta funzionando e tutti gli altri test del drag sono finti.

---

## Task 8 — Invalidazione, anteprima e disclosure

`useEstablishmentStructure.ts`: `useMoveUmbrella` via `mutationResource`, e **`structureKeys` esteso
con `queryKeys.dayMap`**.

⚠️ Oggi `structureKeys` ha `establishmentStructure`, `establishmentOverview`, `setupStatus` e
**non** la mappa — ma `map.service.ts:22,25,26` ordina con gli stessi campi: senza, chi ha la Mappa
aperta al banco resta con la disposizione vecchia.

Anteprima ottimistica **nel componente**: `mutationResource` restituisce l'oggetto `useMutation`
intero (`useQueryResource.ts:31`), quindi `isPending`/`variables` sono già leggibili — **non**
serve toccare TanStack né `@coralyn/data-layer`.

La disclosure è un **`ConfirmDialog` con contenuto nello slot** (`ConfirmDialog.vue:44`), nessun
componente nuovo: mostrato **solo** quando la destinazione è in un settore diverso *e*
esiste almeno una tariffa con quel `sectorId`. ⚠️ Nel database attuale **zero tariffe posizionali**
(misurato): il test deve **crearne una** per esercitare il ramo, o passerà per la ragione sbagliata.

Estendere la stessa disclosure al **ripristino** in un settore diverso da `retiredFrom`.

---

## Task 9 — Il presidio sulla semantica dell'ordine

`MapView.spec.ts`: la prima fila resa porta «prima linea», le successive no.
`StructureScene.spec.ts`: la caption dichiara la relazione col mare.

⚠️ Sono l'**unica** dichiarazione nel prodotto che l'ordine porti un significato fisico
(`MapView.vue:400`, `StructureScene.vue:104`) e oggi hanno **zero** copertura
(`grep -rn "prima linea\|più in alto" apps/web-staff/src --include=*.spec.ts` → 0 righe). Entrano
qui perché è la slice che rende quell'ordine modificabile da un gesto.

---

## Task 10 — Documenti e chiusura

- **ADR-0065**: il drag come gesto di riordino; supera la clausola «niente drag&drop» di ADR-0052
  per il solo ombrellone; motiva disclosure-invece-di-blocco e maniglia-fuori-dalla-cella.
- **`deferred.md`**: D-038 → ✅ chiusa **per l'ombrellone** (file e settori restano); **D-070**
  aperta (dimensione «fila» del listino: esporla, chiudere la trappola dell'edit, o toglierla;
  più la coerenza `sectorId`/`rowId` non validata in `rates.service.ts:33-55`); **D-071** aperta
  (riordino sotto `lg`: il `Drawer` reka-ui azzera i pointer-events, quindi tablet e telefono
  restano scoperti — serve un canale che non dipenda dal puntatore).
  ⚠️ Rispettare il parser: indice ordinato, anchor = ID, stati coincidenti, riga dei conteggi.
- **Le 5 correzioni della spec §9**: ADR-0052 (drag + `@Roles` falso), ADR-0020 (teal/corallo,
  4 vs 5 stati, `OmbrelloneCell`), D-040 (descrive un file che non esiste più), `design-system.md`
  (due gate promessi e inesistenti). ⚠️ **Correggere il testo falso, non annotarlo sotto.**
- **`design-system.md` §15**: il gesto, la maniglia, e il **limite `lg+` dichiarato** — sotto quel
  breakpoint l'affordance non si rende (spec §5.3).
- **Indice ADR** in `docs/architecture/README.md` — ⚠️ è derivato quattro volte di fila
  ([D-069](../../architecture/deferred.md#d-069)): aggiungere 0065.

---

## Verifica finale

```bash
pnpm --filter @coralyn/api exec prisma generate
pnpm run typecheck        # 9 progetti
pnpm run lint             # 0 errori
pnpm run test             # 1268 + i nuovi
pnpm --filter @coralyn/api test:e2e   # 529 + i nuovi
```

**Poi, e non prima:**

1. **Review avversariale** — 5 lenti + 2 scettici per finding. Ha pagato **4 volte su 4**, compresa
   quella *sui fix*. ⏱️ ~20 minuti. ⚠️ **Leggere le refutazioni, non solo i verdetti.**
2. **Prova visiva** — le pagine di `web-staff` sono dietro login e l'agente **non può autenticarsi**:
   chiedere all'utente di entrare nella Browser pane. Due schermi, non uno: **`lg+`**, dove il gesto
   deve funzionare, e **sotto `lg`**, dove la maniglia deve essere **assente** (spec §5.3).
3. **Nessun merge su `main` senza ok esplicito.** Ma non lasciare nulla solo in locale: spingere il
   branch **non** è un merge.
