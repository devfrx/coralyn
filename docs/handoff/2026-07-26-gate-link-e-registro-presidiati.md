# Handoff 2026-07-26 (sessione 8): il gate dei link, e il registro che mentiva

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-26 Fase G chiusa, Fase H a metà](2026-07-26-fase-g-chiusa-fase-h-a-meta.md), che resta
> **superato**. Questo documento è **autosufficiente**: gotcha, metodo e regole di ingaggio sono
> dentro, non per rimando.

---

## 0. In una riga

**Le asserzioni sui documenti sono diventate test.** Il checker dei link è un gate
([ADR-0059](../architecture/decisions/0059-gate-link-documenti.md)), `deferred.md` non può più
mentire su cosa resta da fare, e della Fase H restano solo README di `web-staff` e guida deploy.
Tre slice su `main`, spinte, **CI verde su ognuna**.

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
richiedono Postgres. ⚠️ Leggi **[D-066](../architecture/deferred.md#d-066)** prima di fidarti di un
`verify` rosso **e prima di fidarti di uno verde**.

---

## 1. Cosa è stato fatto

| Slice | Commit | Cosa chiude |
|---|---|---|
| **Il gate dei link** | `b3e6047` | l'item «spostare le asserzioni verificabili dai documenti ai test» |
| **L'ottavo bug** | `f344bdd` | il gate era verde in locale e rosso in CI — l'ha trovato la CI, non la fixture |
| **Igiene di `deferred.md`** | `5fb0652` | il registro dichiarava chiuse 6 voci aperte e teneva D-064 sotto «Risolte» |

### 1a. Le cose che la misura ha corretto, e che valgono più delle chiusure

**Sette enunciati su sette sono stati corretti dalla misura**, e tre hanno cambiato il *perimetro*.

| Il documento diceva | La misura ha detto |
|---|---|
| «17 link rotti storici, da mettere in allow-list» | Erano **18**, e ne va dichiarato **1**. Il diciottesimo era nascosto da un bug del misuratore; degli altri, 2 erano riparabili e 15 de-linkabili |
| «la riga di D-037 è un monolito di diecimila caratteri» | **5527**. La più grande è **D-035 con 7256** |
| «`deferred.md`, ~74k caratteri» | **86.853** |
| «≥7 voci chiuse ancora in tabella» | **6** chiuse fra le aperte, **4** aperte fra le chiuse, **2** duplicate |
| «le sette suite lanciate una alla volta sono tutte verdi» (D-066) | ❌ **Falso sotto pressione di memoria**: `--filter @coralyn/api` da solo va in `Zone Allocation failed` |
| «la tabella di `deferred.md` si spezza da D-035 in poi» (mia deduzione dalla specifica GFM) | ❌ Il renderer di GitHub dice: **una tabella sola da 55 righe**, con **11 righe orfane** a quattro colonne vuote. Il difetto c'era, ma era un altro |
| «gli anchor `<a id>` non funzionano su GitHub perché vengono riscritti in `user-content-`» | ❌ Riscritti sì, ma i frammenti risolvono: **verificato cliccando**, da scrollY 0 a 14511 |

### 1b. Le difese nuove, e cosa le rende difese

- **`packages/docs-lint`** — package privato **senza `exports`**, perché nessuno lo importa: non è
  una libreria, è il posto dove vivono le asserzioni sui documenti. Cavalca `pnpm -r test` e
  `pnpm -r typecheck`, quindi **non tocca né `verify` né il workflow della CI**.
- **[`doc-links.spec.ts`](../../packages/docs-lint/src/doc-links.spec.ts)** — nessun link relativo
  rotto oltre a quelli dichiarati; l'allow-list ha **1 voce** e **non può invecchiare** (una voce che
  non risulta più rotta fa rosso). Il repo è passato da **18 link rotti a 1**.
