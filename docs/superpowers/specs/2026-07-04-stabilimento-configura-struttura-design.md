# Spec — Stabilimento: `Configura` struttura (editor logico settori/file/ombrelloni/tipologie) · 2026-07-04

> Design approvato in brainstorming (2026-07-04, delega dopo giustificazione). Attiva la terza e ultima affordance
> "in arrivo" dello Stabilimento: **`Configura`** → la vista **«Struttura della spiaggia»** (setup guidato). È l'editor
> **logico** (opzione B: Settore → Fila → Ombrellone + Tipologie), **additivo** sul modello dati esistente. L'editor a
> **coordinate libere/pixel su foto** (opzione C) resta **D-005**, fuori. Workflow ADR-0009: spec → `writing-plans` →
> esecuzione subagent-driven, un commit per layer, TDD, review a due stadi, verifica LIVE.

## 1. Obiettivo
Dalla pagina **Stabilimento**, il bottone **`Configura`** (oggi disabilitato, "in arrivo") apre la vista **«Struttura
della spiaggia»**: un editor che permette all'**admin** di costruire e mantenere la struttura del lido — **settori**,
**file**, **ombrelloni** (con **numerazione automatica**) e **tipologie** — riflettendosi automaticamente sulla Mappa
(che proietta lo stesso modello). Il modello dati (`Sector`/`Row`/`Umbrella`/`UmbrellaType`, con `sortOrder` e
`Umbrella.presentationPosition` JSON) esiste già ed è consumato dalla Mappa in sola lettura: questa spec aggiunge le
**scritture** e la **vista di configurazione**, senza toccare la proiezione mappa.

## 2. Decisioni risolte (brainstorming 2026-07-04)
- **Scope = editor logico completo** come nel mockup (`Struttura della spiaggia`), niente più, niente meno. Scartate:
  "solo un pezzo" (pigra: lascia la card struttura non funzionale) e "editor pixel" (reckless: è D-005, progetto a sé).
- **Tutto admin-only**: sia il gating del bottone «Configura» sia gli endpoint di scrittura (`@Roles(Role.Admin)`,
  riuso **ADR-0039**). Lo staff non entra nell'editor (ha la Mappa per l'operativo). La lettura dell'albero è admin-only.
- **Guardie di cancellazione = block-409** (identiche alla convenzione del Listino, `catalog.service`): niente cascade
  distruttivi, niente orfani, preserva integrità/audit. Dettaglio in §5.
- **`Sector.kind` (`grid`|`special`)**: **nuova colonna** (migrazione additiva, default `grid`). Il mockup distingue
  «Griglia»/«Speciali»; non persisterla = debito. Hint semantico/presentazione leggero (Speciali = fuori griglia).
- **Numerazione automatica** (generatore): crea etichette `prefisso + n` per n∈[da, da+quantità); **salta le etichette
  già esistenti** (append; buchi ammessi; nessun duplicato) e riporta "creati X · saltati Y".
- **Etichetta ombrellone**: unica per stabilimento (`@@unique([establishmentId, label])` già a schema → **409** su
  collisione in create/update/generate). Buchi di numerazione ammessi.
- **Tipologia in uso**: eliminarla è **bloccata (409)** finché è assegnata a qualche ombrellone (l'admin riassegna prima,
  via «Modifica ombrellone»). Scartato "riassegna-a-Normale automatico" (mutazione bulk silenziosa). `Normale` **non è
  una riga**: è `umbrellaTypeId = null` (default), non creabile/eliminabile.
- **Riordino (`sortOrder`)**: v1 = **ordine di creazione** (`sortOrder` progressivo auto-assegnato in coda). Il
  **drag-reorder** esplicito è **deferito e tracciato** come nuovo **D-038** (la colonna `sortOrder` esiste → additivo).
- **Nuovo ADR** per il design dell'editor struttura (prox libero **0040**). **D-005** resta per l'editor pixel.

