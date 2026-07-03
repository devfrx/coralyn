# Handoff / Delega — Slice "D-030 anti-overlap a livello DB" + sequenza D-0xx

> Documento di consegna per la **prossima sessione**. Lo slice **"Equipment personalizzato"** è **COMPLETO, MERGIATO su
> `main` e PUSHATO**. Lo slice **"D-030 — anti-overlap a livello DB"** ha **spec di design APPROVATA e committata/pushata su
> `main`** (decisioni risolte con l'utente), **da pianificare ed eseguire** — è il **prossimo passo reale**.
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design →
> RISOLVI le decisioni con l'utente → **piano TDD** (`superpowers:writing-plans`) → implementa **subagent-driven, un commit
> per layer, test-first, da un NUOVO branch da `main`**. **DOPO ogni slice: presenta lo stato e attendi conferma prima del
> successivo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8 e fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main` = `2561541`** (al momento della scrittura). Include: Equipment (6 commit `ba0ac4f`→`1d189a1`) e
  la **spec D-030** (`2561541`). **Nessun branch pendente** (il branch Equipment è stato eliminato dopo il FF-merge).
- **Migrazioni applicate** (`coralyn_dev` + `coralyn_test`): ultima `20260703081533_add_equipment_type_and_package_equipment`.
  **Il dev DB è stato RESETTATO e riseminato pulito** (2026-07-03) — password admin ripristinata a `coralyn-admin-8473`.
  **Lo slice D-030 RICHIEDE una nuova migrazione** (schema + backfill + trigger + constraint + estensione, §3).
- **Prossimo ADR libero:** **0037** lo consuma D-030 (§3/§7). Dopo: **0038**. **Prossimo D libero (registro):** **D-035**.

## 1. Stato attuale (post "Equipment", MERGIATO)
- **Baseline test da NON regredire (su `main`, verificata live 2026-07-03):** **api unit 97 · api e2e 142 · web-staff 153
  (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. *(web-staff INCLUDE i 55 di ui-kit: 153 li comprende —
  non doppio-contare.)*
- **"Equipment personalizzato"** (merged): `Package.equipment` JSONB → catalogo **`EquipmentType`** + join **`PackageEquipment`**
  (qty ≥ 1, `@@id([packageId, equipmentTypeId])`, `onDelete Cascade`/`Restrict`, `establishmentId` sul join per RLS uniforme).
  Migrazione dati (`SUM`/`GROUP BY`, `NO FORCE`/`FORCE` attorno alla lettura). Composizione **set-assoluto** (chiude il
  clobber). CRUD `equipment-types` mirror di `packages` (archiviazione + hard-delete-if-unreferenced). FE catalogo +
  compositore multi-riga con creazione al volo, etichetta «N × Nome». **ADR-0036** (raffina ADR-0006). Review whole-branch
  (opus): **merge=YES, 0 Critical/Important**. Live-verificato via API (dup-nome→409, composizione ordinata, PATCH no-clobber,
  qty<1→400, tipo archiviato→422, DELETE referenziato→409).
  - **Nota (400 vs 422):** `quantity<1` risponde **400** (ValidationPipe `@Min(1)`), non 422 (la spec §4.3 diceva 422). È
    comportamento voluto e pinnato dagli e2e; se si vuole allineare la spec, è una nota di wording, non un bug.

## 2. LA SEQUENZA (decisa con l'utente 2026-07-03)
1. **Slice "D-030 — anti-overlap a livello DB"** — **spec pronta e approvata**, `pianifica + esegui` (§3). **Questo è il
   prossimo passo.** Backend-only, ma richiede migrazione (schema + backfill + trigger + constraint).
2. **Poi i D-0xx**, per valore/principio (§4). **L'utente ha SALTATO D-034** (forfait periodico) come **speculativo**:
   auto-deferito ("non richiesto ora", 2026-07-02), riaprirebbe la complessità che ADR-0035 aveva semplificato (rimozione
   `unit`), nessun trigger reale. **Non riproporlo per primo.**

**In una riga:** il prossimo passo è lo **slice D-030** (spec approvata → piano → esecuzione). Dopo, il candidato più
principle-aligned è **D-024** (GDPR, trigger già materializzato, §4); D-012 (cabine) è il maggior valore-prodotto ma grande.

## 3. Lo slice "D-030 — anti-overlap a livello DB" (già progettato)
Spec approvata: **[docs/specs/2026-07-03-anti-overlap-db-d030-design.md](../specs/2026-07-03-anti-overlap-db-d030-design.md)**.
Decisioni **già risolte** (spec §8). Resta: **piano TDD + esecuzione** (subagent-driven, da nuovo branch da `main`).

**Problema:** l'invariante anti-overlap ("niente doppioni sullo stesso ombrellone") è enforced SOLO a livello applicativo
([`bookings.service.ts:133-144`](../../apps/api/src/bookings/bookings.service.ts)); due create concorrenti passano entrambe
il controllo (race) → doppione.

**Soluzione (decisa):** `EXCLUDE USING gist` su `Booking` (difesa-in-profondità; l'app resta primaria). Chiavi:
`"umbrellaId" WITH =`, `daterange(startDate,endDate,'[]') WITH &&` (inclusivo, = `dateRangesOverlap`),
`int4range(slotStartMin,slotEndMin,'[)') WITH &&` (semiaperto, = `slotsOverlap`), `WHERE status='confirmed'`.

**Perché 2 colonne nuove su `Booking`:** l'`EXCLUDE` riferisce solo colonne della riga (niente join a `TimeSlot`). Matchare
`timeSlotId WITH =` sarebbe più debole (mancherebbe **Giorno Intero 08–19 vs Mattina 08–13** → doppione reale). Quindi il
range orario va **materializzato** su `Booking` come `slotStartMin`/`slotEndMin` (minuti-dalla-mezzanotte), popolati da un
**trigger DB** (DB-autoritativo, non app-set). Nessuna colonna `GENERATED` (espressioni inline immutabili nel constraint).

**Layer previsti (un commit per layer; il piano potrà accorpare — vedi §7 lezione Equipment):**
1. **Schema + migrazione** — 2 colonne su `model Booking`; migration con: `CREATE EXTENSION btree_gist`; add colonne
   nullable; **backfill** da `TimeSlot` (con `NO FORCE`/`FORCE` su `Booking` E `TimeSlot`, §5); `SET NOT NULL`; funzione +
   trigger `BEFORE INSERT OR UPDATE OF "timeSlotId"`; `EXCLUDE` constraint. Applica a dev+test. + helper puro `time → minuti`
   con unit test.
2. **Backend** — mapping **`23P01` (exclusion_violation, NON `23505`) → 409** "Fascia non disponibile per questo ombrellone"
   nella create ([`bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts)); **rafforza** la validazione
   stagioni in [`renewal-campaigns.service.ts:31`](../../apps/api/src/bookings/renewal-campaigns.service.ts) da
   `dest.startDate <= origin.startDate` a `dest.startDate <= origin.endDate` (rende il constraint rinnovo-safe); e2e.