- **[`link-check.spec.ts`](../../packages/docs-lint/src/link-check.spec.ts)** — 43 test che sono i
  casi con cui lo strumento è stato smascherato **otto volte**. È la ragione per cui il gate è un
  package e non uno script: uno `.mjs` alla radice sarebbe lintato ma non typecheckato né testato.
- **[`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts)** — ID
  duplicati, indice discordante dalle voci, anchor mancante, voce chiusa che non dice da cosa: tutto
  rosso. Il parser ha la sua fixture a risposta nota.
- **`deferred.md` ristrutturato** — `## Aperte` (41) / `## Chiuse` (24), un **indice** in testa e un
  **anchor per voce** (`#d-0nn`). Gli anchor sono verificati **gratis dal gate dei link**: togliendone
  uno, la riga d'indice smette di risolvere.

---

## 2. Baseline verde

| Suite | Comando | Ora |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39 file) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 413 (57 file) |
| **`@coralyn/docs-lint`** | `pnpm --filter @coralyn/docs-lint test` | **60** (3 file) |
| api unit | `pnpm --filter @coralyn/api test` | 384 (59 suite) |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 503 (43 suite) |
| tutto insieme | **`pnpm run test`** | exit 0 |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | exit 0, **9 progetti** |

**Totale: 1673 test distinti** (1170 unit/componente + 503 e2e). Erano 1613. **Nessuna suite scende.**

Regola di verifica: il **totale** non scende, ogni calo per-suite è spiegato da una riga della
tabella in [baseline](../audit/2026-07-25-baseline.md), typecheck exit 0, lint non sale sopra 0
errori.

---

## 3. Gotcha

### 3a. Nuovi, verificati in questa sessione

- ⚠️⚠️ **D-066 è più larga di come era scritta, e il modo in cui fallisce è peggio del
  fallimento.** Con **3,7–5,1 GB liberi**, lanciando **una suite alla volta** — cioè con la
  concorrenza fra pacchetti già a 1, la condizione che D-066 dava per verde:

  | Comando | Esito | Il vero numero |
  |---|---|---|
  | `pnpm --filter @coralyn/api test` | `FATAL ERROR: Zone Allocation failed` ×6 → `Test Suites: 26 failed` con **`Tests: 230 passed, 0 failed`** | 384 su 59 suite |
  | `pnpm --filter @coralyn/ui-kit test` | `spawn UNKNOWN` → **117 test in una corsa, 102 nella successiva, stessa revisione** | 212 su **39** file |
  | `pnpm --filter @coralyn/web-staff test` | `Errors 24` → 203 test | 413 su **57** file |

  Con **`--maxWorkers=2`** escono tutte ai numeri di baseline. Tre conseguenze:
  1. **La verifica valida sotto pressione è una suite alla volta *e* con i worker limitati.**
  2. Una suite che non parte contribuisce **zero** test: l'esito somiglia a «suite più piccola ma
     verde», senza un solo rosso. Per `ui-kit` era sbagliato anche il **denominatore** — vitest
     dichiarava 26 e 24 file totali dove sono 39.
  3. `--workspace-concurrency=N` **da solo non chiude D-066**: il moltiplicatore residuo è la
     concorrenza *dentro* ogni runner. La decisione dell'utente riguarda **due assi**.
- ⚠️ **Il gate dei link giudica l'esistenza su `git ls-files`, non sul disco**, e non è un dettaglio
  di stile: il working tree contiene i file **gitignorati**, che su GitHub non esistono. Un link a
  `RUNBOOK.local.md` era verde in locale e ha fatto **rosso il job `static`** al primo push. La
  chiamata è `git ls-files --cached --others --exclude-standard`; `--others` serve perché un
  documento appena scritto e non ancora `git add`-ato dev'essere comunque controllato.
- **Su GitHub gli `id` degli anchor diventano `user-content-…`**, quindi
  `document.getElementById('d-064')` è `false`. I frammenti risolvono lo stesso — **verificato
  cliccando**, non dedotto.