## 3. Modello dati
**Esistente** (invariato salvo `kind`):
- `UmbrellaType { id, establishmentId, name, sortOrder, icon? }` — `icon` = chiave icon-registry (ADR-0020).
- `Sector { id, establishmentId, name, sortOrder }` **+ NUOVO `kind SectorKind @default(grid)`**.
- `Row { id, establishmentId, sectorId, label, sortOrder }`.
- `Umbrella { id, establishmentId, rowId, umbrellaTypeId?, label, logicalOrder, presentationPosition? }` —
  `@@unique([establishmentId, label])`. `presentationPosition` (JSON, layer pixel D-005) **resta inutilizzato**.

**Migrazione additiva** `add_sector_kind`:
```prisma
enum SectorKind {
  grid    // file regolari, impilate verso il mare
  special // ombrelloni fuori griglia (es. palme)
}
model Sector {
  // ...campi esistenti...
  kind SectorKind @default(grid)
}
```
`Sector`/`Row`/`Umbrella`/`UmbrellaType` sono già **RLS FORCE** (tabelle mappa): tutte le scritture passano da
`prisma.forTenant(tenantId, tx => …)`; `TenantContext.require()` dà il tenant. `Rate` referenzia `sectorId`/`rowId`
(firma pricing) e `Booking` referenzia `umbrellaId`: sono le FK che le guardie di cancellazione proteggono.

## 4. Contratti (`@coralyn/contracts`, additivo)
DTO **struttura** (leggeri, senza lo `stateBySlot` della mappa; riusano `UmbrellaTypeDTO`):
```ts
export type SectorKind = 'grid' | 'special';

export interface StructureUmbrellaDTO { id: string; label: string; umbrellaTypeId: string | null; }
export interface StructureRowDTO { id: string; label: string; sortOrder: number; umbrellas: StructureUmbrellaDTO[]; }
export interface StructureSectorDTO { id: string; name: string; sortOrder: number; kind: SectorKind; rows: StructureRowDTO[]; }
/** Albero completo della struttura (GET /api/establishment/structure, admin-only). */
export interface EstablishmentStructureDTO {
  sectors: StructureSectorDTO[];          // ordinati per sortOrder
  umbrellaTypes: UmbrellaTypeDTO[];        // ordinati per sortOrder; "Normale" (null) non è in lista
}

// Tipologie
export interface CreateUmbrellaTypeInput { name: string; icon: string; }        // icon = chiave registry
export interface UpdateUmbrellaTypeInput { name?: string; icon?: string; }
// Settori
export interface CreateSectorInput { name: string; kind: SectorKind; }
export interface UpdateSectorInput { name?: string; kind?: SectorKind; }
// File
export interface CreateRowInput { sectorId: string; label: string; }
export interface UpdateRowInput { label?: string; }
// Ombrelloni (singolo)
export interface CreateUmbrellaInput { rowId: string; label: string; umbrellaTypeId: string | null; }
export interface UpdateUmbrellaInput { label?: string; umbrellaTypeId?: string | null; }
// Generatore (Nuova fila / Genera): numerazione automatica in una fila
export interface GenerateUmbrellasInput {
  rowId: string;
  prefix: string;               // '' = solo numero
  start: number;                // "Da numero"
  count: number;                // "Quantità"
  umbrellaTypeId: string | null; // tipologia predefinita del batch
}
export interface GenerateUmbrellasResultDTO { created: number; skipped: number; umbrellas: StructureUmbrellaDTO[]; }
```

## 5. Backend
Nuovo modulo `establishment-structure` (o metodi/controller sotto `establishment/`), tutto **`@Roles(Role.Admin)`**,
tenant-scoped via `forTenant`. Convenzioni CRUD identiche a `catalog` (`@Get/@Post/@Patch(':id')/@Delete(':id')`, un
controller+service per entità; validazione class-validator; `ConflictException`→409, `NotFoundException`→404,
`ValidationPipe`→400).

### 5.1 Lettura
- **`GET /api/establishment/structure`** → `EstablishmentStructureDTO` (albero settori→file→ombrelloni ordinato per
  `sortOrder`/`logicalOrder` + tipologie ordinate). Proiezione pura tenant-scoped (nessun booking-state).