3. **ADR-0037** (raffina ADR-0006/0013) + rimando in ADR-0006 e ADR-0034.

**Confine di scope (YAGNI):** il controllo applicativo resta primario (messaggio gentile + contesto rinnovo/prelazione che il
DB non esprime); la prelazione resta applicativa; split multi-stagione = **D-033** (invariato). Nessun FE.

## 4. D-0xx da affrontare DOPO D-030 (registro: [`docs/architecture/deferred.md`](../architecture/deferred.md))
Ordinati per valore/principio (lettura fatta con l'utente 2026-07-03; conferma con lui prima di partire):
- **D-024 — cancellazione/anonimizzazione `Cliente` (GDPR).** Il trigger è **già materializzato**: era deferito per "manca il
  legame Cliente↔Prenotazione", ma quel legame **ora esiste** (`Booking.customerId`). Rilevante per il mercato IT; più
  economico prima che i dati personali si accumulino. Slice medio (soft-delete/anonimizzazione + punto consenso + semantica
  storico prenotazioni).
- **D-012 — cabine/servizi accessori prenotabili.** Massimo **valore-prodotto** (altra linea di ricavo, ADR-0006 la
  anticipa: "risorsa gemella dell'Ombrellone"), adiacente all'Equipment. Ma **slice grande** (nuova risorsa prenotabile +
  disponibilità + pricing); il valore dipende dal fatto che il lido affitti cabine.
