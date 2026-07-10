# Spec — Reset totale del DB di sviluppo (§4.b)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-10). Deriva dal difetto/abilitatore **§4.b**
> dell'handoff [2026-07-09-cta-state-machine-hardening-e-prossimi.md](../../handoff/2026-07-09-cta-state-machine-hardening-e-prossimi.md) §4.
> Un comando dev che **azzera tutti i dati di business/struttura/catalogo** di **tutti** gli stabilimenti,
> preservando **solo** `User` + `Establishment` (+ i token/audit non-tenant), così da poter loggarsi su un DB
> pulito. È l'**abilitatore di §4.1** (riprodurre i bug della pagina «Configura» su struttura pulita, non su dati
> legacy accumulati). **Nessun nuovo ADR**, **nessun aggiornamento** a `flows.md`/`data-model.md`: è tooling di
> sviluppo, non tocca il dominio né il modello dati. Prossima azione dopo l'ok utente: `writing-plans` (TDD).

---

## 1. Problema / motivazione

Il DB di sviluppo (`coralyn_dev`) accumula dati creati a mano e da run precedenti (clienti, prenotazioni,
struttura, storici di sospensione/cessione/release). Alcuni bug — in particolare quelli sospettati nella pagina
«Configura» struttura (§4.1) — potrebbero dipendere da **stato legacy** e non sono riproducibili in modo pulito.
Oggi **non esiste** un comando per riportare il DB a uno stato "vuoto ma loggabile": l'unica alternativa è
`prisma migrate reset` (ricrea lo schema **e** rilancia il seed → ricrea la struttura demo e cancella gli
User/Establishment extra), che non serve allo scopo.

**Obiettivo:** un comando idempotente e sicuro che lascia il DB con i **soli** account e stabilimenti (per il
login), azzerando tutto il resto in modo **coerente** (nessuna tabella tenant dimenticata) e **verificato**.

## 2. Ambito (deciso con l'utente)

- **Profondità: reset totale.** Si preservano **solo** `User` + `Establishment` (+ `CredentialSetupToken` e
  `PlatformAuditLog`, non-tenant, non dati di business). Si azzera **tutto** il resto: struttura
  (`UmbrellaType`/`TimeSlot`/`Sector`/`Row`/`Umbrella`), catalogo/prezzi
  (`Season`/`Pricing`/`Rate`/`Package`/`EquipmentType`/`PackageEquipment`), business (`Customer`, `Booking` +
  figli in cascade `BookingCoverage`/`BookingSuspension`/`BookingTransfer`/`AbsenceRelease`, `RenewalCampaign`).
- **Tutti gli stabilimenti.** Il reset agisce su **tutti** i tenant del DB (mantenendo tutte le righe
  `User`/`Establishment`): lettura letterale di «reset totale DB dev», risultato uniforme indipendente da quanti
  tenant di test si sono accumulati.
- **Nessun re-seed automatico** (single-responsibility): dopo il reset lo stabilimento è vuoto; il seed
  (`prisma/seed.ts`, idempotente) resta un comando separato per chi vuole la demo.
- **Fuori ambito:** §4.1 (fix «Configura», slice successiva di cui questo è abilitatore); qualsiasi modifica al
  modello dati, alle RLS o al dominio.

## 3. Stato di fatto rilevante (verificato sul DB)

- Le **18** tabelle tenant hanno **RLS `ENABLE`+`FORCE`** (convenzione di progetto: ogni nuova tabella tenant
  nasce così). Le **5** tabelle da preservare — `User`, `Establishment`, `CredentialSetupToken`,
  `PlatformAuditLog`, `_prisma_migrations` — **non** hanno RLS. Quindi *`relforcerowsecurity = true` ⟺ dato da
  azzerare* (le 18 tenant).
