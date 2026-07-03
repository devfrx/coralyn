# Handoff / Delega — Slice "Equipment personalizzato" + sequenza slice/D-0xx

> Documento di consegna per la **prossima sessione**. Lo slice **"Pricing — Abbonamento partizione tipo"** è **COMPLETO,
> MERGIATO su `main` e PUSHATO**. Lo slice **"Equipment personalizzato"** ha **spec di design APPROVATA e committata/pushata
> su `main`** (`393fe28`; decisioni risolte con l'utente), **da pianificare ed eseguire** — è il **prossimo passo reale**.
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design →
> RISOLVI le decisioni con l'utente → **piano TDD** (`superpowers:writing-plans`) → implementa **subagent-driven, un commit
> per layer, test-first, da un NUOVO branch da `main`**. **DOPO ogni slice: presenta lo stato e attendi conferma prima del
> successivo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8 e fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main` = `393fe28`** (al momento della scrittura). Include: lo slice Archiviazione, lo slice **Pricing**
  (4 commit `3e4d1d7`→`9d220d5`) e la **spec Equipment** (`393fe28`). **Nessun branch pendente** (il branch del pricing è
  stato eliminato dopo il FF-merge).
- **Migrazioni applicate** (`coralyn_dev` + `coralyn_test`): ultima `20260702204532_add_package_archived_at`. Il pricing
  **non** ha aggiunto migrazioni (logica pura). **Lo slice Equipment RICHIEDE una nuova migrazione** (schema + dati, §3).
- **Prossimo ADR libero:** **0036** lo consuma l'Equipment (§3). Dopo: **0037**. **Prossimo D libero:** **D-035**.

## 1. Stato attuale (post "Pricing", MERGIATO)
- **Baseline test da NON regredire (su `main`, verificata live 2026-07-03):** **api unit 94 · api e2e 130 · web-staff 148
  (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. *(La suite `web-staff` INCLUDE i 55 spec di `ui-kit`:
  148 comprende i 55 — non doppio-contare.)*
- **"Pricing — Abbonamento partizione tipo"** (merged): **partizione dura del tipo** — un abbonamento è prezzato SOLO da
  tariffe `type='subscription'`; il wildcard `type=null` è la famiglia a prezzo/giorno (daily/periodic), mai il forfait.
  Motore `isApplicable` ([`pricing.engine.ts`](../../apps/api/src/catalog/pricing.engine.ts)); 422 type-aware in
  `throwPriceError` ("Nessuna tariffa Abbonamento configurata per questa stagione"); **ADR-0035** (raffina ADR-0032 §1).
  Precedenza + FE + schema invariati, nessuna migrazione. Review whole-branch (opus): **merge=YES, 0 Critical/Important**.
  Live-verificato: quote subscription = **€800** (`matchedRate.type=subscription`), era €28; daily invariato.
  Follow-up **non-bloccanti deferiti**: (a) unit test di difesa-in-profondità (tariffa subscription scoped a una posizione
  diversa → NO_RATE); (b) virgola finale cosmetica nella lista "ADR correlati" di ADR-0032.

## 2. LA SEQUENZA (slice PRIMA dei D-0xx)
1. **Slice "Equipment personalizzato"** — **spec pronta e approvata**, `pianifica + esegui` (§3). **Questo è il prossimo
   passo.** È lo slice **più grande** finora (richiede migrazione schema+dati).
2. **Poi i D-0xx**, iniziando da quelli che confinano con ciò che è appena stato costruito (§4). Dopo Equipment, gli slice
   nominati sono esauriti: si passa ai D-0xx.

**In una riga:** il prossimo passo è lo **slice Equipment** (spec approvata → piano → esecuzione). I D-0xx vengono dopo; i
primi naturali sono **D-034** (forfait periodico, gemello del pricing/tipo) e **D-012** (cabine/servizi, confina con Equipment).

## 3. Lo slice "Equipment personalizzato" (già progettato)
Spec approvata: **[docs/specs/2026-07-03-equipment-personalizzato-design.md](../specs/2026-07-03-equipment-personalizzato-design.md)**.
Decisioni **già risolte** (spec §8). Resta: **piano TDD + esecuzione** (subagent-driven, da nuovo branch da `main`).

**Problema:** `Package.equipment` è un `Json @db.JsonB` free-form, ma l'editor FE modifica **solo** `sunbeds` e **clobbera**
le altre voci al salvataggio. Debito: nessuna consistenza dei nomi, nessuna integrità, `@IsObject()` non valida nulla.

**Soluzione (decisa — entità completa, "senza debiti"):** catalogo tenant-scoped **`EquipmentType`** (`id, name,
archivedAt?`, nome unico per tenant) + composizione normalizzata **`PackageEquipment`** (`@@id([packageId,
equipmentTypeId])`, `quantity≥1`, `onDelete: Cascade` lato pacchetto / `Restrict` lato tipo). `Package.equipment JSONB`
**rimosso**. Etichetta **"Quantità × Nome"** (un solo campo `name`, niente pluralizzazione → i18n resta **D-003**).

**Layer previsti (un commit per layer; il piano potrà accorpare dove sensato):**
1. **Schema + migrazione dati + seed** — nuova entità + join in [`schema.prisma`](../../apps/api/prisma/schema.prisma);
   migration con step SQL che converte il JSONB esistente in catalogo+link (mappa `sunbeds→Lettino`, `deckchairs→Sdraio`,
   `umbrellas→Ombrellone`, altre chiavi → `initcap`; `INSERT … GROUP BY p.id, t.id` con **`SUM`** per l'edge-case di chiavi
   che collassano sullo stesso nome, evita la violazione del PK composito) → `DROP COLUMN package.equipment`. Aggiorna
   `seed.ts` e `test/helpers/seed-pricing.ts`. Applica a dev+test.
2. **EquipmentType backend** — contratti (`EquipmentTypeDTO`, `Create/UpdateEquipmentTypeInput`); nuovo
   `equipment-types.controller.ts` **mirror di `packages.controller.ts`** (GET `?includeArchived` · POST · PATCH `:id` ·
   POST `:id/archive|restore` · DELETE `:id` = 200 se archiviato+0rif, altrimenti 409); service + `equipment-type.projection.ts`;
   unicità nome (trim + case-insensitive lato service, `@@unique` come rete); e2e mirror `packages.e2e-spec.ts`.
3. **Composizione pacchetto backend** — `PackageDTO.equipment` → `{ equipmentTypeId, name, quantity }[]` (nome risolto
   dalla projection, ordinato per nome); `Create/UpdatePackageInput.equipment` → `{ equipmentTypeId, quantity }[]`;
   validazione (tipo esistente/non-archiviato, `quantity≥1`, no-dup → 422); scrittura **set-assoluto** dei link (chiude il
   bug del clobber); e2e in `packages.e2e-spec.ts`.
4. **FE catalogo tipi** — sezione in [`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue) (griglia
   CRUD + "Archiviati (N)" a scomparsa, **rispecchia** la UX pacchetti archiviati); query/mutation Vue Query + MSW mock.
