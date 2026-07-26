# Handoff 2026-07-26 (sessione 7): Fase G chiusa, Fase H a metà

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-25 D-065 eseguita, restano G e H](2026-07-25-d065-eseguita-restano-g-h.md), che resta
> **superato**. Questo documento è **autosufficiente**: metodo e regole di ingaggio sono al §4, non
> più per rimando.

---

## 0. In una riga

**D-065 è mergiata, la Fase G è chiusa (G1, G2, G3), la Fase H è a metà.** Tutto è su `main` e
spinto; la CI è verde su ogni commit. Resta il **residuo di H** e una deferred nuova, **D-066**.

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb && git log --oneline -6 main
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

Poi, in ordine: **§3 (i gotcha)** e **§4 (il metodo)** di questo documento, il
[report d'audit §4](../audit/2026-07-25-audit-completo.md) per lo stato per fase, e
`git log --format=%B -8` per il razionale — **i messaggi di commit di questo repo sono più densi
della documentazione, e non è una figura retorica**.

Il gate è `pnpm run verify` (lint + typecheck + unit); le **e2e sono un comando a parte** e
richiedono Postgres. ⚠️ Leggi **[D-066](../architecture/deferred.md)** prima di fidarti di un
`verify` rosso.

---

## 1. Cosa è stato fatto

| Slice | Commit | Cosa chiude |
|---|---|---|
| **D-065** mergiata | `4017e93` | il package `@coralyn/data-layer` è finalmente su `main` |
| **Fase G1** | `10e92fc` | AUD-024, AUD-026, AUD-028, P6-001, P6-002, P6-010, P6-018, P6-020 |
| **Fase G2** | `4dedbfd` | AUD-025, P6-003, P6-009 |
| **Fase G3** | `77ffd77` | AUD-027, P6-006 |
| **Fase H** (1ª metà) | `297180c` | link markdown, affermazioni false, setup del README, AUD-019 |

### 1a. Le cose che la misura ha corretto, e che valgono più delle chiusure

**Ogni finding è stato riprodotto per mutazione prima di scrivere il test.** Cinque volte su otto
la misura ha cambiato il *perimetro*, non i dettagli.

| Il finding diceva | La misura ha detto |
|---|---|
| AUD-026: «il fake `forTenant` scarta il tenant in 7 spec» | Vero, ma il piano chiudeva **7 servizi su 24**. Gli altri 17 passavano il tenant come `string` e nessuno se ne sarebbe accorto → decisione strutturale (esposta all'utente): tipo **`TenantId`** brandizzato |
| P6-005: «`forTenant` vive in `tenant-context.ts` (18 LOC)» | ❌ Vive in **`prisma.service.ts`**. Il nome era ereditato da un refactor |
| P6-002: «24 e2e restano verdi» | Sono **20**. La sostanza regge, il numero no |
| P6-009: «spegnere RLS su `Booking` lascia tutto verde» | ❌ Il test A→B preesistente la prende già. Probabile che la misura originale usasse i soli unit, dato che allora le e2e non giravano (P6-017) |
| **AUD-027: «1024 LOC, zero unit test» → la radice è nel codice di produzione** | «Zero unit test» è **vero**; «quindi è scoperto» è **falso**: le e2e ne eseguivano il **96,4 %** delle righe e **7 mutazioni su 8** cadono. **L'estrazione approvata è stata annullata dopo averla misurata** |
| Fase H: «67 link rotti in 22 documenti» | Erano **~100**: il misuratore storico contava **solo** i link che iniziano per punto e saltava del tutto quelli nudi (`docs/…`) |
| Fase H: «gli anchor non sono mai stati verificati, il numero vero è più alto» | ❌ **0 rotti** su 2169 link relativi (solo 2 ne hanno uno) |

### 1b. Le difese nuove, e cosa le rende difese

- **`TenantId`** (`apps/api/src/tenant/tenant-id.ts`) — `forTenant` non accetta più una `string`.
  Le due difese si dividono il lavoro, **misurato**: tenant come stringa qualunque → **26 errori di
  compilazione**; `TenantId` valido ma di **altra origine** → 0 errori, **7 test rossi** (il fake che
  asserisce, in `src/test/tenant-prisma.ts`).
- **`tenant-id.spec.ts`** — presidio sul modello di `single-source.spec.ts`: i punti di produzione
  che costruiscono un `TenantId` sono **quattro** (2 produttori: `TenantContext` e
  `CustomerJwtGuard`; 2 deroghe: informativa pubblica e superuser). Un quinto fa rosso e **nomina il
  file**.
- **`rls-isolation.e2e-spec.ts`** — RLS da **1 tabella su 22 in sola lettura** a **22 su 22**, con le
  tabelle **derivate dal catalogo di Postgres**, non elencate a mano.
- **`jwt-auth.guard.spec.ts`**, **`customer-session.service.spec.ts`**,
  **`customer-access.service.spec.ts`** — tre file che non esistevano, su codice che non aveva un
  solo unit test.
- **15 coppie su 15** per la precedenza del pricing, derivate dall'ordine di ADR-0032 §2 **dichiarato
  una volta**.

---

## 2. Baseline verde

| Suite | Comando | Inizio sessione | Ora |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 | 212 |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 | 32 |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 | 23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 | 35 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 413 | 413 |
| **api unit** | `pnpm --filter @coralyn/api test` | 330 | **384** (59 suite) |
| **api e2e** | `pnpm --filter @coralyn/api test:e2e` | 483 (42 suite) | **503** (**43** suite) |
| tutto insieme | **`pnpm run verify`** | exit 0 | **exit 0** |
| lint | `pnpm run lint` | 0 err / 67 warn | 0 err / **87** warn |
| typecheck | `pnpm run typecheck` | exit 0, 8 progetti | exit 0, 8 progetti |

**Totale: 1613 test distinti** (erano 1539). **Nessuna suite scende.**

I **+20 warning** sono i due fake nuovi di G1: stesso idioma di `credential-setup.service.spec.ts` e
coerenti con la decisione di **Fase B** che ha reso `no-explicit-any` un `warn` **negli spec**.
Nessun warning nuovo in produzione. La regola di verifica resta quella del
[§ baseline](../audit/2026-07-25-baseline.md): il **totale** non scende, ogni calo per-suite è
spiegato da una riga, typecheck exit 0, lint non sale sopra 0 errori.

---

## 3. Gotcha

### 3a. Nuovi, verificati in questa sessione

- ⚠️ **`pnpm run verify` va in OOM sotto pressione di memoria** → **[D-066](../architecture/deferred.md)**.
  Con **5,5 GB liberi** dà `FATAL ERROR: Zone Allocation failed`; con **17,9 GB** la **stessa**
  revisione esce 0. **Non è la flake di P6-007** (che è dentro jest ed è corretta): qui è la
  concorrenza **fra pacchetti** (`pnpm -r test` lancia 7 suite insieme). **Se `verify` fallisce con
  `FATAL ERROR` invece che con un test rosso, la verifica valida è lanciare le sette suite una alla
  volta.**
- ⚠️ **`FORCE ROW LEVEL SECURITY` è il cardine di RLS, e nessun test lo guardava.** Le tabelle sono
  di proprietà di **`coralyn_app`**, che è anche il ruolo dell'API, e **Postgres esenta il
  proprietario** senza `FORCE`. Misurato: `DISABLE` su una tabella fa cadere 1 test; **`NO FORCE` su
  una sola ne fa cadere 6**.
- **Il `WITH CHECK` esplicito è ridondante**: per una policy `FOR ALL` Postgres usa l'espressione
  `USING` anche come check sulle righe nuove. La scrittura cross-tenant è sempre stata respinta —
  mancava chi lo dimostrasse. La clausola resta pinnata dal test sul catalogo.
- ⚠️ **Togliere il `throw` dell'anti-overlap applicativo in `priceAndWrite` lascia 503/503 verdi**, e
  **non è un buco**: il constraint DB produce lo stesso 409. È annotato accanto alla riga — **non
  "correggerlo" e non cancellarlo come morto**. La direzione opposta (bloccare troppo) fa 29 rossi.
- **Cancellare una guardia di dominio in `bookings.service.ts` non compila**: i codici d'errore
  formano un'unione tipizzata, quindi togliere un `return { error: 'X' }` rende impossibile
  `e === 'X'` a valle. È mutabile la **condizione**, non l'esistenza.
- **`renew` copia l'ombrellone dalla sorgente**: un rinnovo confermato occupa lo stesso posto, quindi
  l'anti-overlap lancia **prima** che il ciclo della prelazione giri. L'hold con un rinnovo è
  raggiungibile **solo** se il rinnovo è annullato — e la regola che ne discende è che **annullare un
  rinnovo NON consuma la prelazione**.
- **I tre `catch` dell'EXCLUDE constraint non sono coperti e non devono esserlo**: richiedono una
  race vera. Il constraint è coperto a livello DB da `booking-overlap-constraint.e2e-spec.ts`.
- **La porta autoritativa è la 5432**, e ora lo dice anche il codice versionato: `docker-compose.yml`
  pubblica `5432:5432`; la 5433 veniva da un `docker-compose.override.yml` **gitignorato** di
  un'altra macchina. `reset-dev.ts` è corretto (era AUD-019).
- **Il README di root ha ora una sezione «Setup locale»** con i comandi **verificati nel repo**.

### 3b. Ereditati e RI-verificati oggi

- ✅ **`ApiError` viene sempre da `@coralyn/data-layer`**; il presidio è `single-source.spec.ts`.
- ✅ **`@IsUUID` è vietato dal lint** → `@IsUuidShape()`. **P2003 → 409, P2025 resta 500.**
- ✅ **`gh` NON è installato**: per la CI usa `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
  La CI gira **solo su `main` e sulle PR**.
- ✅ **Il calendario e2e è congelato al 2026-07-15** ([dettagli](2026-07-22-e2e-frozen-calendar.md)).
- ✅ **e2e `maxWorkers: 1`**, e suite di pacchetti diversi **una alla volta**.
- ⚠️ **`coralyn` è superuser e BYPASSRLS, `coralyn_app` no** — e ora si sa anche *perché* conta:
  senza `FORCE`, `coralyn_app` sarebbe esente in quanto **proprietario**.

### 3c. Ereditati, non riaperti oggi

Restano validi come scritti nel [§3 dell'handoff precedente](2026-07-25-d065-eseguita-restano-g-h.md):
migration `--create-only` e RLS appesa a mano per tabelle nuove, nome dell'indice non asseribile
sotto RLS, il barrel di `ui-kit` e i marker validi per ECharts, Vue Test Utils e
`<script setup generic>`, `PasswordHasher` da `CryptoModule`, `configureApp` in 37 suite su 42,
`coverage.carve.ts` unico posto del carve, `Edit` invece di regex sui template Vue.

---

## 4. Metodo

### 4a. Regole di ingaggio *(valgono sempre, non solo per la fase in corso)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `systematic-debugging`
  **prima** di proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio,
  dati, flussi o decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- **Le decisioni strutturali sono dell'utente**, e si espongono **prima** di implementare, con
  opzioni e trade-off **reali** — non un'opzione buona e due di paglia. In questa sessione è
  successo tre volte, e due hanno cambiato il piano. ⚠️ Vale **anche a decisione già presa**: se una
  misura successiva mostra che l'opzione approvata non compra ciò che avevi promesso, **torni
  dall'utente con i numeri** invece di eseguirla per coerenza.
- **Nessun merge su `main` senza ok esplicito.** Il modo usato in questa sessione: una slice = un
  branch = un commit denso, poi fast-forward su `main` e push, con l'ok chiesto ogni volta.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto — non
  mascherarlo con un palliativo.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Un finding è un'ipotesi, non un verbale.** Misura il **problema** prima di risolverlo: sette
  enunciati su otto sono stati smentiti in questa sessione, e la misura ha cambiato il *perimetro*,
  non i dettagli.
- **Riproduci prima di correggere, e prova la mutazione nei due versi.** Per un bug provi che il fix
  serve; per un refactor provi che il codice è **scoperto**, degradandolo e guardando se qualcosa
  diventa rosso. Cancellare l'oggetto prova che serve, **degradarlo prova che serve così**.
- **Misura invece di stimare, e dichiara lo scope del conteggio.** Il numero senza lo scope è il
  modo in cui nascono le cifre che poi divergono (`configureApp` in «37 su 42», i link «67»).
- **Correggi il testo falso, non annotarlo sotto**, e distingui sempre «è sempre stato vero» da «lo è
  diventato»: chi rilegge deve poterlo capire senza aprire `git log`.
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»** I modelli sono
  [`single-source.spec.ts`](../../packages/data-layer/src/single-source.spec.ts) e
  [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts).
- **Quando una misura è controintuitiva, scrivila nel codice**, non solo nel commit: è l'unico posto
  dove la leggerà chi sta per "correggere" quella riga.

### 4b. Cosa ha pagato

- **Misura il PROBLEMA, non solo la soluzione.** Sette enunciati di finding su otto sono stati
  corretti dalla misura, e in **due casi** hanno cambiato la decisione: il tipo `TenantId` (che il
  piano non prevedeva) e l'estrazione di `hasOverlapConflict` (che il piano prevedeva e che **non è
  stata fatta**).
- **Riportare all'utente quando l'ipotesi cade, PRIMA di eseguire.** L'estrazione era già stata
  approvata: la misura successiva ha mostrato che non comprava ciò che avevo promesso, e la
  decisione è tornata a lui con i numeri. Costo: un messaggio. Alternativa: un refactor inutile sul
  file più caldo dell'API.
- **La mutazione come prova, nei due versi.** Non basta che la mutazione faccia rosso: conta anche
  *quanti* e *quali* test. Cinque scambi adiacenti nella precedenza del pricing rendono rosso
  **esattamente un** test ciascuno — attribuzione, non strascico.
- **Scrivere la misura NEL CODICE quando è controintuitiva.** «Togliere questo `throw` lascia
  503/503 verdi» è annotato accanto alla riga: è l'unico modo perché il prossimo lettore non la
  cancelli come morta né la "corregga".

### 4c. Errori miei, da non ripetere

1. **Tre mutazioni non compilavano**, e la suite riportava «32 passed» **senza un solo rosso** —
   perché una suite che non transpila contribuisce **zero** test al totale. Stavo misurando il
   compilatore. **Guarda sempre `Test Suites:` insieme a `Tests:`.**
2. **Il primo checker dei link era cieco** su tutti i link scritti senza `./`, cioè su ~32 rotti e
   sull'intero README di root.
3. **Lo slugificatore degli anchor era sbagliato** (`\s+` invece di ` `): GitHub non collassa gli
   spazi consecutivi. Segnalava rotti **due documenti corretti**, e stavo per "correggerli".
4. **`git checkout --` per revertire una mutazione ha cancellato anche modifiche non committate**
   dello stesso file. Su file già toccati, reverti la sola mutazione.

Il filo comune: **tre volte su quattro lo strumento di misura era sbagliato, non l'oggetto misurato.**
Prima di credere a un numero, prova lo strumento su un caso di cui conosci la risposta.

---

## 5. Lavori aperti

### 5.0 Da dove ripartire, e perché in quest'ordine

Il piano E→H dell'audit è quasi esaurito: **restano il residuo di H** e poi ciò che era stato tenuto
**fuori dal piano di proposito**. Ordine consigliato, con la ragione accanto — non è un vincolo, ma
la ragione sì:

1. **Il checker dei link come gate** (§5.2). È piccolo e sblocca il resto: in questa sola sessione ne
   ho introdotti **due io**, e li ha presi lo strumento, non la rilettura. Ogni documento scritto da
   qui in poi senza quel gate è debito nuovo. ⚠️ Tocca `verify`/CI → **decisione da esporre**.
2. **Igiene di `deferred.md`** (§5.2). È il registro che dice cosa resta da fare, ed è illeggibile:
   ~74k caratteri, ≥7 voci chiuse ancora in tabella, la riga di D-037 da sola è un monolito con sette
   livelli di correzione annidati. Il costo non è estetico — **una deferred chiusa per sbaglio è già
   successa**, e nessuno rilegge le voci chiuse.
3. **D-064** (§5.1), se l'utente decide. È l'unico finding di **sicurezza dei dati** ancora aperto.
4. Poi le tre famiglie fuori dal piano, in ordine di quanto mordono:
   - **AUD-015 — l'immagine Docker dell'API è single-stage e gira come root**, con l'intera toolchain
     di sviluppo dentro: 29 advisory, 9 HIGH. I tre Dockerfile web sono già multi-stage: solo l'API
     no. È l'unico residuo che diventa **urgente il giorno del primo deploy**, non prima.
   - **AUD-022 — `generate` ombrelloni fa 500 INSERT sequenziali** in una transazione col timeout di
     default → P2028 e rollback totale con RTT ≥10 ms. **Regge in dev e si rompe in produzione**, cioè
     esattamente sul lido grande in onboarding.
   - **AUD-020 / AUD-021 — prestazioni**: il pre-check anti-overlap carica **tutta** la storia di
     coperture dell'ombrellone (nessun predicato di data), e **non esiste paginazione in tutto lo
     stack** (0 `take`/`skip`/`cursor` su 58 `findMany`). Nessuno dei due morde finché i lidi sono
     piccoli e le stagioni poche.
5. **Nessuna di queste è una precondizione al deploy tranne AUD-015**, e il deploy non è imminente:
   **non esiste alcun VPS**. Non riaprire l'azione sul `JWT_SECRET` di produzione — è **decaduta**,
   ed è già presidiata da `deploy/README.md`.

⚠️ **Prima di aprire una fase nuova**, rileggi il §4a: le regole di ingaggio valgono a prescindere
dalla fase, e il §4c elenca gli errori di metodo che questa sessione ha già pagato.

### 5.1 Azioni dell'utente

1. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le email
   di tutti gli operatori anche allo staff. ⚠️ **Non chiudibile con un decoratore**: l'app-shell chiama
   quell'endpoint a ogni caricamento per il nome della stagione attiva. Serve separare il payload.
2. **Decidere su [D-066](../architecture/deferred.md)**: la correzione (`--workspace-concurrency=N`)
   tocca lo script su cui gira anche la CI, e `N` è un compromesso fra tempo di gate e memoria.
3. Bloccanti legali pregressi: **dati societari di Coralyn**, **scelta infrastruttura** (hosting +
   email → sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️.
4. **Igiene branch** (§5.3).

### 5.2 Fase H — il residuo

- **Il checker dei link come gate.** È l'item «spostare le asserzioni verificabili dai documenti ai
  test», ed è la **radice**: in questa sola sessione ho introdotto io due link rotti, e li ha presi
  lo strumento, non la rilettura. Serve una **allow-list esplicita** per i 17 storici, così un link
  rotto **nuovo** fa rosso e quelli dichiarati no. ⚠️ Tocca `verify`/CI → decisione da esporre.
  Lo script di misura di questa sessione è ricostruibile dal §1a di questo documento; i due bug da
  non rifare sono al §4c.
- **Igiene di `deferred.md`**: ~74k caratteri, ≥7 voci chiuse ancora in tabella. La riga di D-037 è
  da sola un monolito di diecimila caratteri con sette livelli di correzione annidati.
- **README di `web-staff`** e **guida deploy**: non riaperti in questa sessione.
- **`Booking.extras`** resta una colonna JSONB morta dichiarata come categoria di dati in 4 documenti
  legali (**P2-010**): tocca testo legale.

### 5.3 Igiene del workspace

**Tredici** branch locali, e **non sono tutti uguali** — l'handoff precedente li dava in blocco per
«nessuno con lavoro unico» con un `git branch -D` allegato. Misurato oggi, la realtà è in due parti.

**Dieci sono contenuti in `main`** (`git branch --merged main`), incluse le quattro slice di questa
sessione, mergiate in fast-forward e spinte. Su questi `-d` è sicuro **per costruzione**: rifiuta di
cancellare ciò che non è mergiato, quindi è una verifica oltre che una pulizia.

```bash
git branch -d chore/audit-2026-07-25-d065-data-layer chore/audit-2026-07-25-fase-g1-difese-sicurezza chore/audit-2026-07-25-fase-g2-precedenza-rls chore/audit-2026-07-25-fase-g3-bookings chore/audit-2026-07-26-fase-h-doc chore/audit-2026-07-25-fase-a-b chore/audit-2026-07-25-fase-c chore/audit-2026-07-25-fase-d chore/audit-2026-07-25-fase-e chore/audit-2026-07-25-fase-f
```

**Tre NON lo sono** — `backup/main-pre-reconcile-20260725`, `feat/legal-d061-d062`,
`docs/handoff-5-6a-ricostruito` — perché sono duplicati **pre-rebase**: gli stessi oggetti stanno in
`main` sotto SHA diversi. Verificato oggi commit per commit: di 22 commit, **21 hanno un oggetto
identico in `main`**; l'unico che non ce l'ha crea
`docs/handoff/2026-07-24-privacy-5-6a-mergiata-e-lavori-aperti.md`, **file che in `main` esiste in
una versione successiva e diversa** (−231/+206 righe). Quindi non si perde lavoro, ma si perde una
stesura anteriore di quel documento. Su questi `-d` **rifiuta**, e serve `-D`: è una forzatura, ed è
una scelta dell'utente, non un effetto collaterale di una sessione di fix.

### 5.4 Numeri liberi

**Prossimo ADR libero: 0059.** **Prossima deferred libera: D-067.**

---

## 6. Ancore

- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/)
- **Tenant e RLS**: [`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts) ·
  [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts) ·
  [`rls-isolation.e2e-spec.ts`](../../apps/api/test/rls-isolation.e2e-spec.ts) ·
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **Pricing**: [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) ·
  [ADR-0035](../architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md) ·
  [ADR-0037](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md)
- **Data-layer condiviso**: [ADR-0058](../architecture/decisions/0058-package-data-layer-condiviso.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-25 D-065](2026-07-25-d065-eseguita-restano-g-h.md)
