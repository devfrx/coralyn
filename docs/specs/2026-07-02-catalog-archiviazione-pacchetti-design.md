# Consolidamento Catalogo — Slice "Archiviazione pacchetti" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02. **Da pianificare ed
  eseguire** (ADR-0009).
- **Origine:** emerso testando dal vivo lo slice "Chiarezza tipi prenotazione". Provando a eliminare un pacchetto usato
  da prenotazioni si riceve `409` («Pacchetto in uso da tariffe o prenotazioni: non eliminabile»). Ma le prenotazioni
  sono record storici (si **annullano**, non si eliminano) → un pacchetto usato anche una sola volta diventa
  **non-eliminabile per sempre** (vicolo cieco). Manca un modo corretto di **ritirare** un pacchetto dalla circolazione.
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio
  prenotazioni/pricing), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow). **Nessun
  nuovo ADR** (incremento sul dominio `Package`).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (post-"Chiarezza tipi" su `main`,
  verificata live 2026-07-02): **api unit 89 · api e2e 126 · web-staff 145 · ui-kit 55.**
- **Richiede una MIGRAZIONE** additiva (colonna `Package.archivedAt` nullable — nessun backfill, zero rischio dati).
  Prossimo ADR libero: **0035**. Prossimo D libero: **D-035**.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **`Package`** (`schema.prisma:203-213`): `id, establishmentId, name, equipment(JsonB), establishment, bookings[],
  rates[]`, `@@index([establishmentId])`. Nessun concetto di stato/ciclo di vita.
- **`deletePackage`** (`catalog.service.ts:177-194`): guardia pre-delete nella stessa transazione — conta `rate` +
  `booking` che referenziano il pacchetto (su TUTTE le stagioni del tenant) e lancia **409** se `> 0`. Serve perché le FK
  `Rate.packageId`/`Booking.packageId` sono `ON DELETE SET NULL`: senza guardia la delete azzererebbe silenziosamente il
  `packageId` su tariffe (prezzo server-autoritativo alterato) e prenotazioni storiche.
- **`listPackages`** (`catalog.service.ts:67-71`): ritorna **tutti** i pacchetti del tenant. Alimenta **tre** consumatori
  via l'unico `usePackages()` (`apps/web-staff/src/features/bookings/usePackages.ts`): le **card** dell'editor Listino,
  le `packageOptions` dell'**editor tariffe** (`PricingView.vue`), e il selettore **"Pacchetto"** del **modale
  prenotazione** (`MapView.vue`).
- **UX confondente:** la card mostra "N tariffe collegate" (conta **solo le rate**, e solo della stagione attiva —
  `rateCount` in `PricingView.vue`), non le prenotazioni. Un pacchetto con 0 rate ma con prenotazioni mostra "0" e poi dà
  409: sorpresa.
- **Rotte** (`packages.controller.ts`): `GET /packages`, `POST /packages`, `PATCH /packages/:id`, `DELETE /packages/:id`.
- **`PackageDTO`** (`contracts/src/index.ts:119-123`): `{ id, name, equipment }`. `toPackageDTO`
  (`package.projection.ts`) proietta da `Package`.

## 2. Obiettivo e scope

Introdurre un **ciclo di vita** del pacchetto: **archiviazione** (soft-delete) come azione primaria e reversibile, con
**eliminazione fisica** esplicita e separata, possibile **solo** su un pacchetto già archiviato e senza riferimenti.

**Modello scelto (opzione C, "professionale, senza debiti"):**
- **Archivia** — ritira il pacchetto dalla circolazione: sparisce dai selettori di prenotazione/tariffa, ma **resta nel
  DB e resta risolvibile per nome** sullo storico (prenotazioni/tariffe esistenti invariate). Reversibile (**Ripristina**).
- **Elimina definitivamente** — hard-delete reale, disponibile **solo se** il pacchetto è **archiviato** ed è a **0
  riferimenti** (0 rate, 0 booking). Flusso deliberato in due passi (archivia → elimina): nessuna cancellazione
  accidentale, ma i pacchetti-errore/test si possono davvero ripulire.

