# Handoff / Delega — Slice "Archiviazione pacchetti" + roadmap Catalogo

> Documento di consegna per la **prossima sessione**. Lo slice **"Chiarezza tipi prenotazione"** è **COMPLETO, MERGIATO
> su `main` e PUSHATO**. La spec del **prossimo slice "Archiviazione pacchetti"** è **già scritta e committata**
> (decisioni risolte con l'utente). La prossima sessione **scrive il piano TDD ed esegue** quello slice, poi prosegue con
> **Slice C "Equipment personalizzato"** (brainstorming+spec prima).
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design →
> RISOLVI le decisioni aperte con l'utente → **piano TDD** → implementa **subagent-driven, un commit per layer,
> test-first, da un NUOVO branch da `main`**.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi**: la spec dello slice
> [`docs/specs/2026-07-02-catalog-archiviazione-pacchetti-design.md`](../specs/2026-07-02-catalog-archiviazione-pacchetti-design.md)
> (modello §2, layer BE §3, layer FE §4, decisioni §6, migrazione §3.1), poi
> [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio) e
> [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date/UTC). Contesto pricing:
> [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (le rate referenziano i pacchetti; archiviare
> NON tocca rate/booking esistenti).

---

## 0. Situazione GIT
- **`main` = `origin/main`** con, in ordine più recente: lo slice "Chiarezza tipi prenotazione" (4 commit,
  `00a829f`→`cefdaef`) e la **spec "Archiviazione pacchetti"** (`1f9b0f2`) + **questo handoff**. **All'avvio fai il sync
  standard §8 e fidati di `git log`, non di uno SHA scritto qui.**
- **Niente branch pendenti** (`catalog-chiarezza-tipi-prenotazione` eliminato dopo il merge FF). **Nessuna migrazione
  pendente** (`prisma migrate status` pulito su `coralyn_dev` e `coralyn_test`). Prossimo ADR libero: **0035**. Prossimo D
  libero: **D-035**.

## 1. Stato attuale (post "Chiarezza tipi", MERGIATO)
- **Baseline test da NON regredire (verificata live 2026-07-02):** **api unit 89 · api e2e 126 · web-staff 145 (globa
  ui-kit) · ui-kit standalone 55.** Typecheck web-staff + ui-kit puliti.
- **"Chiarezza tipi prenotazione"** (merged FF `cefdaef`): il calcolo del prezzo si **deriva dal booking `type`** e non
  più da `Rate.unit`, **rimosso** con migrazione (`20260702191024_drop_rate_unit`: drop colonna + enum `RateUnit`; firma
  unique raw `Rate_signature_key` non toccata). Regola: `daily`→`price×1`, `periodic`→`price×giorni`,
  `subscription`→`price` forfait (`pricing.engine.ts`: `ctx.type === 'subscription' ? price : price*days`). `unit` tolto
  da contratti/DTO/proiezioni/service/seed + tutte le e2e; FE editor `priceHint(r)` (subscription→"forfait/stagione",
  else "/giorno"); FE `MapView` `matchedRateLabel` suffisso dal tipo corrente (" forfait stagione"/"/g") + `TYPE_HELP`
  inline. Whole-branch review opus = 0 Critical/Important; verificato live (quote: daily 28, periodic 15→17 = 84,
  subscription 800 forfait). Sub-decisione §7.4 (avviso "manca Abbonamento") = NO.

## 2. LO SLICE — "Archiviazione pacchetti" (GIÀ PROGETTATO)
Spec approvata: **[docs/specs/2026-07-02-catalog-archiviazione-pacchetti-design.md](../specs/2026-07-02-catalog-archiviazione-pacchetti-design.md)**.
Decisioni **già risolte con l'utente** (spec §6). Resta da: **piano TDD** + esecuzione subagent-driven, un commit per
layer, da un **nuovo branch** da `main`.

**Problema (emerso testando dal vivo):** `deletePackage` dà 409 se il pacchetto è referenziato da QUALSIASI rate/booking
(FK `ON DELETE SET NULL`), ma le prenotazioni sono record storici (si annullano, non si eliminano) → un pacchetto usato
anche una sola volta è **non-eliminabile per sempre**. **Soluzione (modello C, deciso):** archiviazione (soft-delete)
primaria e reversibile + **Elimina definitivamente** esplicito, solo se archiviato **e** 0 riferimenti.

Due layer (dettagli nella spec):
1. **Backend:** migrazione `Package.archivedAt DateTime?` (nullable); `PackageDTO.archived?: boolean`; `listPackages`
   default = solo attivi (`?includeArchived=true` per l'editor); rotte `POST /packages/:id/archive|restore`;
   `deletePackage` rafforzato (409 se `archivedAt == null` o se referenziato; 200 solo se archiviato+0rif); e2e.
2. **FE editor:** card attiva → "Archivia" (no conferma); sezione **"Archiviati (N)" a scomparsa** (chiusa di default) con
   Ripristina + Elimina definitivamente (ConfirmDialog); `packageOptions` tariffe e selettore prenotazione solo attivi.

**Fuori scope (deliberato):** il contatore "N tariffe collegate" della card (conta solo rate, non booking) resta com'è —
con l'archiviazione il 409-sorpresa non capita più. Nessun tocco a equipment/pricing/booking.

## 3. Sequenza dei prossimi slice
1. **"Archiviazione pacchetti"** (sopra §2) — spec pronta, **pianifica+esegui**.
2. **Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment` (`schema.prisma` model
   Package `:203-213`; FE oggi edita solo `sunbeds` in `PricingView.vue`; `equipmentLabel` gestisce già chiavi ignote).
   **Decisione da prendere con l'utente:** free-form JSONB (rec: YAGNI) vs entità `EquipmentType` (→ nuovo ADR-0035,
   confina con D-012). Confina anche con l'archiviazione (entrambi toccano `Package`). **Brainstorming+spec prima.**

**Scartato dall'utente (non riproporre a meno di richiesta):** "solo combinazioni legali" nel modale prenotazione (con la
catch-all è di fatto un no-op; il modale già blocca il confirm su `NO_RATE` 422).

## 4. D-0xx da tenere in vista DOPO gli slice (registro: `docs/architecture/deferred.md`)
Da NON affrontare ora, ma da citare quando toccano l'area:
- **D-034** — **forfait per prenotazione periodica** (pacchetto-settimana a prezzo fisso). Nasce dal "per ora" dello slice
  Chiarezza tipi; reintroducibile senza rompere il modello (es. forfait a livello `Package`).
- **D-012** — cabine/servizi accessori come risorse prenotabili: **confina con Slice C** (Equipment).
- **D-015** — orari arbitrari fasce (sbloccato concettualmente da B1). **D-018** — prezzo per tipologia ombrellone.
  **D-033** — pricing periodico multi-stagione. **D-030** — exclusion constraint DB anti-overlap. Tutti rimandati.
- Auth/hardening (D-025/026/027/028/029), i18n (D-003), GDPR (D-024), fuso per-tenant (D-031): fuori area Catalogo.

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro con i tuoi
  tool, NON spawnare subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **⚠️ REBUILDA i container prima di testare in dev:** `docker compose --profile full up -d --build api web`. Bug da
  container stantìo visti più volte (404 su rotta nuova, label vuota). **Password admin container `coralyn-admin-8473`**
  (NON quella di `.env`). API `localhost:3000/api`, web docker `localhost:8080`, **web vite dev `localhost:5173`** (proxy
  `/api`→3000; durante il rebuild dà `502` transitori su `/auth/*` — non è un bug), DB host `localhost:5433`. Login dev:
  `admin@coralyn.dev` / `coralyn-admin-8473`. Stagioni dev: 2026 `70000000-…-0001`, 2027 `70000000-…-0002`.
- **Migrazioni — workflow verificato:** `prisma migrate dev` **non auto-carica il root `.env` sotto `--filter`** (cwd
  diventa `apps/api`) → passa `DATABASE_URL` esplicito, caricandolo dal file **senza stamparlo** (il classifier blocca la
  materializzazione di credenziali): `DEV_URL="$(grep -oE '^DATABASE_URL=.*' .env | sed 's/^DATABASE_URL=//; s/^"//;
  s/"$//')"` e l'equivalente su `.env.test` per `TEST_URL`. Sequenza: (1) `DATABASE_URL="$DEV_URL" corepack pnpm --filter
  @coralyn/api exec prisma migrate dev --name <n> --create-only`; (2) **rimuovi lo spurio `DROP INDEX
  "Rate_signature_key";`** dal `migration.sql` (indice raw, non drift); (3) `DATABASE_URL="$DEV_URL" … prisma migrate dev`
  (applica a dev + rigenera client); (4) `DATABASE_URL="$TEST_URL" … prisma migrate deploy` (applica a `coralyn_test`, dove
  girano gli e2e); (5) `prisma migrate status` pulito. L'archiviazione aggiunge solo `Package.archivedAt` nullable: drop
  pulito, ma lo spurio DROP INDEX ricompare comunque nel diff → rimuovilo.
- **P1002 advisory-lock timeout** su `migrate deploy` (visto in questa sessione, es. il rebuild dell'api): una connessione
  **idle stale** da un `migrate dev` precedente tiene il lock di migrazione → `docker exec coralyn-db sh -c 'psql -U
  "$POSTGRES_USER" -d coralyn_dev -c "SELECT pid FROM pg_locks WHERE locktype='\''advisory'\'';"'` e poi
  `pg_terminate_backend(<pid>)` sul lock-holder. Riavvia i container e riparte.
- **Dopo aver toccato `@coralyn/contracts`** (questo slice tocca `PackageDTO`): `corepack pnpm --filter @coralyn/contracts
  build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff. `PackageDTO.archived?` è **opzionale**
  → i literal esistenti (mock/test) restano validi senza modifiche (ripple minimo).
- **La suite `web-staff` globa gli spec `ui-kit`** (`../../packages/ui-kit/src/**/*.spec.ts`): non confondere i conteggi
  (web-staff 145 INCLUDE i 55 di ui-kit).
- **Comandi test** (root, `corepack pnpm`): contracts `--filter @coralyn/contracts build`; api unit `--filter @coralyn/api
  test`; api e2e `--filter @coralyn/api test:e2e` (auto-carica `.env.test`); web-staff `--filter web-staff test`;
  typecheck `--filter web-staff typecheck`.
- **RLS FORCE** su tabelle tenant: `psql` diretto senza `app.current_tenant` mostra 0 righe (per diagnosi cross-tenant usa
  il **superuser** del container: `psql -U "$POSTGRES_USER"` bypassa RLS). Verifica il comportamento via API con JWT o
  dentro `forTenant`.

## 6. Ancore di codice (file:riga, VERIFICATE sul `main` corrente 2026-07-02)
- **Schema:** `apps/api/prisma/schema.prisma` — `model Package` **`:203-213`** (aggiungi `archivedAt DateTime?`; timestamp
  semplice come `createdAt`, NON `@db.Date`).
- **Service:** `apps/api/src/catalog/catalog.service.ts` — `listPackages` **`:67-71`** (aggiungi param `includeArchived`),
  `createPackage` `:145`, `updatePackage` `:154`, `deletePackage` **`:177-194`** (guardia 409 da rafforzare). Aggiungi
  `archivePackage`/`restorePackage`.
- **Controller:** `apps/api/src/catalog/packages.controller.ts` — `@Controller('packages')` con Get/Post/Patch/Delete;
  aggiungi `@Query('includeArchived')` alla `list` e `@Post(':id/archive')`/`@Post(':id/restore')`.
- **Proiezione:** `apps/api/src/catalog/package.projection.ts` — `toPackageDTO` (aggiungi `archived`); spec
  `package.projection.spec.ts`.
- **Contratti:** `packages/contracts/src/index.ts` — `PackageDTO` **`:119-123`** (aggiungi `archived?: boolean`);
  `CreatePackageInput` `:294-297` / `UpdatePackageInput` `:300` **INVARIATI**.
- **FE editor:** `apps/web-staff/src/features/pricing/PricingView.vue` — card pacchetti + `rateCount` + `askDeletePackage`;
  `packageOptions`. Hook `apps/web-staff/src/features/bookings/usePackages.ts` (`usePackages()` → `/packages`; aggiungi
  variante `includeArchived` + `useArchivePackage`/`useRestorePackage`). MSW `apps/web-staff/src/mocks/server.ts`
  (`/packages`). Spec `PricingView.spec.ts`.
- **e2e:** `apps/api/test/packages.e2e-spec.ts`.

## 7. Workflow per lo slice (ADR-0009)
1. **Spec** — **già fatta** (§2).
2. **Decisioni aperte** — **già risolte** (spec §6). Nessuna sotto-decisione pendente.
3. **Piano TDD** — skill `superpowers:writing-plans` → `docs/superpowers/plans/`.
4. **Esegui** — skill `superpowers:subagent-driven-development`: un implementer per task (istruito a NON delegare),
   task-review indipendente per task (spec + qualità), review whole-branch finale (opus), **un commit per layer**, da un
   **nuovo branch** da `main`. Ordine layer: backend prima (migrazione+service+controller+contratti+e2e verdi), poi FE
   editor. Non regredire i conteggi test (riverificali dal vivo).
5. **DOPO lo slice**: rebuild container + verifica live (archivia/ripristina/elimina-definitivamente, e che gli
   archiviati spariscano dai selettori), presenta lo stato all'utente e attendi conferma prima del successivo (poi Slice
   C: brainstorming+spec).

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare in
dev (password admin container `coralyn-admin-8473`).

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice **"Chiarezza tipi prenotazione"** è COMPLETO, MERGIATO su `main` e PUSHATO (il calcolo si deriva dal
> tipo di prenotazione, `Rate.unit` rimosso con migrazione). Verde su tutti i test (api unit 89 · e2e 126 · web-staff 145
> · ui-kit 55), verificato live. La spec del PROSSIMO slice **"Archiviazione pacchetti"** è già scritta e committata su
> `main` (decisioni risolte con me).
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev: `docker compose --profile full up
> -d --build api web` (bug da container stantìo visti più volte; `502` transitori su `/auth/*` durante il rebuild sono
> normali). DB host localhost:5433; password admin container `coralyn-admin-8473`; login dev
> `admin@coralyn.dev`/`coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-02-catalog-archiviazione-e-roadmap-delegation.md`
> (sequenza slice, ancore di codice §6 VERIFICATE, gotcha §5 — rebuild obbligatorio; implementer NON deve delegare;
> migrazione con workflow `--create-only` + `DATABASE_URL` esplicito + spurio DROP INDEX da rimuovere + fix P1002
> advisory-lock; `PackageDTO.archived?` opzionale), poi la spec
> `docs/specs/2026-07-02-catalog-archiviazione-pacchetti-design.md`, poi ADR-0006 (dominio), ADR-0031 (date/UTC),
> ADR-0032 (le rate referenziano i pacchetti; archiviare NON tocca rate/booking esistenti).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice già progettato "Archiviazione pacchetti" (2 layer:
> backend — `Package.archivedAt` con migrazione, `listPackages` default solo attivi + `?includeArchived=true`, rotte
> `POST /packages/:id/archive|restore`, `deletePackage` rafforzato = 200 solo se archiviato+0rif altrimenti 409,
> `PackageDTO.archived?`; FE editor — card "Archivia" senza conferma, sezione "Archiviati (N)" a scomparsa con Ripristina
> + Elimina definitivamente con ConfirmDialog, selettori solo attivi). Modello C deciso: archiviazione reversibile +
> hard-delete esplicito solo dopo archiviazione. (2) Poi Slice C "Equipment personalizzato" (brainstorming+spec, decisione
> free-form JSONB vs entità `EquipmentType` con me). Tieni i D-0xx (D-034 forfait-periodo, D-012 servizi accessori →
> confina con C, D-015, D-018, D-033, D-030…) in considerazione DOPO gli slice. Workflow ADR-0009 per OGNI slice: spec →
> risolvi decisioni con me → piano TDD → subagent-driven, un commit per layer, test-first, da un NUOVO branch da main. Non
> regredire i conteggi test (riverificali dal vivo).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