5. **FE compositore pacchetto** — sostituisci il campo singolo "Lettini" con compositore multi-riga: picker a ricerca +
   **creazione al volo** del tipo + quantità + aggiungi/rimuovi; `equipmentLabel` → "2 × Lettino · 1 × Cassaforte" (rimuovi
   `EQUIP_IT`).
6. **ADR-0036** (raffina ADR-0006) + riga di rimando in ADR-0006.

**Confine di scope (YAGNI):** equipment = **dotazione del pacchetto**, NON risorsa prenotabile né extra-per-prenotazione
(quello è **D-012**, deferred). Nessun prezzo per voce; nessun'icona/immagine sul tipo.

## 4. D-0xx da affrontare DOPO gli slice (registro: [`docs/architecture/deferred.md`](../architecture/deferred.md))
Ordinati per adiacenza:
- **D-034 — forfait per prenotazione periodica** (pacchetto-periodo a prezzo fisso). **Gemello del pricing/tipo**: dopo la
  partizione del tipo, reintrodurre il forfait-periodo è il seguito naturale (es. forfait a livello `Package`), senza
  toccare le precedenze ADR-0032.
- **D-012 — cabine/servizi accessori** come risorse prenotabili: **confina con lo slice Equipment** (stesso pattern di
  Ombrellone; l'entità `EquipmentType` è un precursore naturale, ma D-012 è risorsa *prenotabile*, oltre lo scope Equipment).
- **D-018** — prezzo per tipologia ombrellone (aggiungere un `ambito` al pricing engine). **D-015** — orari arbitrari fasce.
  **D-033** — pricing periodico multi-stagione. **D-030** — exclusion constraint DB anti-overlap. Tutti additivi, rimandati.
- Fuori area Catalogo: auth/hardening (D-025/026/027/028/029), i18n (D-003 — nota: la pluralizzazione equipment ricade qui),
  GDPR (D-024), fuso per-tenant (D-031).

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro con i tuoi
  tool, NON spawnare subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare. *(Provato
  con successo nello slice Pricing di questa sessione: 3 task, 1 implementer + 1 task-review ciascuno, review finale opus.)*
- **⚠️ Equipment RICHIEDE una migrazione (schema + DATI).** Applica a `coralyn_dev` **e** `coralyn_test`; `prisma migrate
  status` pulito su entrambi prima di dire "verde". Lo step dati è la parte delicata (vedi §3 layer 1: `SUM`/`GROUP BY`).
- **⚠️ REBUILDA i container prima di testare in dev:** `docker compose --profile full up -d --build api web`. Login dev
  `admin@coralyn.dev` / `coralyn-admin-8473`; API `localhost:3000/api` (health a `/health`, escluso dal prefisso `/api`);
  web docker `8080`; DB host `5433`. Stagioni dev: 2026 `70000000-…-0001`, 2027 `70000000-…-0002`.
- **`.env.test` è al ROOT del repo** (non in `apps/api/`). L'e2e (`--filter @coralyn/api test:e2e`) lo auto-carica. Per
  comandi **prisma** sotto `--filter`, passa `DATABASE_URL` esplicito (Prisma non auto-carica il root `.env`), caricandolo
  dal file **senza stamparlo** (il classifier blocca la materializzazione di credenziali). P1002 advisory-lock su `migrate
  deploy` → `pg_terminate_backend(<pid>)` sul lock-holder (`pg_locks` locktype='advisory'). **Questo slice usa migrate → la
  gestione del lock può servire.**
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test` (INCLUDE i 55 di ui-kit → 148); typecheck `--filter web-staff typecheck`. Il "worker
  failed to exit gracefully" di Jest è **rumore di teardown pre-esistente**, non un fallimento.

## 6. Ancore di codice (file:riga, VERIFICATE su `main` `393fe28` — 2026-07-03)
- **Schema:** [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma) — `model Package` **`:203`**,
  `equipment Json @db.JsonB` **`:207`**, `archivedAt` `:208`. (Aggiungere `model EquipmentType` + `model PackageEquipment`;
  relazione inversa su `Establishment` e `Package`.)
- **Contratti:** [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) — `PackageDTO` **`:119`**
  (`equipment: Record<string, number>` **`:122`**); `CreatePackageInput` **`:295-297`**; `UpdatePackageInput` `:301`.
- **DTO:** [`create-package.dto.ts`](../../apps/api/src/catalog/dto/create-package.dto.ts) /
  [`update-package.dto.ts`](../../apps/api/src/catalog/dto/update-package.dto.ts) — solo `@IsObject() equipment`.
- **Projection:** [`package.projection.ts`](../../apps/api/src/catalog/package.projection.ts) — `toPackageDTO` (passa
  `equipment` così com'è).
- **Controller da rispecchiare:** [`packages.controller.ts`](../../apps/api/src/catalog/packages.controller.ts) —
  `@Controller('packages')` **`:7`**, `@Get` `:11`, `@Post` `:16`, `@Patch(':id')` `:21`, `@Post(':id/archive')` `:26`,
  `@Post(':id/restore')` `:31`, `@Delete(':id')` `:36`.
- **FE:** [`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue) — `EQUIP_IT` **`:49-53`**,
  `equipmentLabel` **`:54`**, `openEditPackage` (`p.equipment.sunbeds`) **`:160-165`**, `submitPackage`
  (`{ sunbeds: … }`, il **clobber**) **`:170-175`**, render `equipmentLabel` `:336`/`:365`, campo "Lettini" **`:437`**.