**Fuori scope (deliberato, YAGNI):**
- Il contatore "N tariffe collegate" della card resta com'è: con l'archiviazione il 409-sorpresa non capita più (si
  archivia, non si elimina), quindi non lo tocco.
- Nessun cambiamento a equipment (→ Slice C), tipi/pricing, o al ciclo di vita di rate/booking.

## 3. Layer 1 — Backend

### 3.1 Migrazione (Prisma)
- **Schema** (`schema.prisma`, `model Package`): aggiungi `archivedAt DateTime?` (nullable; `null` = attivo). Timestamp
  semplice coerente con la convenzione del repo (`createdAt DateTime @default(now())`; `@db.Date` è riservato alle date di
  calendario). Nessun indice necessario (i filtri sono per-tenant su liste piccole).
- Workflow `--create-only` (come gli slice precedenti): genera, **rimuovi lo spurio** `DROP INDEX "Rate_signature_key";`
  dal `migration.sql` (indice raw, non drift), poi `migrate dev` (dev) e `migrate deploy` (coralyn_test). `DATABASE_URL`
  esplicito (dev da `.env`, test da `.env.test`; Prisma non auto-carica il root `.env` sotto `--filter`).

### 3.2 Contratti (`contracts/src/index.ts`)
- `PackageDTO` acquista `archived?: boolean` (presente/`true` solo quando archiviato; assente = attivo — ripple minimo
  sui literal esistenti). `CreatePackageInput`/`UpdatePackageInput` **invariati** (l'archiviazione non passa da lì).

### 3.3 Proiezione (`package.projection.ts`)
- `toPackageDTO`: aggiungi `archived: p.archivedAt != null ? true : undefined` (omesso quando attivo).
- Aggiorna `package.projection.spec.ts`.

### 3.4 Service (`catalog.service.ts`)
- `listPackages(includeArchived = false)`: `where` = `includeArchived ? {} : { archivedAt: null }` dentro `forTenant`.
- `archivePackage(id)`: dentro `forTenant`, `findFirst` (404 se assente/cross-tenant); set `archivedAt = new Date()`
  (idempotente: se già archiviato, no-op che ritorna il DTO). Ritorna `PackageDTO`.
- `restorePackage(id)`: idem, set `archivedAt = null`. Ritorna `PackageDTO`.
- `deletePackage(id)` **rafforzato**: 404 se assente; **409 se `archivedAt == null`** («Archivia il pacchetto prima di
  eliminarlo definitivamente.»); poi la guardia riferimenti esistente (409 se rate/booking `> 0`); infine delete. La
  guardia riferimenti resta la rete di sicurezza anche a fronte di un client che salti lo stato archiviato.

### 3.5 Controller (`packages.controller.ts`)
- `GET /packages` accetta `@Query('includeArchived')` (stringa `'true'` → boolean) e la passa a `listPackages`.
- Nuove rotte azione (stile `renew`/`payment`): `POST /packages/:id/archive` → `archivePackage`; `POST
  /packages/:id/restore` → `restorePackage`. `DELETE /packages/:id` invariato come firma (semantica rafforzata nel service).

### 3.6 e2e (`packages.e2e-spec.ts`)
- archive → 200 + `archived: true`; il pacchetto archiviato **non** compare in `GET /packages` (default) ma **sì** in
  `GET /packages?includeArchived=true`.
- restore → 200 + torna attivo (assente `archived`), ricompare nel default.
- delete su pacchetto **non archiviato** → **409**; delete su pacchetto **archiviato ma referenziato** → **409**; delete
  su pacchetto **archiviato e 0 riferimenti** → **200** (sparisce del tutto).
- isolamento tenant su archive/restore/delete (404 cross-tenant), invariato.

## 4. Layer 2 — Frontend editor (`PricingView.vue` + `usePackages.ts`)

- **Hook** (`usePackages.ts`): `usePackages()` resta **solo attivi** (`/packages`) — lo usano modale prenotazione ed
  editor tariffe, che così escludono gli archiviati **senza modifiche**. Aggiungi `usePackages({ includeArchived: true })`
  (o un `useAllPackages()`) per le card editor. Aggiungi `useArchivePackage()` / `useRestorePackage()` (POST
  `/packages/:id/archive|restore`), e `useDeletePackage()` resta (DELETE) — tutti invalidano `queryKeys.packages`.
- **Card attive:** il cestino della card diventa **"Archivia"** (icona archivio) → `archive`, **senza ConfirmDialog** (è
  reversibile, basso rischio).
- **Sezione "Archiviati (N)"** a scomparsa, **chiusa di default**, sotto le card attive: card **grigie/attenuate** con
  **"Ripristina"** (restore) ed **"Elimina definitivamente"** (delete) — quest'ultimo dietro **ConfirmDialog** (tono
  danger, irreversibile). La sezione compare solo se `N > 0`.