- **Caso speciale `User`:** ha una colonna `establishmentId` (nullable: `null` = superuser) **ma è non-RLS per
  scelta** (identità pre-tenant, [ADR-0026]). È l'**unica** tabella con `establishmentId` che NON va azzerata →
  il coherence check (§4.1) la deve **carve-out** via keep-list, altrimenti falso-aborta. `Establishment` ha `id`
  (non `establishmentId`); `PlatformAuditLog` ha `targetEstablishmentId` (soft-ref, nome diverso);
  `CredentialSetupToken` ha solo `userId` → nessuno dei tre è nel criterio `establishmentId`.
- Owner di tutte le tabelle = `coralyn_app` (= il ruolo con cui gira il seed e l'app). Come **owner** può
  `TRUNCATE`; **`TRUNCATE` non è filtrato da RLS** (RLS agisce solo su SELECT/INSERT/UPDATE/DELETE) → azzera
  **tutti** i tenant in un colpo, senza GUC né connessione superuser.
- `TRUNCATE` è **transazionale** in Postgres (roll-back-abile) → testabile senza distruggere il DB condiviso.
- I figli di `Booking` sono `onDelete: Cascade`; con `TRUNCATE … CASCADE` sull'intero set l'ordine FK è
  **irrilevante**.

## 4. Approccio scelto: TRUNCATE dinamico guidato dall'RLS, con coherence guard

Alternative scartate:
- **`deleteMany` Prisma in ordine FK, loop per-tenant + GUC** — richiede ordinamento manuale fragile e un loop
  sugli stabilimenti; più superficie di bug, nessun vantaggio (TRUNCATE ignora già l'RLS ed è order-independent).
- **`prisma migrate reset` + reseed** — ricrea la struttura demo e cancella User/Establishment extra: viola la
  scelta "reset totale mantenendo tutti gli User+Establishment".

### 4.1 Selettore coerente e **auto-verificante**

Il set da azzerare è derivato **dinamicamente** da `pg_class.relforcerowsecurity = true` (schema `public`) —
single source of truth, coerente con la convenzione del progetto e **auto-manutenuto** (una nuova tabella tenant,
nascendo RLS FORCE, entra da sola; una non-tenant resta fuori).

Per non "fidarsi ciecamente" del flag, un **coherence check** incrocia due criteri indipendenti e **aborta
rumorosamente** su divergenza, *prima* di qualsiasi TRUNCATE:

- `KEEP` = keep-list hardcoded `{User, Establishment, CredentialSetupToken, PlatformAuditLog, _prisma_migrations}`.
- `F` = tabelle con `relforcerowsecurity = true`.
- `E` = tabelle con una colonna `establishmentId` (`information_schema.columns`) **meno** `KEEP` (carve-out di
  `User`, unica tenant-column non-RLS by design — §3).
- Atteso: `F == E`. Se una tabella è in `E \ F` → *"tenant-scoped ma senza RLS FORCE"* (buco di sicurezza **e**
  gap del reset: verrebbe **saltata in silenzio** = dato stantìo, il bug stesso che combattiamo). Se in `F \ E`
  → *"RLS FORCE ma senza `establishmentId`"* (tabella inattesa nel set da azzerare). In **entrambi** i casi:
  `throw` con l'elenco delle tabelle divergenti, **nessun** TRUNCATE.
- **Keep-list assertion finale anti-catastrofe:** se il set calcolato (`F`) intersecasse `KEEP` → abort. (Difesa
  in profondità: non ci si affida a un solo criterio.)

### 4.2 Esecuzione

Un solo statement: `TRUNCATE TABLE "<t1>","<t2>",… RESTART IDENTITY CASCADE` sul set validato. `RESTART IDENTITY`
azzera eventuali sequenze; `CASCADE` rende l'ordine FK irrilevante (tutte le referenzianti sono nel set).

## 5. Guardie di sicurezza (difesa in profondità)

1. **`NODE_ENV !== 'production'`** → `throw` (come `seed.ts`).
2. **`current_database()`** deve matchare `/dev|test/` → altrimenti `throw` (rifiuta un DB dall'aria di prod anche
   se `NODE_ENV` fosse mal configurato).
3. **Coherence check** (§4.1) → abort su divergenza `F`/`E`.
4. **Keep-list assertion** (§4.1) → abort se il set toccasse una tabella da preservare.
5. **Conferma esplicita `--yes`.** Senza il flag il comando è un **dry-run**: stampa la lista esatta delle
   tabelle e la **stima righe per tabella** (`pg_stat_user_tables.n_live_tup`) che verrebbero perse, senza
   toccare nulla. *Stima* e non COUNT esatto: l'RLS FORCE filtrerebbe un `SELECT count(*)` a 0 senza GUC, mentre
   `pg_stat` non è RLS-filtrato → riflette tutti i tenant (= ciò che il TRUNCATE azzererà).

## 6. Delivery / interfaccia

- File: `apps/api/prisma/reset-dev.ts` (ts-node, `PrismaClient` ruolo app — stesso pattern di `seed.ts`).
- Cuore estratto in `resetTenantData(exec)` (accetta `PrismaClient` **o** un `Prisma.TransactionClient`) →
  riusabile dal test in transazione.
- Script `package.json` (`apps/api`): `"db:reset": "ts-node prisma/reset-dev.ts"` → esecuzione
  `corepack pnpm --filter @coralyn/api run db:reset -- --yes`.
- Output: intestazione con DB target, tabella (nome → stima righe), e riga finale di conferma
  (`User: N preservati · Establishment: M preservati`) + hint *"rilancia il seed per la demo, o configura da UI"*.

## 7. Testing

Il cuore è estratto in funzioni pure + una funzione d'esecuzione riusabile, così il comportamento è testato
**davvero**, non solo verificato a mano:

- **Unit (TDD, Jest api unit)** sulle funzioni pure, senza DB:
  - `selectTablesToWipe(forcedTables, keepList)` → `forced \ keep`.
  - `assertCoherence(forcedSet, establishmentIdSet, keepList)` → confronta `forcedSet` con `establishmentIdSet \ keepList`;
    throw con messaggio sulle divergenze (incluso il caso `User` se il carve-out mancasse); ok se uguali.
  - `assertResettableEnv(nodeEnv, dbName)` → throw su `production` / db non `/dev|test/`.
- **Integration (Jest e2e, `--runInBand`, non distruttivo)**: dentro una **transazione** interattiva
  (`prisma.$transaction`) — imposta la GUC `app.current_tenant`, semina righe in alcune tabelle tenant +
  `User`/`Establishment`, chiama `resetTenantData(tx)`, **asserisce** (le tabelle tenant seminate → 0 righe;
  `User`/`Establishment` → invariati), poi forza il **rollback** (throw sentinella catturato fuori). `TRUNCATE`
  transazionale ⇒ zero impatto sul DB condiviso.
- **Verifica LIVE** su Docker come conferma finale: dry-run (mostra i conteggi), poi `--yes`, poi login
  `admin@coralyn.dev` su DB vuoto + pagina «Configura» pulita.

## 8. Cosa NON fa

- Non cancella `User`/`Establishment`/`CredentialSetupToken`/`PlatformAuditLog`.
- Non rilancia il seed (comando separato).
- Non modifica schema, RLS, migrazioni, né alcun codice di dominio/app.
- Non gira senza `--yes` (dry-run) né fuori da un DB `dev|test`.

## 9. Rubric check (ADR-0002)

1. **Professionalità** — comando dev sicuro, idempotente, con difesa in profondità e test reali (unit + integrazione
   in rollback), non "verificato solo a mano".
2. **Convenzioni** — riusa il pattern `seed.ts` (ts-node, ruolo app, guard `NODE_ENV`); si appoggia alla
   convenzione RLS-FORCE = tenant già enforced nel progetto.
3. **Modularità** — cuore isolato in `resetTenantData` + funzioni pure testabili in isolamento; single-responsibility
   (azzera, non re-seed).
4. **Zero debito** — nessuna lista di tabelle hand-maintained che possa driftare: il set è **derivato** e
   **auto-verificato** contro un secondo criterio, con abort rumoroso sulla divergenza (una tabella tenant
   dimenticata non passa in silenzio).