- **Seed:** [`seed.ts:126`](../../apps/api/prisma/seed.ts) (`equipment: { sunbeds: 2, deckchairs: 1 }`);
  [`seed-pricing.ts`](../../apps/api/test/helpers/seed-pricing.ts) (`equipment: { sunbeds: 2 }`, ~`:17-19`).
- **ADR:** crea `docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md`; rimando in
  `0006-dominio-prenotazioni-e-pricing.md`.

## 7. Workflow per lo slice Equipment (ADR-0009) — template provato questa sessione
1. Spec — **fatta** (§3). 2. Decisioni — **risolte** (spec §8). 3. **Piano TDD** — `superpowers:writing-plans` →
   `docs/superpowers/plans/`. 4. **Esegui** — `superpowers:subagent-driven-development`: per ogni layer, implementer (NON
   delega) + task-review (spec ✅ + quality) + fix se Critical/Important, poi **review whole-branch finale (opus)**, **un
   commit per layer**, da un **nuovo branch da `main`**. Traccia i progressi nel ledger `.superpowers/sdd/progress.md` (è
   scratch git-ignored; sopravvive tra i turni ma NON al `git clean -fdx`). 5. **DOPO**: applica migrazione dev+test →
   rebuild container → verifica live (catalogo tipi CRUD; comporre un pacchetto con >1 voce e ri-salvare senza clobber) →
   presenta lo stato all'utente e **attendi conferma** prima dei D-0xx.
   *Nota:* lo slice Pricing di questa sessione è stato eseguito così (implementer sonnet per layer, review sonnet per task,
   review finale opus) — 0 Critical/Important, verde e live-verificato. Usa lo stesso schema.

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare in
dev (password admin container `coralyn-admin-8473`). Per lo slice Equipment ricordati di **applicare la nuova migrazione** a
dev+test dopo il sync.

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice **"Pricing — Abbonamento partizione tipo"** è COMPLETO, MERGIATO su `main` e PUSHATO (partizione dura del
> tipo: abbonamento prezzato solo da tariffe `type='subscription'`; 422 specifico; ADR-0035). Verde su tutti i test (api
> unit 94 · e2e 130 · web-staff 148 · ui-kit 55 · typecheck pulito), review opus 0 Critical/Important, live-verificato
> (quote subscription = €800). Lo slice **"Equipment personalizzato"** ha spec di design **approvata** e committata/pushata
> su `main` (`393fe28`; decisioni risolte con me), **da pianificare ed eseguire**.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Lo slice Equipment RICHIEDE una migrazione (schema+dati) da applicare a dev+test.
> ⚠️ Rebuilda i container prima di testare in dev: `docker compose --profile full up -d --build api web`. DB host
> localhost:5433; password admin container `coralyn-admin-8473`; login dev `admin@coralyn.dev`/`coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-03-equipment-personalizzato-e-sequenza-slice.md` (sequenza §2,
> slice Equipment §3, D-0xx §4, gotcha §5, ancore di codice §6 VERIFICATE, workflow §7), poi la spec
> `docs/specs/2026-07-03-equipment-personalizzato-design.md`, poi ADR-0006 (dominio Ombrellone-pacchetto, che questo slice
> raffina con ADR-0036) e ADR-0009 (workflow).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice "Equipment personalizzato" — entità `EquipmentType`
> (catalogo tenant-scoped: `id, name, archivedAt?`, nome unico per tenant) + join `PackageEquipment` (`@@id([packageId,
> equipmentTypeId])`, `quantity≥1`, `onDelete: Cascade`/`Restrict`); rimuovi `Package.equipment JSONB` con **migrazione dati**
> (`SUM`/`GROUP BY` per l'edge-case dei nomi che collassano); CRUD `equipment-types` mirror di `packages` (archiviazione +
> hard-delete-if-unreferenced); composizione pacchetto validata a set-assoluto (chiude il bug del clobber); FE catalogo +
> compositore multi-riga con creazione al volo, etichetta "2 × Lettino"; nuovo ADR-0036 (raffina ADR-0006). Confine netto
> con **D-012** (equipment ≠ risorsa prenotabile). (2) Poi i D-0xx: **D-034** (forfait periodico, gemello del pricing) e
> **D-012** (cabine/servizi, confina con Equipment); poi D-018/D-015/D-033/D-030. Workflow ADR-0009 per OGNI slice: spec →
> risolvi decisioni con me → piano TDD → subagent-driven (implementer NON delega), un commit per layer, test-first, da un
> NUOVO branch da main. Non regredire i conteggi test (riverificali dal vivo: api unit 94 · e2e 130 · web-staff 148 · ui-kit
> 55).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