- **`packageOptions`** dell'editor tariffe: derivate dai **soli attivi** (filtra `!p.archived`, o usa la lista attiva).
- **Test (`PricingView.spec.ts`):** la card attiva mostra "Archivia" (non "Elimina"); dopo archive il pacchetto si sposta
  nella sezione "Archiviati" (che va aperta); "Ripristina" lo riporta attivo; "Elimina definitivamente" apre il
  ConfirmDialog e chiama la DELETE; `packageOptions` dell'editor tariffe non elenca gli archiviati.

## 5. Rischi e mitigazioni
- **Ripple `PackageDTO`:** `archived?` opzionale → i literal esistenti (mock/test) restano validi senza modifiche. Dopo il
  tocco a `@coralyn/contracts`: `pnpm --filter @coralyn/contracts build` + `rm -rf apps/web-staff/node_modules/.vite`.
- **Selettori che leakano archiviati:** mitigato dal default `GET /packages` = solo attivi (safe-by-default); solo l'editor
  card opta per `includeArchived=true`.
- **Migrazione:** additiva nullable, nessun impatto su dati/firme. Rimuovi lo spurio `DROP INDEX`. Rebuild container prima
  del test dev (gotcha handoff: `docker compose --profile full up -d --build api web`).
- **Prezzo/rate storici invariati:** archiviare un pacchetto **non** tocca rate/booking esistenti (l'engine risolve
  comunque); si impedisce solo la **nuova** selezione. Un pacchetto con rate attive si può archiviare: le sue rate
  continuano a funzionare, ma non se ne creano di nuove su di esso.

## 6. Decisioni (risolte in brainstorming 2026-07-02)
1. **Modello C:** archiviazione (soft-delete) primaria e reversibile; **Elimina definitivamente** separato ed esplicito,
   solo se archiviato **e** 0 riferimenti. (Scartate: solo-archiviazione senza hard-delete; ibrido delete/archivia sullo
   stesso bottone.)
2. **`archivedAt DateTime?`** (non un boolean): registra *quando* (audit), convenzione soft-delete standard.
3. **Hard-delete richiede prima l'archiviazione** (backend enforce 409 se `archivedAt == null`): flusso deliberato in due
   passi, niente cancellazioni accidentali.
4. **UX:** archivia **senza** conferma (reversibile); elimina definitivamente **con** ConfirmDialog (irreversibile).
5. **Archiviati nell'editor:** sezione **"Archiviati (N)" a scomparsa**, chiusa di default.
6. **`GET /packages` default = solo attivi**; editor card opta con `?includeArchived=true`.
7. **Migrazione sì, nuovo ADR no.** Contatore card "N tariffe collegate" fuori scope.

## 7. Impatto test (atteso, da non regredire)
Baseline: api unit 89 · api e2e 126 · web-staff 145 · ui-kit 55. Attesi additivi: e2e packages (archive/restore/delete-guard
+ default-esclude-archiviati); FE editor (sezione archiviati, azioni, packageOptions solo attivi); projection spec
(`archived`). Nessun test rimosso senza sostituto.

## 8. Slice successivo (dopo questo)
**Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment`. Confina con questo slice
(entrambi toccano `Package`). Brainstorming+spec dedicati.
