# Handoff 2026-07-26 (sessione 9): il piano d'audit è chiuso, e la prossima sessione è su un'altra macchina

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-26 il gate dei link e il registro](2026-07-26-gate-link-e-registro-presidiati.md), che resta
> **superato**. Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio
> sono dentro, non per rimando.

---

## 0. In una riga

**Tutte le fasi del piano d'audit sono chiuse** (A→H), e con loro le tre voci che restavano decisioni
dell'utente: D-064 (PII), D-066 (fragilità del gate) e il residuo di Fase H. Quattro slice su `main`,
spinte. ⚠️ **La prossima sessione gira su una macchina diversa**: il §1 è la sola parte da leggere
prima di toccare qualsiasi cosa.

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb && git log --oneline -6 main
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

Poi, in ordine: **§1 (la macchina nuova)**, **§4 (i gotcha)** e **§5 (il metodo)** di questo
documento, il [report d'audit §4](../audit/2026-07-25-audit-completo.md) per lo stato per fase, e
`git log --format=%B -6` per il razionale — **i messaggi di commit di questo repo sono più densi
della documentazione, e non è una figura retorica**.

---

## 1. ⚠️ Macchina nuova: cosa serve prima di poter verificare qualsiasi cosa

Questa è la sezione che l'audit chiedeva da tempo (**P7-007**: «il setup locale non è ricostruibile
dal repo») e che finora viveva solo in `RUNBOOK.local.md`, **che è gitignorato e quindi non arriva
sulla macchina nuova**.

### 1a. I file da portarsi dietro a mano

Sono **cinque**, tutti gitignorati. Nessuno di questi è nel repo, e nessuno è ricostruibile senza i
valori:

| File | Template versionato | Nota |
|---|---|---|
| `.env` | ✅ [`.env.example`](../../.env.example) | completo e commentato |
| `apps/api/.env` | ⚠️ **nessuno** | è **byte-identico a `.env`**: copia lo stesso file due volte |
| `.env.test` | ✅ [`.env.test.example`](../../.env.test.example) | |
| `apps/web-staff/.env` | ✅ [`apps/web-staff/.env.example`](../../apps/web-staff/.env.example) | |
| `RUNBOOK.local.md` | — | ⚠️ vedi §1d: è **stantio**, non fidartene alla lettera |

⚠️ **Perché `apps/api/.env` esiste ed è un duplicato**: `ConfigModule.forRoot({ isGlobal: true })`
non passa `envFilePath`, quindi dotenv risolve `.env` dalla **cwd del processo** — e
`pnpm --filter @coralyn/api …` mette la cwd in `apps/api/`. Il file di root **non viene letto**
quando l'API parte così. Tienili allineati, o l'API leggerà valori diversi da quelli che credi.

⚠️ **I valori dev (password di `admin@coralyn.dev` e `super@coralyn.dev`, `JWT_SECRET` locale) NON
sono in questo documento e non devono finirci: il repo è PUBBLICO.** Copiali dalla macchina vecchia
o richiedili all'utente. I template hanno segnaposto `change-me`.

### 1b. La sequenza che porta a un `verify` verde

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @coralyn/contracts build
pnpm --filter @coralyn/api exec prisma generate
```

⚠️ **`prisma generate` PRIMA del typecheck**, sempre: senza, i tipi del client non esistono e l'API
fallisce con TS7006. `corepack pnpm …` può cancellare il client Prisma — se il typecheck comincia a
dire cose assurde sull'API, rigeneralo.

### 1c. Docker, il database e le e2e

```bash
docker compose up -d          # db su 5432, mailpit su 1025/8025
docker compose ps             # tutti healthy prima di proseguire
```

Poi le migration su **entrambi** i database — dimenticare `coralyn_test` è il modo più comune di
vedere 43 suite rosse per niente:

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_test?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
```

- **La porta è la 5432.** `docker-compose.yml` la pubblica, e i tre `.env` locali sono allineati. Il
  disallineamento su 5433 che l'audit descriveva (P7-007) **è risolto**; se lo rivedi, viene dal
  runbook stantio, non dal repo.
- `coralyn` è superuser e **BYPASSRLS**, `coralyn_app` no. Per **ispezionare i dati** serve
  `coralyn`: con `coralyn_app` l'RLS ti dà zero righe e la verifica *sembra* pulita.
