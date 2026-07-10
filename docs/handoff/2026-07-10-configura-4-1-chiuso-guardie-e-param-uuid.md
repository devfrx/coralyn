# Handoff — §4.1 «Configura» CHIUSO (root cause = UUID legacy non-v4) + hardening guardie/param · prossimi

> **Data:** 2026-07-10 · **Autore sessione:** agente §4.1.
> **TL;DR:** l'**ultimo difetto §4** — §4.1 «Configura» struttura — è **chiuso**. Root cause (riprodotta):
> **NON è un bug su dati validi**; i fallimenti storici erano **dati legacy con UUID non-v4** che sbattevano sui
> validatori `@IsUUID()` dei body dell'editor → **400**. In produzione gli id nascono `@default(uuid())` = **v4**
> (non riproducibile); il seed dev era già stato corretto a id v4 → mancava solo ri-testare su dati freschi.
> Aggiunti **due fix professionali (TDD, branch `fix/configura-4-1-guardie-e-param-uuid`, NON ancora mergiato)**:
> (1) **messaggi di guardia delete specifici** per settore/fila (l'OR ambiguo «…o in uso da tariffe» depistava);
> (2) **`ParseUUIDPipe`** sui `:id` di PATCH/DELETE dei 4 controller struttura → **400** pulito invece di **500**
> (`P2023`). **Nessun nuovo ADR** (error-surface + validazione). Verificato LIVE su Docker.

---

## 1. Stato `git` & baseline

- **`origin/main` = `e488d82`**. Su `main` locale: 2 commit **docs-only** avanti (`5781aea` handoff §4.3/§4.b + `bb47cfd`
  footgun reseed) **non pushati** — innocui, in attesa del tuo OK per il push.
- **Branch di lavoro `fix/configura-4-1-guardie-e-param-uuid`** (da `bb47cfd`): 2 commit (`66c3848` messaggi,
  `909a79a` ParseUUIDPipe). **In attesa di OK esplicito per FF-merge su `main` e per il push** (entrambi gated).
- **Baseline (post-fix, verde):** api unit **229** (era 227, +2) · api e2e **317** (era 309, +8; `--runInBand
  --testTimeout=30000`) · web-staff **375** (invariato) · typecheck api `tsc` pulito · FE non toccato (vue-tsc invariato).
- **Password admin dev = `admin@coralyn.dev` / `coralyn-admin-8473`** (impostata da una sessione parallela, vedi §3;
  passa `DEV_ADMIN_PASSWORD=coralyn-admin-8473` a ogni reseed-da-host per non ri-clobberarla). Il seed di default
  userebbe `coralyn-admin`.

## 2. Cosa è stato fatto

### Diagnosi §4.1 (systematic-debugging, riprodotta)
Su **dati puliti**, l'editor «Configura» funziona interamente — verificato LIVE via UI (crea/modifica/elimina
settore·fila·ombrellone·tipologia + guardie 409 + invalidation, zero errori console) e via API. I fallimenti storici
(«create/modifica di entità esistenti non funzionavano») erano **dati legacy con UUID non-v4**: i DTO validano gli id
nei **body** con `@IsUUID()` (default = versioni 1–5). Un id legacy `…-0000-0000-…` (nibble di versione `0`)
**fallisce → 400** su `CreateRow.sectorId` / `CreateUmbrella.rowId`+`umbrellaTypeId` / `GenerateUmbrellas.rowId` /
`UpdateUmbrella.umbrellaTypeId`. Le entità **nuove** nascono v4 (`@default(uuid())`) → passano: firma esatta
"esistenti falliscono, nuove no". **Riprodotto in laboratorio:** inserito un settore con id non-v4 → `POST /rows`
con quel `sectorId` → **400 "sectorId must be a UUID"**; su settore v4 → **201**. In produzione mai riproducibile
(id sempre v4); il commento del seed documenta già la correzione a id v4. **Nessun codice da "fixare" sul cammino
principale** — il difetto era dato-legacy, già risolto dal seed v4.

### Fix 1 — messaggi di guardia delete specifici (`66c3848`)
`sectors.service.remove` e `rows.service.remove` usavano un messaggio **OR combinato** («Settore non vuoto **o** in
uso da tariffe») che non diceva quale condizione bloccasse → un settore con file ma senza tariffe riportava comunque
"in uso da tariffe" (depistante). Ora nomina il motivo reale: «Il settore contiene delle file: eliminale prima.» /
«…è usato da tariffe: rimuovile prima.» / combinato; idem per le file (ombrelloni/tariffe). Solo error-surface (409
invariato). Unit test per ogni condizione. **NB:** le tariffe **"Tutti"** (`sectorId = null`) **non** bloccano — la
guardia conta solo `sectorId = <settore>` (verificato LIVE: settore vuoto si elimina anche con catch-all presenti).

### Fix 2 — `ParseUUIDPipe` sui `:id` struttura (`909a79a`)
I `:id` di PATCH/DELETE dei 4 controller (`sectors`/`rows`/`umbrellas`/`umbrella-types`) non erano validati: un id
malformato raggiungeva Prisma → **500** (`P2023`). Aggiunto `ParseUUIDPipe` (default = versioni 1–5, **stessa
semantica** di `@IsUUID()` dei body) → **400** pulito. e2e: 8 casi (PATCH+DELETE × 4 controller). Coerente con la
filosofia di **[D-041]** (mapping errori Prisma → status puliti). **Trade-off tracciato:** ora anche PATCH/DELETE su
id legacy non-v4 danno 400 (prima passavano); è coerente (invariante = v4) e i dati legacy si puliscono col reseed,
non a mano dalla UI.