- **Security/hardening (D-025 RBAC utenti · D-026 refresh/revoca token · D-027 rate-limit login · D-029 login a tempo
  costante):** tutti **gated sull'esposizione pubblica / multi-operatore**. Diventano prioritari SOLO quando il deploy reale
  è vicino. Finché è MVP interno, restano deferiti.
- **Bassa priorità (le note deferred dicono "basta" così):** D-018 (prezzo per tipologia ombrellone), D-015 (fasce orarie
  arbitrarie), D-033 (periodica multi-stagione), D-034 (**forfait periodico — deprioritizzato come speculativo, §2**).
- **Fuori area Catalogo/Bookings:** D-003 (i18n), D-031 (fuso per-tenant), D-002/D-004/D-006/D-008/D-009 (moduli successivi:
  SaaS, Cassa, notifiche, offline-sync).

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro, NON spawnare
  subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **⚠️ La migrazione D-030 legge `Booking` E `TimeSlot` nel backfill sotto RLS FORCE.** Il ruolo `coralyn_app` è
  `NOBYPASSRLS` e possiede le tabelle: **senza `ALTER TABLE … NO FORCE ROW LEVEL SECURITY`** (su ENTRAMBE) attorno al backfill,
  la SELECT/UPDATE legge **zero righe** (GUC `app.current_tenant` non impostata in `migrate deploy`). Ripristina `FORCE` dopo.
  (Stesso schema dello slice Equipment — vedi migration `20260703081533`.)
- **⚠️ Codice SQLSTATE:** una violazione di `EXCLUDE` è **`23P01`** (exclusion_violation), **NON** `23505` (unique_violation,
  usato da `Rate_signature_key`). Mappa `23P01 → 409`.
- **⚠️ `btree_gist`** va abilitato (`CREATE EXTENSION IF NOT EXISTS btree_gist`) per mischiare `=` (uuid) e `&&` (range) in un
  gist `EXCLUDE`.
- **Drift Prisma pre-esistente (`Rate_signature_key`):** un indice raw non modellato in `schema.prisma` fa **ri-promptare
  `prisma migrate dev`** (drift) e, su un dev DB inquinato, faceva rollbackare il seed. **Il dev DB è stato resettato**, ora è
  pulito. D-030 aggiunge altri oggetti raw (trigger/constraint/estensione) → stesso pattern, atteso. Su un dev DB pulito il
  seed funziona.