- **e2e `maxWorkers: 1`** (un solo DB condiviso: non è una preferenza, è un requisito, ed è scritto
  in `jest-e2e.json`), suite di pacchetti diversi **una alla volta**, **calendario e2e congelato al
  2026-07-15** ([dettagli](2026-07-22-e2e-frozen-calendar.md)).

### 1d. `RUNBOOK.local.md` è stantio: non fidartene alla lettera

Misurato in questa sessione, il runbook della macchina vecchia dichiara:
- **porta 5433** per il database → è la **5432** (compose e `.env` concordano);
- una tabella di conteggi test di un'era precedente (`web-staff 608/608`, `api 278/278`) → i numeri
  veri sono al §3.

È utile per il *perché* delle cose (spiega bene il doppio `.env`), inaffidabile per i *numeri*.

### 1e. Il resto dell'ambiente

- **`gh` NON è installato**, e non serve: per la CI usa
  `https://api.github.com/repos/devfrx/coralyn/actions/runs`. ⚠️ Il **log dei job non è scaricabile
  senza token** (403); le **annotation** delle check-run sì
  (`/commits/<sha>/check-runs` → `output.annotations_url`), ma danno lo step, non l'output: per la
  causa devi **riprodurre**.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- **Il repo è PUBBLICO.**
- ⚠️ **Concorrenza CI**: il workflow ha `cancel-in-progress: true` sul gruppo `verify-<ref>`. Due
  push ravvicinati su `main` **cancellano il run precedente**: in questa sessione il run di
  `486e055` risulta `cancelled` per questo, non per un guasto. Guarda sempre l'ultimo run.

---

## 2. Cosa è stato fatto

| Slice | Commit | Cosa chiude |
|---|---|---|
| **D-064** — le email fuori dal payload dello shell | `4c19d6f` | l'unico finding di sicurezza dei dati ancora aperto ([ADR-0060](../architecture/decisions/0060-read-model-shell-senza-pii.md)) |
| **Fase H, il residuo** | `7e9b525` | README di `web-staff` (P8-010) e guida deploy (P8-011) → **il piano d'audit è chiuso** |
| **D-066** — il tetto ai worker | `486e055` | la fragilità del gate ([ADR-0061](../architecture/decisions/0061-tetto-worker-runner-test.md)) |
| **Coda di D-064** | `1422d09` | un guasto che avevo reso muto io, trovato da una review indipendente |

### 2a. Le cose che la misura ha corretto, e che valgono più delle chiusure

| Il documento diceva | La misura ha detto |
|---|---|
| D-064: «il link è nascosto dal menu ma l'URL è raggiungibile» | ❌ Il bottone col nome del lido in `SidebarNav.vue` è **incondizionato**: lo staff ci arrivava con **un click** |
| D-064: «serve un endpoint distinto sotto `team.manage`» | ✅ ma il posto **esisteva già**: a `establishment-users.controller.ts`, tutto sotto `TeamManage`, mancava solo il `GET` |
| D-066: «basta `--workspace-concurrency=N`» | ❌ Da solo vale **−15 % di memoria per +33 % di tempo**, e sul caso che falliva — **un pacchetto solo** — non ha nulla da limitare |
| «l'OOM è la concorrenza fra pacchetti» | ❌ `ui-kit` **da sola** fa **5.338 MB** con 39 processi, più della RAM libera dello scenario |
| ADR-0059: «il numero manca, e non è stato sostituito da una stima» | ✅ ora c'è, ed è **zero**: il picco cade a t=27÷32 s, `docs-lint` muore a t≈1 s |
| Report d'audit: «Tutto il resto: APERTO — fasi G e H» | ❌ entrambe chiuse |
| Report d'audit: D-065 «su branch, **non mergiata**: serve l'ok dell'utente» | ❌ è su `main` da un giorno. Una riga che chiede un'azione **già fatta** è peggio di una stantia |

---

## 3. Baseline verde

| Suite | Comando | Ora |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1 file) |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39 file) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5 file) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7 file) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7 file) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **415** (57 file) |
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | **68** (5 file) |
| api unit | `pnpm --filter @coralyn/api test` | 385 (59 suite) |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 506 (43 suite) |
| tutto insieme | **`pnpm run test`** | exit 0, **1181** unit su 180 file/suite |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | exit 0, **9 progetti** |