- **Le voci di `deferred.md` dichiarano la chiusura in coda o nell'ultima colonna.** Un filtro sui
  primi caratteri conta male: è successo due volte (4, poi 7, infine **6**). E **D-061 contiene
  «CHIUSA sul piano tecnico» ed è aperta** — per questo il presidio controlla in **una direzione
  sola** (una voce fra le chiuse deve dirlo, mai il contrario).
- **Il log dei job CI non è scaricabile senza token** (403 su
  `/actions/jobs/{id}/logs`). Le **annotation** sì:
  `https://api.github.com/repos/devfrx/coralyn/commits/<sha>/check-runs` → `output.annotations_url`.
  Danno lo step fallito, non l'output: per la causa serve riprodurre.
- **ESLint vieta le literal invisibili in una character class**
  (`no-misleading-character-class`): U+FE0F e compagnia vanno scritte come `\uFE0F`.
- **PowerShell: `node -e` con una stringa che contiene `'\n'` viene bloccato dal sandbox**
  («Remove-Item on system path»), e un patch via shell **raddoppia i backslash**. Per gli script
  monouso: scrivili in un file `.mjs` e lancia `node file.mjs`.
- **Node 24 esegue i `.ts` direttamente** (type stripping), utile per provare un modulo del repo
  senza vitest — ma su Windows l'import assoluto vuole `file:///E:/…`.

### 3b. Ereditati e RI-verificati oggi

- ✅ **`ApiError` viene sempre da `@coralyn/data-layer`**; il presidio è
  [`single-source.spec.ts`](../../packages/data-layer/src/single-source.spec.ts).
- ✅ **`gh` NON è installato**: per la CI usa `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
  La CI gira **solo su `main` e sulle PR** — spingere un branch non la lancia.
- ✅ **Il repo è PUBBLICO.**
- ✅ **`pnpm run test` non è `pnpm run verify`**: il job `static` della CI esegue `lint`, `typecheck`
  e `test` come **step separati** ([verify.yml](../../.github/workflows/verify.yml)). Aggiungere uno
  step a `verify` **non** lo mette in CI.

### 3c. Ereditati, non riaperti oggi — restano validi

- ⚠️ **`forTenant` non accetta più una `string`**: vuole un `TenantId`
  ([`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts)). I punti di produzione che ne
  costruiscono uno sono **quattro**, e
  [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts) fallisce **nominando il file**
  se ne compare un quinto.
- ⚠️ **Togliere il `throw` dell'anti-overlap applicativo in `priceAndWrite` lascia 503/503 verdi, e
  NON è un buco**: il constraint DB dà lo stesso 409. È annotato accanto alla riga — **non
  "correggerlo", non cancellarlo come morto**. La direzione opposta (bloccare troppo) fa 29 rossi.
- **`FORCE ROW LEVEL SECURITY` è il cardine di RLS**: `coralyn_app` è *proprietario* delle tabelle e
  senza `FORCE` Postgres lo esenta. `NO FORCE` su una sola tabella fa cadere 6 test
  ([`rls-isolation.e2e-spec.ts`](../../apps/api/test/rls-isolation.e2e-spec.ts)).
- **Il DB è sulla 5432** (`docker-compose.yml` la pubblica); `coralyn` è superuser e BYPASSRLS,
  `coralyn_app` no — per ispezionare i dati serve `coralyn`, altrimenti RLS ti dà zero righe e la
  verifica **sembra** pulita.
- **Migration sempre `--create-only`, leggile, RLS appesa a mano** — ma solo per tabelle nuove.
  `migrate deploy` va dato su **entrambi** i DB (`coralyn_dev` e `coralyn_test`).
- **e2e `maxWorkers: 1`**, suite di pacchetti diversi **una alla volta**, **calendario e2e congelato
  al 2026-07-15** ([dettagli](2026-07-22-e2e-frozen-calendar.md)).
- **`@IsUUID` è vietato dal lint** → `@IsUuidShape()`. **P2003 → 409, P2025 resta 500 di proposito.**
  Un endpoint nuovo senza `@RequiresPermission` dà 403 (fail-closed) e `authorization-coverage.spec.ts`
  lo intercetta ([ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)).