- **⚠️ REBUILDA i container prima di testare D-030 in dev:** `docker compose --profile full up -d --build api web` (servono
  la nuova migrazione + il codice del branch; i container attuali sono su un'immagine pre-`1d189a1`). Login dev
  `admin@coralyn.dev` / `coralyn-admin-8473`; API `localhost:3000/api` (health `/health`, escluso dal prefisso); web `8080`;
  DB host `5433` (c'è un altro postgres `continuum` su `5432` — la nostra URL punta a `5433`).
- **`.env.test` è al ROOT.** L'e2e (`--filter @coralyn/api test:e2e`) lo auto-carica. Per comandi **prisma** sotto `--filter`,
  carica `DATABASE_URL` dal file **senza stamparlo** (il classifier blocca la materializzazione di credenziali):
  `set -a; . ./.env; set +a` (dev) / `. ./.env.test` (test). P1002 advisory-lock su `migrate deploy` →
  `pg_terminate_backend` sull'holder.
- **⚠️ Non far girare `prisma db seed` in locale senza `DEV_ADMIN_PASSWORD` in env:** il seed resetta la password admin al
  default `coralyn-admin` (l'upsert admin è PRIMA della transazione). Se serve, esporta `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test`; typecheck `--filter web-staff typecheck`. "worker failed to exit gracefully" di Jest =
  rumore di teardown pre-esistente, non un fallimento.

## 6. Ancore di codice (file:riga, VERIFICATE su `main` `2561541` — 2026-07-03)
- **Schema:** [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) — `model Booking` **`:156`**,
  `umbrellaId` `:160`, `timeSlotId` `:161`, `previousBookingId` `:162`, `startDate` `:164`, `endDate` `:165`, `status` `:167`,
  `@@index([establishmentId, startDate, endDate])` `:186`. (Aggiungere `slotStartMin Int` + `slotEndMin Int`.) `model TimeSlot`
  ha `startTime`/`endTime` `@db.Time(0)`.
- **Overlap puro:** [`booking.availability.ts`](../../apps/api/src/bookings/booking.availability.ts) — `slotsOverlap` (semiaperto
  `[)`), `dateRangesOverlap` (inclusivo). **Non cambiano**: il constraint li specchia.
- **Enforcement app:** [`bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts) — check conflitto **`:133-144`**
  (`id:{ not: previousBookingId }` `:137`, `dateRangesOverlap && slotsOverlap` `:142`, `throw ConflictException('Fascia non
  disponibile per questo ombrellone')` `:144`). Qui va avvolto il mapping `23P01 → 409`.
- **Validazione stagioni rinnovo:** [`renewal-campaigns.service.ts:31-32`](../../apps/api/src/bookings/renewal-campaigns.service.ts)
  — `if (dest.startDate <= origin.startDate) → 422`. **Rafforzare** a `<= origin.endDate` (msg: "…deve iniziare dopo la fine di
  quella di origine").
- **Pattern RLS migrazione (riferimento):** migration `20260703081533_add_equipment_type_and_package_equipment/migration.sql`
  — la manovra `NO FORCE`/`FORCE` attorno alla lettura tenant e le policy `tenant_isolation`.
- **Pattern SQLSTATE→409 (riferimento):** `rates.service.ts` mappa `23505 → 409` per `Rate_signature_key` (per D-030 usa
  `23P01`). Cerca dove Prisma espone il codice nativo (`PrismaClientKnownRequestError`).
- **e2e da estendere:** [`bookings.e2e-spec.ts`](../../apps/api/test/bookings.e2e-spec.ts),
  [`renewal-campaigns.e2e-spec.ts`](../../apps/api/test/renewal-campaigns.e2e-spec.ts).
- **ADR:** crea `docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md`; rimandi in `0006-…` e `0034-…`.

## 7. Workflow per lo slice D-030 (ADR-0009) — template provato
1. Spec — **fatta** (§3). 2. Decisioni — **risolte** (spec §8). 3. **Piano TDD** — `superpowers:writing-plans` →
   `docs/superpowers/plans/`. 4. **Esegui** — `superpowers:subagent-driven-development`: per ogni layer, implementer (NON
   delega) + task-review (spec ✅ + quality) + fix se Critical/Important, poi **review whole-branch finale (opus)**, **un
   commit per layer**, da un **nuovo branch da `main`**. Traccia i progressi nel ledger `.superpowers/sdd/progress.md`
   (scratch git-ignored; sopravvive tra i turni, NON a `git clean -fdx`).
   - **Lezione Equipment (importante):** layer che condividono un confine di compilazione/contratto **devono atterrare
     insieme** in un solo commit. Nell'Equipment, rimuovere una colonna lasciava il backend non-compilabile finché la
     composizione non atterrava → Task 2+3 furono **accorpati**; il cambio di contratto rompeva anche il FE → Task 4+5
     accorpati. Per D-030 layer 1 (migrazione, che introduce il constraint) e layer 2 (mapping `23P01→409` + e2e che lo
     esercita) **potrebbero dover essere un solo commit**: senza il mapping, l'e2e che innesca il constraint vedrebbe un 500
     grezzo invece di 409. Il piano valuti l'accorpamento.
5. **DOPO**: applica migrazione dev+test → rebuild container → verifica live (crea due prenotazioni in conflitto reale, incl.
   Giorno-Intero-vs-Mattina → 409; contigue → 201; cancellata non blocca; rinnovo su stagione futura → 201) → presenta lo
   stato all'utente e **attendi conferma** prima del prossimo D-0xx (probabile **D-024**).

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare in dev
(password admin container `coralyn-admin-8473`). Per D-030 ricordati di **applicare la nuova migrazione** a dev+test dopo il
sync.

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice **"Equipment personalizzato"** è COMPLETO, MERGIATO su `main` e PUSHATO (catalogo `EquipmentType` + join
> `PackageEquipment`, composizione set-assoluto che chiude il clobber, CRUD mirror di packages, FE catalogo+compositore,
> ADR-0036). Verde su tutti i test (api unit 97 · e2e 142 · web-staff 153 · ui-kit 55 · typecheck pulito), review opus 0
> Critical/Important, live-verificato. Dev DB **resettato pulito** (password admin `coralyn-admin-8473`). Lo slice
> **"D-030 — anti-overlap a livello DB"** ha spec di design **approvata** e committata/pushata su `main` (`2561541`;
> decisioni risolte con me), **da pianificare ed eseguire**.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Lo slice D-030 RICHIEDE una migrazione (schema + backfill + trigger + `EXCLUDE`
> constraint + `btree_gist`) da applicare a dev+test. ⚠️ Rebuilda i container prima di testare in dev:
> `docker compose --profile full up -d --build api web`. DB host `localhost:5433`; login dev `admin@coralyn.dev` /
> `coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-03-d030-anti-overlap-e-sequenza-slice.md` (sequenza §2, slice
> D-030 §3, D-0xx §4, gotcha §5, ancore di codice §6 VERIFICATE, workflow §7 con la lezione Equipment sull'accorpamento
> layer), poi la spec `docs/specs/2026-07-03-anti-overlap-db-d030-design.md`, poi ADR-0006 (invariante anti-overlap, che
> questo slice raffina con ADR-0037), ADR-0013 (fascia) e ADR-0009 (workflow).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice "D-030 — anti-overlap a livello DB" — 2 colonne
> `slotStartMin`/`slotEndMin` su `Booking` (minuti-dalla-mezzanotte, denormalizzate da `TimeSlot`), popolate da un **trigger
> DB** (DB-autoritativo); `EXCLUDE USING gist` (`umbrellaId =`, `daterange('[]')`, `int4range('[)')`, `WHERE
> status='confirmed'`) allineato semanticamente al controllo applicativo (che resta primario); mapping **`23P01` → 409**
> (NON 23505); **rafforza** la validazione stagioni rinnovo a `dest.startDate <= origin.endDate` per rendere il constraint
> rinnovo-safe; migrazione col backfill sotto `NO FORCE`/`FORCE` (RLS); nuovo ADR-0037 (raffina ADR-0006/0013). Backend-only,
> nessun FE. Confine con D-033 (split multi-stagione, invariato). (2) Poi i D-0xx per valore/principio: **D-024** (GDPR
> cliente — trigger già materializzato) o **D-012** (cabine, grande) — CONFERMA con me la scelta prima di partire; **D-034 è
> deprioritizzato come speculativo, non riproporlo**. Workflow ADR-0009 per OGNI slice: spec → risolvi decisioni con me →
> piano TDD → subagent-driven (implementer NON delega; layer accoppiati per compilazione atterrano nello stesso commit), un
> commit per layer, test-first, da un NUOVO branch da main. Non regredire i conteggi test (riverificali dal vivo: api unit
> 97 · e2e 142 · web-staff 153 · ui-kit 55).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