**Totale: 1687 test distinti** (1181 unit/componente + 506 e2e). Erano 1673. **Nessuna suite scende.**

Regola di verifica: il **totale** non scende, ogni calo per-suite è spiegato da una riga della
tabella in [baseline](../audit/2026-07-25-baseline.md), typecheck exit 0, lint non sale sopra 0
errori.

⚠️ **Le 506 e2e non sono state rilanciate in locale a fine sessione**: il daemon Docker è caduto
(vedi §4a) e Postgres non rispondeva. **La verifica c'è ed è autoritativa**: il run CI su `1422d09`
è **verde su entrambi i job**, `static` **e** `e2e` — quest'ultimo con un Postgres proprio, il ruolo
`coralyn_app` NOSUPERUSER NOBYPASSRLS e le migration applicate, cioè la configurazione in cui RLS è
davvero in vigore.

---

## 4. Gotcha

### 4a. Nuovi, verificati in questa sessione

- ⚠️⚠️ **Il tetto ai worker adesso c'è, ma cambia come si legge un tempo.** `pnpm run test` è passato
  da ~36 s a **61÷88 s**, e il tempo è **instabile fra corse** mentre il picco di memoria non lo è
  (3.737÷4.099 MB su tre corse). **Non usare il gate completo per misurare regressioni di durata**:
  per quelle serve il confronto per pacchetto.
- ⚠️ **Python su Windows traduce `\n` in `\r\n` quando scrivi in text mode.** Uno script con
  `io.open(p,'w',encoding='utf-8')` ha riscritto **7 `vitest.config.ts` in CRLF**, rendendoli gli
  unici file di testo del repo con un CR e contraddicendo `.editorconfig`. Non l'ha visto nessuno
  fino alla review. **Per riscrivere file usa Node (`fs.writeFileSync`) o lo strumento Edit.**
- ⚠️ **Python via heredoc su questa shell legge/scrive in cp1252**: un `print` con `→` esplode con
  `UnicodeEncodeError`, e un `replace` che contiene accenti o frecce **non matcha**. Per il testo con
  caratteri non-ASCII usa **Edit**, non uno script.
- ⚠️ **PowerShell: l'operatore `-f` con `N0`/`N1` è locale-dipendente.** Un campionatore che
  formattava così riportava «56 MB» dove ce n'erano 9.862 e «493 MB liberi» dove ce n'erano 14.500.
  Scrivi interi concatenati a mano. **E prova lo strumento su un caso a risposta nota prima di
  credergli**: venti secondi contro un giro di misure buttato.
- ⚠️ **`deferred.md` era l'unico file del repo con line ending CRLF**, misti (202 CRLF + 133 LF).
  Normalizzarlo ha prodotto un diff di **453 righe per uno spostamento di 35**. Se un diff su quel
  file sembra enorme, guarda `git diff -w` prima di allarmarti.
- ⚠️ **Il parser di `deferred-registry.ts` tratta OGNI riga `- **D-0NN**` come una voce nuova.**
  Conservare il testo storico di una voce chiusa come bullet separato crea un ID duplicato → 3 rossi.
  Va **indentato** come continuazione della stessa voce.
- ⚠️ **La riga di riepilogo «Aperte: N · Chiuse: N» in testa a `deferred.md` non è una riga di
  tabella**, quindi il parser non la vedeva e divergeva a ogni chiusura. Ora è **agganciata al
  conteggio** da un test.
- **`availableParallelism()` rispetta l'affinità di processo su Windows** (4 sotto maschera, mentre
  `cpus().length` dice 32). È il modo per **simulare il runner CI** senza CI:
  `$p.ProcessorAffinity = 15`. Misurato così: a 4 core la formula dà **2 worker**, e `apps/api` col
  tetto nuovo e col vecchio `50%` esce **identica** (7,0 s · 59 suite · 385 test).
- **`@RequiresPermission` di metodo scavalca quello di classe** (verificato per mutazione).
- **`pnpm --filter X test -- --flag` passa `--` come argomento letterale** a jest, che poi non trova
  test. Va senza `--`.
- **Le e2e girano in CI**, in un job separato con Postgres. L'handoff precedente diceva «le e2e non
  sono dentro verify: comando a parte» — vero per lo script locale, **non** vuol dire fuori dalla CI.