**Verifica LIVE (Docker, container `api` ricostruito):** id malformato → 400 · DELETE settore-con-file → nuovo
messaggio · **toast corretto mostrato nella UI** (screenshot in sessione). **DoD [ADR-0009]:** nessun cambio a
modello/flusso/macchina-a-stati/direzione-UI → nessun design doc, nessun nuovo ADR, nessuna voce `deferred.md`
(l'asimmetria param è **risolta**, non deferita).

## 3. GOTCHA / lezioni

- **⚠️ DB `coralyn_dev` e working tree CONDIVISI tra sessioni/agenti.** Durante la sessione un **altro agente**
  (invocato per errore) ha resettato il DB e **cambiato la password admin** (`coralyn-admin` → `coralyn-admin-8473`),
  e ha lasciato dati fantasma (ombrelloni 40–48 nel tenant dev). Debug su bersaglio mobile → **prima ristabilire uno
  stato noto** (reset+reseed) e verificare che nessun altro processo scriva. I nostri e2e **non** scrivono nel tenant
  dev (`grep` di `0000…0001` in `test/` = 0) → la contaminazione era d'ambiente, non un difetto d'isolamento.
- **RLS FORCE maschera psql** ([[coralyn-dev-preview-env]]): `SELECT count(*)` da psql **senza** GUC
  `app.current_tenant` torna **0** anche se le righe esistono (falso zero). Conta con
  `SET app.current_tenant='…'` o via API (tenant dal JWT). Il dry-run del reset usa `n_live_tup` per lo stesso motivo.
- **Reseed-da-host clobbera la password admin** (footgun `bb47cfd`): il main seed fa `update: { passwordHash }` con
  `DEV_ADMIN_PASSWORD ?? 'coralyn-admin'`. Passa sempre `DEV_ADMIN_PASSWORD=<quella corrente>` per non romperla.
- **Cache TanStack stantìa nel browser:** dopo un reset del DB il browser mostrava ancora la struttura vecchia (la
  mappa/editor serviti da cache). `navigate` (reload) svuota; verifica lo stato reale via API, non dallo screenshot.
- **UUID non-v4 e `@IsUUID()`/`ParseUUIDPipe`:** entrambi (default, no versione) accettano solo v1–5. Gli id v4 di
  Prisma passano sempre; solo id hand-crafted/legacy non-v4 falliscono. Non allentare a "any" — sarebbe sbagliato.
- **Vite dev :5173** serve il FE da sorgente (HMR) ma **proxy `/api` → container `:3000`**: per vedere LIVE un cambio
  **backend** nel browser va **ricostruito il container** `api` (`docker compose --profile full up -d --build api`);
  il FE invece è immediato.

## 4. Prossime priorità (da decidere con l'utente)

Con §4.1 chiuso, **tutti i difetti §4 sono chiusi**. Resta:
- **D-035 S3 → S4** (canale cliente self-service): **S3** = auth/identità cliente (il `Customer` non ha login) + la
  **decisione strutturale del TENANT-ROUTING PUBBLICO** che oggi non esiste (sottodominio/path/QR) — atterrano
  [D-026]/[D-027]/[D-028]/[D-029]. **S4** = PWA/QR release (riusa S2 hardened, `AbsenceRelease.source='customer'` già
  predisposto) + [D-037]. **Decisione più pesante del modulo → aprire con gate review + brainstorming OBBLIGATORIO.**
  Invariante: rivendita SOLO su release esplicita, zero cassa sull'abbonato ([ADR-0048]).
- **Backlog `deferred.md`:** [D-049] (testTimeout e2e, one-line) · [D-036] report avanzato · **[D-040]** estrazione
  `EstablishmentStructureView.vue` (~406 righe, ora che l'editor è "chiuso" è un buon momento) / [D-038] drag-reorder ·
  [D-047] audit admin · [D-041] filtro globale Prisma → status puliti (il ParseUUIDPipe di questa sessione copre il
  P2023 sui param struttura; il P2002→409 globale resta) · [D-012] cabine (**l'utente lo ritiene poco utile — NON
  partire senza sua riconferma**).

## 5. Metodo (replicare)
Gate review spec → (**brainstorming** se modulo/decisione strutturale — **obbligatorio per S3**) → **writing-plans**
(TDD) → **subagent-driven** (implementer col modello per costo/rischio + review a due stadi + whole-branch opus) →
**verifica LIVE su Docker** → **presentare e attendere OK esplicito** per il merge FF **e** per il push (entrambi con
ok utente). Preferenza utente: nelle scelte "coerente vs scorciatoia" sempre la soluzione **professionale/senza-debiti**.

## 6. Riferimenti
- Handoff precedente: [2026-07-10-payments-4-3-e-reset-db-4-b-chiusi-e-prossimi.md](2026-07-10-payments-4-3-e-reset-db-4-b-chiusi-e-prossimi.md).
- Spec §4.1: [2026-07-04-stabilimento-configura-struttura-design.md](../superpowers/specs/2026-07-04-stabilimento-configura-struttura-design.md).
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] · Assenze [ADR-0048].

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-036]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
[D-038]: ../architecture/deferred.md
[D-040]: ../architecture/deferred.md
[D-041]: ../architecture/deferred.md
[D-047]: ../architecture/deferred.md
[D-049]: ../architecture/deferred.md