- **Su template Vue usa `Edit`, non regex**: in `sed` le parentesi sono letterali e mangiano il
  codice. È già successo due volte.
- **`corepack pnpm …` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- Restano validi anche: nome dell'indice non asseribile sotto RLS, il barrel di `ui-kit` e i marker
  per ECharts/Vue Test Utils/`<script setup generic>`, `PasswordHasher` da `CryptoModule`,
  `configureApp` in 37 suite su 42, `coverage.carve.ts` unico posto del carve, i tre `catch`
  dell'EXCLUDE constraint non coperti **di proposito**.

---

## 4. Metodo

### 4a. Regole di ingaggio *(valgono sempre, non solo per la fase in corso)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `systematic-debugging`
  **prima** di proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio,
  dati, flussi o decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- **Le decisioni strutturali sono dell'utente**, e si espongono **prima** di implementare, con
  opzioni e trade-off **reali**. ⚠️ Vale **anche a decisione già presa**: se una misura successiva
  mostra che l'opzione approvata non compra ciò che avevi promesso, **torni da lui con i numeri**.
  ⚠️ **E vale anche al contrario**: se una delle opzioni che hai formulato **non è la migliore
  disponibile**, dillo e proponi la terza via — è successo due volte oggi.
- ⚠️ **Questo utente delega la scelta.** Alle domande strutturali risponde «la soluzione più
  professionale, più coerente e senza debiti e meno pigra». Vuole leggere l'analisi, non fare la
  scelta: **arriva con una raccomandazione argomentata e poi esegui**. «Meno pigra» **non** vuol dire
  più invasiva — lo split di `deferred.md` in due file è stato scartato perché avrebbe reso più caro
  *chiudere* una voce, cioè peggiorava l'atto da incoraggiare.
- **Nessun merge su `main` senza ok esplicito.** Il modo usato: una slice = un branch = un commit
  denso, poi fast-forward e push, con l'ok chiesto ogni volta. Questo **non** è delegato.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Un finding è un'ipotesi, non un verbale.** Misura il **problema** prima di risolverlo.
- **Riproduci prima di correggere, e prova la mutazione nei due versi.** Cancellare l'oggetto prova
  che serve, **degradarlo prova che serve così**. Conta *quanti* e *quali* test diventano rossi.