- ⚠️ **Il daemon Docker può cadere a metà sessione** senza che nulla lo annunci: le e2e diventano 43
  suite rosse con `Can't reach database server at localhost:5432`. Prima di diagnosticare un rosso
  e2e, `docker ps`.

### 4b. Ereditati e RI-verificati oggi

- ✅ **`ApiError` viene sempre da `@coralyn/data-layer`**; presidio
  [`single-source.spec.ts`](../../packages/data-layer/src/single-source.spec.ts).
- ✅ **`gh` NON è installato**; **la CI gira solo su `main` e sulle PR**; **il repo è PUBBLICO**.
- ✅ **`pnpm run test` non è `pnpm run verify`**: il job `static` esegue `lint`, `typecheck` e `test`
  come step **separati** ([verify.yml](../../.github/workflows/verify.yml)).
- ✅ **Su template Vue usa `Edit`, non regex**: in `sed` le parentesi sono letterali e mangiano il
  codice.

### 4c. Ereditati, non riaperti oggi — restano validi

- ⚠️ **`forTenant` non accetta più una `string`**: vuole un `TenantId`
  ([`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts)). I punti di produzione sono **quattro**,
  e [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts) fallisce **nominando il file**
  se ne compare un quinto.
- ⚠️ **Togliere il `throw` dell'anti-overlap applicativo in `priceAndWrite` lascia 506/506 verdi, e
  NON è un buco**: il constraint DB dà lo stesso 409. È annotato accanto alla riga — **non
  "correggerlo", non cancellarlo come morto**. La direzione opposta (bloccare troppo) fa 29 rossi.
- **`FORCE ROW LEVEL SECURITY` è il cardine di RLS**: `coralyn_app` è *proprietario* delle tabelle e
  senza `FORCE` Postgres lo esenta. `NO FORCE` su una sola tabella fa cadere 6 test.
- **Migration sempre `--create-only`, leggile, RLS appesa a mano** — solo per tabelle nuove.
- **`@IsUUID` è vietato dal lint** → `@IsUuidShape()`. **P2003 → 409, P2025 resta 500 di proposito.**
  Un endpoint nuovo senza `@RequiresPermission` dà 403 (fail-closed) e
  `authorization-coverage.spec.ts` lo intercetta.
- **Il gate dei link giudica l'esistenza su `git ls-files`, non sul disco**: un link a un file
  gitignorato è verde in locale e **rosso in CI**. È già successo con `RUNBOOK.local.md`.
- Restano validi anche: nome dell'indice non asseribile sotto RLS, il barrel di `ui-kit` e i marker
  per ECharts/Vue Test Utils/`<script setup generic>`, `PasswordHasher` da `CryptoModule`,
  `configureApp` in 37 suite su 42, `coverage.carve.ts` unico posto del carve, i tre `catch`
  dell'EXCLUDE constraint non coperti **di proposito**.

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre, non solo per la fase in corso)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `systematic-debugging`
  **prima** di proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio,
  dati, flussi o decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- ⚠️ **Questo utente delega la scelta strutturale.** Alle domande risponde «la soluzione più
  professionale, più coerente e senza debiti e meno pigra»: vuole leggere l'analisi, non farla.
  **Arriva con una raccomandazione argomentata e poi esegui.** «Meno pigra» **non** vuol dire più
  invasiva. ⚠️ E se una delle opzioni che hai formulato **non è la migliore disponibile**, dillo e
  proponi la terza via — in questa sessione è successo di nuovo, ed era la scelta giusta due volte
  su due (D-064: non gatare la rotta ma renderla innocua; D-066: non toccare lo script condiviso).
- **Nessun merge su `main` senza ok esplicito.** Una slice = un branch = un commit denso, poi
  fast-forward e push, con l'ok chiesto **ogni volta**. Questo **non** è delegato.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Un finding è un'ipotesi, non un verbale.** Misura il **problema** prima di risolverlo: in questa
  sessione la misura ha corretto **sette** enunciati, e due hanno cambiato la soluzione.
- **Riproduci prima di correggere, e prova la mutazione nei due versi**, contando *quanti* e *quali*
  test diventano rossi.
- **Misura invece di stimare, e dichiara lo scope del conteggio.** ⚠️ E **dichiara la varianza**: se
  due corse della stessa configurazione danno 4.099 e 3.737 MB, una differenza di 63 MB non è una
  misura, è rumore — e presentarla come prova di rigore è peggio di ammettere che il numero manca.
- **Correggi il testo falso, non annotarlo sotto**, e distingui «è sempre stato vero» da «lo è
  diventato». ⚠️ Ma prima chiediti se c'è una **terza via che non tocca l'affermazione**.
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»** I modelli sono `single-source.spec.ts`,
  `tenant-id.spec.ts`, `deferred-registry.spec.ts` e ora
  [`test-workers.spec.ts`](../../packages/docs-lint/src/test-workers.spec.ts) e
  [`deploy-guide.spec.ts`](../../packages/docs-lint/src/deploy-guide.spec.ts).
- **Quando una misura è controintuitiva, scrivila nel codice**, non solo nel commit.
- ⚠️ **Verifica con il renderer/strumento autoritativo, non con la specifica.**

### 5b. Cosa ha pagato

- **La review avversariale indipendente.** Cinque lenti in parallelo, ogni finding passato a **due**
  scettici (uno sui fatti, uno sull'impatto): 23 finding, 10 sopravvissuti, **6 difetti reali** che
  la rilettura non aveva visto — di cui **3 introdotti da me nella stessa sessione** e **2 buchi nel
  presidio che avevo appena scritto**. Nessuno bloccava il merge, e tutti valevano la correzione.
- **Provare lo strumento su casi a risposta nota, prima di credergli.** Il campionatore sbagliato
  avrebbe prodotto una tabella di numeri falsi in un ADR.
- **Simulare l'ambiente che non hai.** L'affinità di processo ha trasformato «sul runner CI la
  formula dà 2» da aritmetica a misura, e ha chiuso il buco di copertura più grosso della review.
- **Il presidio che prende il proprio autore.** Il registro delle deferred ha bocciato il mio stesso
  spostamento di D-066 (ID duplicato, anchor mancante, chiusura non dichiarata: 3 rossi).

### 5c. Errori miei, da non ripetere

1. **Ho lavorato su `main` invece che su un branch** dopo un merge. Accorto prima del commit e
   spostato, ma la regola è: **dopo un merge, crea il branch PRIMA di toccare i file.**
2. **Ho creduto a un campionatore senza validarlo** — un giro di misure buttato.
3. **Ho spostato una voce del registro senza leggere il parser**: il presidio mi ha preso.
4. **Ho scritto file con Python su Windows** e introdotto CRLF in 7 file, nella stessa sessione in
   cui avevo *corretto* lo stesso difetto altrove.
5. **Ho scritto un'affermazione falsa per aritmetica in un ADR** («cinque e sette file non
   raggiungono un tetto di quattro»), in un documento che nel Rubric check dichiara che nessun numero
   è stimato.
6. **Ho sostituito una lacuna dichiarata onestamente con un numero che era rumore** (i «63 MB»).
7. **Ho reso muto un guasto separando una query**, reintroducendo AUD-012 su una superficie appena
   creata: la card mostrava «Nessun utente nel team» su errore di rete.
8. **Ho scritto due presidi con un buco ciascuno**: una regex senza confine a destra e un perimetro
   derivato dai nomi dei file invece che dai pacchetti.

Il filo comune, ormai misurato su tre sessioni: **in quest'area lo strumento si è rotto nove volte e
l'oggetto misurato zero.** Il corollario nuovo: **anche il presidio è uno strumento**, e va provato
per mutazione con la stessa diffidenza.

---

## 6. Lavori aperti

### 6.0 Da dove ripartire, e perché in quest'ordine

1. **Rimetti in piedi l'ambiente** (§1) — senza, non puoi verificare niente. Il criterio di
   «rimesso in piedi» è: `pnpm run test` exit 0 con **1181** test su **180** file/suite, e
   `pnpm --filter @coralyn/api test:e2e` a **506 su 43 suite**. Se i numeri non tornano, il problema
   è l'ambiente, non il codice: su `1422d09` la CI è verde su entrambi i job.
2. **AUD-022 — `generate` ombrelloni fa 500 INSERT sequenziali** in una transazione col timeout di
   default → P2028 e rollback totale con RTT ≥10 ms. **Regge in dev e si rompe in produzione**, cioè
   sul lido grande in onboarding. È il primo che morde davvero.
4. **AUD-015 — l'immagine Docker dell'API è single-stage e gira come root**, con la toolchain di
   sviluppo dentro: 29 advisory, 9 HIGH. I tre Dockerfile web sono già multi-stage: solo l'API no.
   **Urgente il giorno del primo deploy, non prima.**
5. **AUD-020 / AUD-021 — prestazioni**: il pre-check anti-overlap carica **tutta** la storia di
   coperture dell'ombrellone (nessun predicato di data), e **non esiste paginazione in tutto lo
   stack** (0 `take`/`skip`/`cursor` su 58 `findMany`). Innocue finché i lidi sono piccoli.
6. **D-063 — permessi dello staff configurabili dall'admin**: è una slice di dominio vera (modello
   dati, migration, schermata), e [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
   ne è il **prerequisito già fatto**. Il brief di delega è in
   [`2026-07-25-permessi-configurabili-design.md`](../superpowers/specs/2026-07-25-permessi-configurabili-design.md).
   ⚠️ **Non esiste alcun VPS** e il deploy non è imminente: l'unica precondizione al deploy è AUD-015.
   Non riaprire l'azione sul `JWT_SECRET` di produzione — è **decaduta**.

⚠️ **Prima di aprire una fase nuova**, rileggi il §5a: le regole di ingaggio valgono a prescindere
dalla fase, e il §5c elenca gli errori di metodo già pagati.

### 6.1 Azioni dell'utente

1. **Bloccanti legali**: **dati societari di Coralyn**, **scelta infrastruttura** (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali. Tocca testo legale, quindi va con i bloccanti qui sopra.
3. **Igiene branch** (§6.3).

### 6.2 Non c'è più nulla in sospeso sul piano d'audit

Le fasi A→H sono tutte chiuse, e le tre voci che erano «decisioni dell'utente» — D-064, D-066 e il
residuo di Fase H — sono chiuse anche loro. Ciò che resta al §6.0 era **fuori dal piano di
proposito**, e lo era già quando il piano è stato scritto.

### 6.3 Igiene del workspace

⚠️ **Sulla macchina nuova questa sezione non si applica**: i branch locali non la seguono. Vale se
torni su quella vecchia.

**Ventidue** branch locali oltre a `main`. **Tutti tranne tre sono contenuti in `main`** — conta con
`git branch --merged main`, non a mano: su quelli `-d` è sicuro **per costruzione**, perché rifiuta
di cancellare ciò che non è mergiato, ed è quindi una verifica oltre che una pulizia.

**Tre NON lo sono** — `backup/main-pre-reconcile-20260725`, `feat/legal-d061-d062`,
`docs/handoff-5-6a-ricostruito` — perché sono duplicati **pre-rebase**: gli stessi oggetti stanno in
`main` sotto SHA diversi. Verificato commit per commit: di 22 commit, **21 hanno un oggetto identico
in `main`**; l'unico che non ce l'ha crea una **stesura anteriore** di un handoff che in `main`
esiste in versione successiva. Non si perde lavoro, si perde una stesura. Su questi `-d` **rifiuta**
e serve `-D`: è una forzatura, ed è una scelta dell'utente.

### 6.4 Numeri liberi

**Prossimo ADR libero: 0062.** **Prossima deferred libera: D-067.**

---

## 7. Ancore

- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/)
- **Le decisioni di questa sessione**: [ADR-0060](../architecture/decisions/0060-read-model-shell-senza-pii.md)
  (niente PII nel read-model dello shell) ·
  [ADR-0061](../architecture/decisions/0061-tetto-worker-runner-test.md) (tetto ai worker)
- **Gate dei documenti**: [ADR-0059](../architecture/decisions/0059-gate-link-documenti.md) ·
  [`link-check.ts`](../../packages/docs-lint/src/link-check.ts) ·
  [`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts) ·
  [`test-workers.spec.ts`](../../packages/docs-lint/src/test-workers.spec.ts) ·
  [`deploy-guide.spec.ts`](../../packages/docs-lint/src/deploy-guide.spec.ts)
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
- **Deploy**: [guida](../deploy/README.md) · [manutenzione](../deploy/MANUTENZIONE.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-26 gate dei link e registro](2026-07-26-gate-link-e-registro-presidiati.md)