### 5.2 Tipologie — `/api/establishment/umbrella-types`
- `POST` `CreateUmbrellaTypeInput` → `UmbrellaTypeDTO`. `name` non vuoto (`@MaxLength`), `icon @IsIn` alle chiavi del
  registry ammesse (es. `umbrella`/`leaf`/`palm`). **Nome unico per stabilimento** → 409. `sortOrder` = append.
- `PATCH /:id` `UpdateUmbrellaTypeInput` → `UmbrellaTypeDTO` (rename/cambio icona; unicità nome → 409).
- `DELETE /:id` → `UmbrellaTypeDTO`. **409 se `umbrella.count({ umbrellaTypeId: id }) > 0`** ("Tipologia in uso da
  ombrelloni: riassegnali prima di eliminarla.").

### 5.3 Settori — `/api/establishment/sectors`
- `POST` `CreateSectorInput` → `StructureSectorDTO`. `name` non vuoto; `kind @IsIn(['grid','special'])`; **nome unico
  per stabilimento** → 409 (coerente con tipologie/fasce). `sortOrder` = append.
- `PATCH /:id` `UpdateSectorInput` → rename/cambio kind.
- `DELETE /:id` → **409 se ha file (`row.count`) o è referenziato da tariffe (`rate.count({ sectorId: id })`)**
  ("Settore non vuoto o in uso da tariffe: svuotalo/rimuovi le tariffe prima.").

### 5.4 File — `/api/establishment/rows`
- `POST` `CreateRowInput` → `StructureRowDTO`. `sectorId` deve appartenere al tenant (404 altrimenti); `label` non vuoto.
  `sortOrder` = append **nel settore**. (Il mockup «Nuova fila» genera anche gli ombrelloni: nel FE è create-fila +
  generate in sequenza — vedi §6; il backend resta a due operazioni atomiche distinte.)
- `PATCH /:id` `UpdateRowInput` → rename.
- `DELETE /:id` → **409 se ha ombrelloni (`umbrella.count`) o è referenziata da tariffe (`rate.count({ rowId: id })`)**.

### 5.5 Ombrelloni — `/api/establishment/umbrellas`
- `POST` `CreateUmbrellaInput` → `StructureUmbrellaDTO`. `rowId` del tenant (404); `label` non vuoto, **unico per
  stabilimento** (`@@unique` → 409); `umbrellaTypeId` null o tipologia del tenant (422 se estranea). `logicalOrder` =
  append nella fila.
- `PATCH /:id` `UpdateUmbrellaInput` → cambia label (unicità → 409) e/o tipologia (validata).
- `DELETE /:id` → **409 se `booking.count({ umbrellaId: id }) > 0`** ("Ombrellone con prenotazioni: non eliminabile.").
- **`POST /api/establishment/umbrellas/generate`** `GenerateUmbrellasInput` → `GenerateUmbrellasResultDTO`. Per n∈[start,
  start+count): etichetta `prefix + n`; **salta** quelle già esistenti nel tenant (query unica delle label esistenti),
  crea le nuove in un'unica transazione con `logicalOrder` progressivo, ritorna `{ created, skipped, umbrellas }`.
  Limiti: `count` 1..60 (`@Min/@Max`), `start ≥ 0`. `rowId` del tenant (404); `umbrellaTypeId` validato.

## 6. Frontend
Nuova rotta/vista `EstablishmentStructureView` (raggiunta da `EstablishmentView` → «Configura», admin-only; back
"‹ Stabilimento"). Layout fedele al mockup:
- **Header** "Struttura della spiaggia" + banner "setup guidato" + 4 contatori (settori/file/ombrelloni/tipologie).
- **Colonna sinistra**: card **Settori** (lista selezionabile, «+ Nuovo») + card **Tipologie** (lista, «+ Nuova»).
- **Colonna destra**: settore selezionato → sue **file**, ognuna coi suoi **ombrelloni-chip** cliccabili +
  «Genera» + «+ Aggiungi»; header settore con «+ Nuova fila».

**5 modali** (ui-kit `Modal`/`Field`/`Input`/`Select`/`Button`):
1. **Nuovo settore** — Nome + Disposizione (Griglia/Speciali) → `POST /sectors`.
2. **Nuova/Modifica tipologia** — Nome + Icona (Ombrellone/Paglia/Palma) + nota "classifica, non fissa il prezzo" →
   `POST`/`PATCH /umbrella-types`. (Elimina con conferma → `DELETE`, toast 409 se in uso.)
3. **Nuova fila** — Etichetta + Prefisso/Da numero/Quantità + Tipologia default + **anteprima numerazione live** →
   `POST /rows` poi `POST /umbrellas/generate` (in sequenza; l'anteprima è calcolata FE).
4. **Genera ombrelloni** (su fila esistente) — Prefisso/Da numero/Quantità + Tipologia (pre-riempita col default della
   fila) + anteprima → `POST /umbrellas/generate`. Toast "creati X · saltati Y".
5. **Nuovo/Modifica ombrellone** — Etichetta ("codice fisico reale, unico, buchi ammessi") + Tipologia + **Elimina**
   (se esistente) → `POST`/`PATCH`/`DELETE /umbrellas`. Toast 409 (label duplicata / prenotazioni).

**Data-layer**: `useEstablishmentStructure` (query dell'albero) + mutation `mutationResource` per ogni azione, tutte
**invalidano** la query struttura (e, dove sensato, l'overview per i contatori). Errori 409/422/404 → toast del server
(default `mutationResource`). **Gating**: `session.role === Role.Admin`; per lo staff «Configura» resta "in arrivo" e la
rotta struttura è protetta (redirect/404 lato guard-route).

## 7. Decomposizione in slice (ognuno: contracts → api → web-staff, un commit per layer)
- **Slice 1 — Struttura (lettura) + Tipologie**: migrazione `Sector.kind`; contratti DTO struttura + tipologie;
  `GET /structure` + CRUD `/umbrella-types` (con guardia 409); `EstablishmentStructureView` che rende l'albero
  (read-only per settori/file/ombrelloni) + card Tipologie funzionante (crea/modifica/elimina) + gating + rotta.
- **Slice 2 — Settori + File**: CRUD `/sectors` e `/rows` (guardie 409); modali «Nuovo settore»/«Nuova fila»
  (create-fila; la generazione arriva nello Slice 3) + rename/elimina; il pannello destro diventa editabile.
- **Slice 3 — Ombrelloni + Genera**: CRUD `/umbrellas` + `/umbrellas/generate`; modali «Nuovo/Modifica ombrellone» e
  «Genera»; «Nuova fila» compone create-fila + generate.

**Oggi**: questa spec (tutti gli slice) + `writing-plans` per lo **Slice 1**, poi stop.

## 8. Fuori scope / deferiti (tracciati, non tagliati in silenzio)
- **Editor a coordinate libere/pixel** (drag&drop su foto/planimetria, uso di `presentationPosition`) = **D-005**.
- **Drag-reorder** di settori/file/ombrelloni = **D-038** (nuovo); v1 usa `sortOrder` = ordine di creazione.
- **Spostare una fila tra settori** / **spostare un ombrellone tra file** (re-parent) — fuori v1 (elimina+ricrea, o D-038).
- **Import/export** massivo della struttura, duplicazione settore — YAGNI.

## 9. Sequencing / DoD
- Ordine: **Slice 1 → 2 → 3**, ognuno con presentazione + conferma + verifica LIVE prima del successivo.
- **Baseline da non regredire** (post-Stabilimento Fase 2): ui-kit 70 · web-staff 191 · api unit 134 · api e2e 182 ·
  typecheck pulito. Lo Slice 1 **aggiunge una migrazione** (`Sector.kind`).
- Ogni slice: contratti buildati; unit (service: guardie/generatore) + e2e (matrice 401/403/400/404/409) verdi; FE
  test (MSW) verdi; verifica LIVE (Docker `--build api web`) delle azioni; 0 errori console. `@RolesGuard` è globale →
  ri-eseguire tutta la suite api. Merge su `main` = FF con ok esplicito.