- **Misura invece di stimare, e dichiara lo scope del conteggio.**
- **Correggi il testo falso, non annotarlo sotto**, e distingui «è sempre stato vero» da «lo è
  diventato». ⚠️ Ma prima chiediti se c'è una **terza via che non tocca l'affermazione**: in 15 casi
  su 18, i link rotti storici avevano il path **già come testo visibile**, quindi togliere il link e
  lasciare il path in `code` conserva la frase byte per byte e fa sparire il 404.
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»** I modelli sono
  [`single-source.spec.ts`](../../packages/data-layer/src/single-source.spec.ts),
  [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts) e ora
  [`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts).
- **Quando una misura è controintuitiva, scrivila nel codice**, non solo nel commit.
- ⚠️ **Verifica con il renderer autoritativo, non con la specifica.** La deduzione dalla specifica
  GFM su `deferred.md` era sbagliata; aprire la pagina su GitHub l'ha corretta in un minuto.

### 4b. Cosa ha pagato

- **Provare lo strumento su casi a risposta nota, prima di credergli.** La fixture ha trovato
  quattro bug del checker in un'ora; senza, sarebbero diventati numeri in un documento.
- **Restringere invece di indovinare.** Il log CI non era scaricabile: la causa è stata trovata
  scartando un'ipotesi con una misura (0 mismatch di case fra git e disco) e poi cercando i target
  `ok` non presenti in `git ls-files` — **esattamente uno**. Applicata la correzione, il rosso della
  CI si riproduceva in locale **prima** di scrivere il fix.
- **Il gate che prende il proprio autore.** Il primo run verde dopo aver scritto ADR-0059 non aveva
  letto ADR-0059 (untracked); e più tardi il gate ha preso il riferimento in avanti a uno spec non
  ancora creato. Un presidio che non prende chi lo scrive non prenderà nessuno.
- **Un'allow-list che non può invecchiare.** Una voce dichiarata e non più rotta fa rosso: è la
  regola che impedisce alla lista di diventare `deferred.md`.

### 4c. Errori miei, da non ripetere

1. **Ho dedotto dalla specifica GFM invece di guardare il rendering**, e la conclusione era più
   grave e sbagliata. Il renderer è a un `navigate` di distanza.
2. **Ho contato le voci chiuse leggendo i primi 700 caratteri**, due volte, mentre la chiusura è
   dichiarata in coda o nell'ultima colonna. E il marcatore da solo non basta: **D-061 dice CHIUSA
   ed è aperta**.
3. **Ho spedito il gate con l'esistenza giudicata sul working tree**, cioè il gate contro i link
   rotti *per chi legge* usava come verità il disco di *chi scrive*. L'ha trovato la CI.
4. **Ho contato 15 spazi a mano** dove ce ne vanno 14: la fixture aveva ragione. Le asserzioni su
   lunghezze si scrivono **calcolate** (`' '.repeat(span.length)`), non contate.
5. **Ho lasciato literal invisibili in una regex** — le ha prese ESLint. In sorgente vanno come
   escape.
6. **`git checkout --` per revertire una mutazione cancella anche le modifiche non committate** dello
   stesso file. Su file già toccati, reverti la sola mutazione (o usa un harness che salva e
   riscrive il contenuto).
7. **Guarda `Test Suites:` insieme a `Tests:`**: una suite che non parte contribuisce **zero** test,
   quindi «230 passed, 0 failed» può voler dire che 26 suite non sono partite.

Il filo comune, ormai misurato su due sessioni: **in quest'area lo strumento si è rotto otto volte e
l'oggetto misurato zero.**

---

## 5. Lavori aperti

### 5.0 Da dove ripartire, e perché in quest'ordine

1. **[D-064](../architecture/deferred.md#d-064)**, se l'utente decide. È l'**unico finding di
   sicurezza dei dati ancora aperto**, ed è l'unico lavoro rimasto che protegga qualcosa invece di
   sistemare qualcosa. ⚠️ Non chiudibile con un decoratore: l'app-shell chiama
   `GET /establishment/overview` a **ogni caricamento** per il nome della stagione attiva, quindi
   serve **separare il payload**, non negare l'endpoint.
2. **Fase H, il residuo**: **README di `web-staff`** e **guida deploy** (§5.2). Piccoli e senza
   decisioni; chiudono la fase.
3. **Poi ciò che era fuori dal piano di proposito**, in ordine di quanto morde:
   - **AUD-015 — l'immagine Docker dell'API è single-stage e gira come root**, con la toolchain di
     sviluppo dentro: 29 advisory, 9 HIGH. I tre Dockerfile web sono già multi-stage: solo l'API no.
     **Urgente il giorno del primo deploy, non prima.**
   - **AUD-022 — `generate` ombrelloni fa 500 INSERT sequenziali** in una transazione col timeout di
     default → P2028 e rollback totale con RTT ≥10 ms. **Regge in dev e si rompe in produzione**,
     cioè sul lido grande in onboarding.
   - **AUD-020 / AUD-021 — prestazioni**: il pre-check anti-overlap carica **tutta** la storia di
     coperture dell'ombrellone (nessun predicato di data), e **non esiste paginazione in tutto lo
     stack** (0 `take`/`skip`/`cursor` su 58 `findMany`). Innocue finché i lidi sono piccoli.
4. **Nessuna di queste è precondizione al deploy tranne AUD-015**, e il deploy non è imminente:
   **non esiste alcun VPS**. ⚠️ Non riaprire l'azione sul `JWT_SECRET` di produzione — è
   **decaduta**, ed è presidiata da `deploy/README.md`.

⚠️ **Prima di aprire una fase nuova**, rileggi il §4a: le regole di ingaggio valgono a prescindere
dalla fase, e il §4c elenca gli errori di metodo già pagati.

### 5.1 Azioni dell'utente

1. **Decidere su [D-064](../architecture/deferred.md#d-064)** — vedi §5.0 punto 1.
2. **Decidere su [D-066](../architecture/deferred.md#d-066)** — ⚠️ **la voce è cambiata dopo che
   gliel'avevamo presentata**: sono **due assi**, non uno. `--workspace-concurrency=N` limita la
   concorrenza *fra* pacchetti; serve anche limitare quella *dentro* ogni runner (jest è a
   `maxWorkers: '50%'`, le vitest non hanno alcun limite). Tocca lo script su cui gira anche la CI.
3. **Bloccanti legali**: **dati societari di Coralyn**, **scelta infrastruttura** (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
4. **Igiene branch** (§5.3).

### 5.2 Fase H — il residuo

- **README di `web-staff`**: non riaperto.
- **Guida deploy**: non riaperta.
- **`Booking.extras`** resta una colonna JSONB morta dichiarata come categoria di dati in 4 documenti
  legali (**P2-010**): tocca testo legale, quindi va con i bloccanti del §5.1.

### 5.3 Igiene del workspace

**Sedici** branch locali oltre a `main`. Non sono tutti uguali.

**Tredici sono contenuti in `main`** (`git branch --merged main`), incluse le tre slice di questa
sessione. Su questi `-d` è sicuro **per costruzione**: rifiuta di cancellare ciò che non è mergiato,
quindi è una verifica oltre che una pulizia.

```bash
git branch -d chore/audit-2026-07-25-d065-data-layer chore/audit-2026-07-25-fase-a-b chore/audit-2026-07-25-fase-c chore/audit-2026-07-25-fase-d chore/audit-2026-07-25-fase-e chore/audit-2026-07-25-fase-f chore/audit-2026-07-25-fase-g1-difese-sicurezza chore/audit-2026-07-25-fase-g2-precedenza-rls chore/audit-2026-07-25-fase-g3-bookings chore/audit-2026-07-26-fase-h-doc chore/audit-2026-07-26-fase-h-gate-link fix/audit-2026-07-26-gate-link-repo-non-disco chore/audit-2026-07-26-igiene-deferred
```

**Tre NON lo sono** — `backup/main-pre-reconcile-20260725`, `feat/legal-d061-d062`,
`docs/handoff-5-6a-ricostruito` — perché sono duplicati **pre-rebase**: gli stessi oggetti stanno in
`main` sotto SHA diversi. Verificato commit per commit: di 22 commit, **21 hanno un oggetto identico
in `main`**; l'unico che non ce l'ha crea una **stesura anteriore** di
`docs/handoff/2026-07-24-privacy-5-6a-mergiata-e-lavori-aperti.md`, file che in `main` esiste in una
versione successiva e diversa (−231/+206 righe). Non si perde lavoro, si perde una stesura. Su questi
`-d` **rifiuta** e serve `-D`: è una forzatura, ed è una scelta dell'utente.

### 5.4 Numeri liberi

**Prossimo ADR libero: 0060.** **Prossima deferred libera: D-067.**

---

## 6. Ancore

- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/)
- **Gate dei documenti**: [ADR-0059](../architecture/decisions/0059-gate-link-documenti.md) ·
  [`link-check.ts`](../../packages/docs-lint/src/link-check.ts) ·
  [`doc-links.allow.ts`](../../packages/docs-lint/src/doc-links.allow.ts) ·
  [`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts)
- **Tenant e RLS**: [`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts) ·
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
- **Handoff precedente**: [2026-07-26 Fase G chiusa](2026-07-26-fase-g-chiusa-fase-h-a-meta.md)
