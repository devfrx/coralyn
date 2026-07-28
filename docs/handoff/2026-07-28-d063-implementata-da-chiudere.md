# Handoff 2026-07-28 (sessione 11): D-063 è implementata e verde, ma NON è finita

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-27 AUD-022 chiusa](2026-07-27-aud-022-chiusa-prossimo-d063.md), che resta **superato**.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**D-063 è implementata sul branch `feat/permessi-configurabili-d063`**, il gate è verde
(1227 unit su 183 file, 528 e2e su 44, lint 0 errori, typecheck 9), **ma non è mergiabile**: una
review avversariale ha trovato **13 difetti reali su 30 finding**, di cui **due gravi** che sono
regressioni funzionali introdotte dalla slice. Vanno chiusi prima del merge.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -4
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

Il branch è **spinto**, non mergiato. `main` è ferma a `1e2cc87`.

```bash
git switch feat/permessi-configurabili-d063
```

Poi, in ordine: **§1 (ambiente)**, **§4 (gotcha)**, **§5 (metodo)**, e **§6 (cosa fare)**.
⚠️ Il §6.1 elenca due difetti **gravi**: sono la prima cosa, prima di qualunque altra.

---

## 1. Ambiente

### 1a. I cinque file gitignorati

| File | Template versionato | Nota |
|---|---|---|
| `.env` | ✅ [`.env.example`](../../.env.example) | completo e commentato |
| `apps/api/.env` | ⚠️ **nessuno** | **byte-identico a `.env`**: copia lo stesso file due volte |
| `.env.test` | ✅ [`.env.test.example`](../../.env.test.example) | |
| `apps/web-staff/.env` | ✅ [`apps/web-staff/.env.example`](../../apps/web-staff/.env.example) | |
| `RUNBOOK.local.md` | — | stantio sui numeri, utile sul *perché*. Non linkarlo: è gitignorato, vedi §4 |

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** Due handoff di fila li hanno dati per assenti
ed erano tutti al loro posto. Se mancano davvero i valori (JWT dev, password di `admin@coralyn.dev`
e `super@coralyn.dev`), quelli sì vanno chiesti all'utente: **il repo è PUBBLICO**.

⚠️ **`JWT_SECRET` contiene la stringa `change-me` ma NON è il segnaposto di `.env.example`.**
Confronta col template, non col testo.

⚠️ **Perché `apps/api/.env` è un duplicato**: `ConfigModule.forRoot` non passa `envFilePath`, dotenv
risolve dalla **cwd**, e `pnpm --filter @coralyn/api …` la mette in `apps/api/`. Il file di root
**non viene letto**.

### 1b. La sequenza che porta a un verde

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @coralyn/contracts build
pnpm --filter @coralyn/api exec prisma generate
```

⚠️ **`prisma generate` PRIMA del typecheck**, sempre.

### 1c. Docker, i due database, il seed

```bash
docker compose up -d && docker compose ps   # db su 5432, mailpit su 1025/8025
```

- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- **La porta è la 5432.** Se vedi la 5433 viene dal runbook stantio.

Migration su **entrambi** i database — dimenticare `coralyn_test` è il modo più comune di vedere
44 suite rosse per niente:

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_test?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
```

- ⚠️⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo e l'ambiente è
  non-interattivo, quindi fallisce con «Prisma Migrate has detected that the environment is
  non-interactive». **Per generare l'SQL usa `prisma migrate diff`**:
  ```bash
  DATABASE_URL="…coralyn_dev…" pnpm --filter @coralyn/api exec prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
  ```
  poi scrivi a mano `prisma/migrations/<ts>_<nome>/migration.sql` e fai `migrate deploy`.
  ⚠️ Il timestamp deve essere **posteriore** all'ultima migration, o l'ordine lessicografico salta.
- ⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto.**
  **Misurato in questa sessione, e il meccanismo è questo:** gli id sintetici del seed
  (`…-0005-…`) sono **0** in DB, mentre le label `1`–`30` esistono **attive** sotto uuid casuali —
  ombrelloni creati **via app**. L'upsert per `id` non trova nulla, va in `create`, e collide con
  l'indice parziale `Umbrella_establishmentId_label_active_key`. **Non "correggere" il seed.**
- ⚠️ **Conseguenza operativa**: l'entrypoint del container tratta il fallimento del seed come
  **fatale di proposito** (`set -e`), quindi `coralyn-api` non parte. Su un `coralyn_dev` già
  popolato il seed **non serve** (admin/staff/superuser esistono già):
  ```bash
  SEED_ON_START=false docker compose --profile full up -d
  ```
  `docker-compose.yml` è stato reso scavalcabile in questa sessione (`"${SEED_ON_START:-true}"`),
  **default invariato**. ⚠️ Quella riga è **fuori dalla slice D-063**: se il commit va rifatto,
  decidi se tenerla.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.** Un DB di
  prova va chiamato `coralyn_devprobe`, **non** `coralyn_seedprobe`.
- `coralyn` è superuser e **BYPASSRLS**, `coralyn_app` no. Per **ispezionare i dati** serve
  `coralyn`: con `coralyn_app` l'RLS ti dà zero righe e la verifica *sembra* pulita.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: due push ravvicinati su `main` cancellano il run precedente.
  **Guarda sempre l'ultimo run, non il penultimo.**
- **Il repo è PUBBLICO.**

---

## 2. Cosa è stato fatto (e cosa no)

### 2a. La slice

**D-063 — permessi dello staff configurabili dall'admin del lido**, sul branch
`feat/permessi-configurabili-d063`. **Un commit, non mergiato.**

- **Spec**: [2026-07-27-permessi-configurabili-d063-design.md](../superpowers/specs/2026-07-27-permessi-configurabili-d063-design.md)
- **Piano**: [2026-07-27-permessi-configurabili-d063.md](../superpowers/plans/2026-07-27-permessi-configurabili-d063.md)
- **Decisione**: [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md)

Le quattro decisioni, tutte approvate dall'utente:

1. **Per operatore**, non per lido. **Solo lo `staff` è configurabile**: l'admin conserva i permessi
   impliciti del ruolo, perché revocarsi `team.manage` chiuderebbe il lido fuori dalla gestione.
2. **Riletti a ogni richiesta**, non nel JWT (nel token una revoca avrebbe morso fino a 8h, e lo
   staff non ha né refresh né revoca — D-026 è chiusa solo per il canale cliente). La lettura è
   **una** query indicizzata e **solo** per il ruolo `staff`.
3. **Tabella `StaffPermissionOverride` FUORI da RLS**, con una **FK composita**
   `(userId, establishmentId) → User(id, establishmentId)` al posto della policy.
4. **`Permission` spostato in `@coralyn/contracts`**; il gating di web-staff passa da ruolo a
   permesso; `UserDTO` porta i permessi effettivi.

Il DB conserva un **delta** sul default di fabbrica: assenza di riga = `PERMISSION_ROLES`. Un lido
che non configura nulla non si accorge della slice.

### 2b. Le cose provate, non dedotte

- **La FK composita respinge la riga cross-tenant**, provata in SQL sul DB vero **con il caso di
  controllo accanto** (stesso `INSERT` col tenant corretto: passa).
- **Il superuser non può avere override**: `establishmentId` è `NULL` e la FK non può matchare.
  Era una claim scritta in quattro documenti *prima* di essere provata; ora è provata.
- **Mutazione nei due versi**: togliere la consultazione degli override → 4 test rossi in 2 suite;
  togliere la guardia «solo lo staff legge» → 3; disattivare il gating della sidebar → 3;
  rimettere il ripiego fisso `/map` nel router → 4, incluso quello sul redirect infinito.
- **La misura che decide l'esenzione da RLS**: 1,5 ms fuori transazione contro 4,9 ms dentro
  `forTenant`, cioè **3 round trip strutturali in più**. Strumento validato con
  `3×SELECT 1 / 1×SELECT 1` = 2,81 (atteso ~3) e conteggio derivato = 2,99.
  ⚠️ **Vedi il §6.2**: la review contesta *come è scritta*, non la conclusione.

### 2c. Il gate

Verde su tutto, dopo aver corretto un typecheck rotto in `web-platform` che **solo il gate completo**
poteva trovare (un mock di `UserDTO` senza `permissions`).

---

## 3. Baseline

| Suite | Comando | main (1e2cc87) | branch D-063 |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) | 11 (1) |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5) | 32 (5) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) | 23 (7) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) | 35 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 415 (57) | **434 (59)** |
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) | 68 (5) |
| api unit | `pnpm --filter @coralyn/api test` | 387 (59) | **412 (60)** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 507 (43) | **528 (44)** |
| tutto insieme | **`pnpm run test`** | 1183 / 180 | **1227 / 183** |
| lint | `pnpm run lint` | 0 err / 87 warn | 0 / 87 |
| typecheck | `pnpm run typecheck` | 9 progetti | 9 |

**Criterio di «ambiente rimesso in piedi»** (su `main`): `pnpm run test` a **1183/180** e
`test:e2e` a **507/43**. Se i numeri non tornano è l'ambiente, non il codice.

---

## 4. Gotcha

### 4a. Nuovi, verificati in questa sessione

- ⚠️⚠️ **Vite pre-bundla `@coralyn/contracts`** (`apps/web-staff/vite.config.ts:36`,
  `optimizeDeps.include`). Dopo aver ricostruito i contracts, un dev server **già in esecuzione**
  continua a servire la copia vecchia, e i simboli nuovi sono `undefined` a runtime:
  `Uncaught TypeError: Cannot read properties of undefined (reading 'MapRead')`.
  **Provato**: `node_modules/.vite/deps/@coralyn_contracts.js` conteneva `MapRead` **0 volte**
  mentre `packages/contracts/dist/index.js` lo conteneva. Rimedio:
  ```bash
  pnpm --filter @coralyn/web-staff dev --force
  ```
  (o cancella `apps/web-staff/node_modules/.vite`). **Non è un difetto del codice.**
- ⚠️⚠️ **`prisma migrate dev` è interattivo e qui fallisce.** Usa `migrate diff` (§1c).
- ⚠️⚠️ **Non passare testo con backtick a `node -e` dentro Bash**: la shell li interpreta come
  command substitution e li **cancella silenziosamente**. In questa sessione ha corrotto
  `deferred.md` (recuperato con `git checkout --`). **Per testo con backtick, accenti o markdown
  usa lo strumento Edit/Write**, mai la shell. Stessa famiglia del gotcha su Python/cp1252.
- ⚠️ **Esiste un SECONDO presidio che pretende RLS**, oltre a `rls-isolation.e2e-spec.ts`:
  `apps/api/prisma/reset-dev.core.ts` (`assertCoherence`) esige che **ogni tabella con
  `establishmentId`** abbia `FORCE ROW LEVEL SECURITY`, salvo che sia in `KEEP_LIST`. È emerso solo
  eseguendo la suite e2e **completa**: la suite del singolo file non lo tocca.
- **Prisma esprime le FK composite** (`@relation(fields: [a,b], references: [x,y])`) e il
  `@@unique([id, establishmentId])` che serve loro. Non serve appenderle a mano: le genera
  `migrate diff`, e stando nello schema sono protette dal drift detection.

### 4b. Ereditati e ancora validi

- ⚠️ **Su Windows OGNI primitiva di sleep è quantizzata a ~15,6 ms** (`setTimeout(1)`, `(5)`, `(10)`
  durano tutti ~15,5 ms; `Atomics.wait` è identico). Per latenze sotto i 15 ms serve uno **spin su
  `process.hrtime.bigint()`**.
- ⚠️ **Python su Windows traduce `\n` in `\r\n` in text mode**; **Python via heredoc legge in
  cp1252**. Per riscrivere file usa Node (`fs.writeFileSync`) o Edit.
- ⚠️ **Riscrivere file con Node preserva i line ending** se non tocchi i `\n`. **Verifica sempre con
  `git diff --numstat`** che il numero di righe cambiate sia quello atteso.
- ⚠️ **PowerShell: `-f` con `N0`/`N1` è locale-dipendente** e rompe un CSV.
- ⚠️ **Prima di credere a un numero, prova lo strumento su un caso a risposta nota.** In quest'area
  lo strumento si è rotto **dieci volte** e l'oggetto misurato **zero**.
- ⚠️ **Il gate dei link giudica l'esistenza su `git ls-files`, non sul disco**: un file nuovo va
  `git add`-ato **prima** di linkarlo, o è verde in locale e rosso in CI.
- ⚠️ **Il parser di `deferred-registry.ts`** pretende: indice **ordinato per numero**, anchor uguale
  all'ID, indice e voci coincidenti ID-per-ID **e stato-per-stato**, la riga
  «Aperte: N · Chiuse: N · totale N» **agganciata al conteggio**, e ogni voce sotto `## Chiuse` deve
  **dire** di essere chiusa. **Leggi il parser prima di spostare una voce.**
- ⚠️ **`packages/contracts/dist` è tracciato e committato in CRLF**: dopo `pnpm install` risulta
  modificato con `git diff` **vuoto** → `git checkout -- packages/contracts/dist`.
  ⚠️ **Ma se hai cambiato `packages/contracts/src`, il diff è REALE e va committato.** Distingui i
  due casi con `git diff --numstat`. → [D-068](../architecture/deferred.md#d-068).
- ⚠️ **`forTenant` vuole un `TenantId`, non una `string`.**
- ⚠️ **Togliere il `throw` dell'anti-overlap in `priceAndWrite` lascia le e2e verdi e NON è un
  buco**: il constraint DB dà lo stesso 409. **Non "correggerlo".**
- **`FORCE ROW LEVEL SECURITY` è il cardine di RLS.** Migration sempre `--create-only`, RLS appesa a
  mano **solo per tabelle nuove sotto RLS**, `migrate deploy` su **entrambi** i DB.
- **e2e `maxWorkers: 1`**, suite di pacchetti diversi **una alla volta**, **calendario e2e congelato
  al 2026-07-15**.
- **`ApiError` SEMPRE da `@coralyn/data-layer`**; **`@IsUUID` vietato** → `@IsUuidShape()`;
  **P2003 → 409**; un endpoint senza `@RequiresPermission` dà **403** e
  `authorization-coverage.spec.ts` lo intercetta.
- **Su template Vue usa `Edit`, non regex.** **`pnpm --filter X test -- --flag` passa `--` a jest**:
  va senza.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi** (inserire password
  è azione proibita): per la prova visiva serve che l'utente entri nella Browser pane.

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `systematic-debugging`
  **prima** di proporre un fix. `brainstorming` + `design-docs` prima di toccare dominio, dati,
  flussi o decisioni. `compliance-docs` per legale/GDPR.
- ⚠️ **Questo utente delega la scelta strutturale.** Vuole leggere l'analisi, non farla: **arriva con
  una raccomandazione argomentata e poi esegui.** «Meno pigra» **non** vuol dire più invasiva.
  ⚠️ Se una delle opzioni che hai formulato non è la migliore disponibile, **dillo e proponi la
  terza via**. In questa sessione la terza via è stata «fuori da RLS **+ FK composita**», che nessuna
  delle due opzioni originali conteneva.
- ⚠️ **Quando l'utente risponde «la soluzione meno pigra, più professionale, senza debiti», sta
  delegando, non scegliendo.** Devi decidere tu e **argomentare la scelta**, non prendere la più
  invasiva.
- **Nessun merge su `main` senza ok esplicito.** Una slice = un branch = **un commit denso**, poi
  fast-forward e push, con l'ok chiesto **ogni volta**. ⚠️ Ma **non lasciare nulla solo in locale a
  fine sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Un finding è un'ipotesi, non un verbale. Misura il PROBLEMA prima di risolverlo.**
- **Riproduci prima di correggere, e prova la mutazione nei due versi**, contando *quanti* e *quali*
  test diventano rossi. ⚠️ Vale anche per i presìdi che scrivi tu. ⚠️ Una mutazione che non compila
  non prova nulla: `Tests: 0 total` = hai testato il compilatore.
- **Misura invece di stimare, dichiara lo scope del conteggio, dichiara la varianza**, e **confronta
  il numero con la RISOLUZIONE dello strumento prima di scriverlo**.
- **Correggi il testo falso, non annotarlo sotto.** Ma prima chiediti se c'è una terza via che non
  tocca l'affermazione.
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»**

### 5b. Cosa ha pagato in questa sessione

- **La review avversariale, per la terza volta di fila.** 5 lenti × 30 finding × 2 scettici:
  **13 difetti reali**, di cui **due gravi che il gate verde non poteva vedere** perché sono
  regressioni funzionali, non fallimenti di test. Nessuno dei due era visibile alla rilettura.
- ⚠️ **Leggere i residui dei finding refutati**: 17 finding refutati da entrambi gli scettici hanno
  lasciato **17 residui veri**, quasi tutti da una riga. Il §6.3 li elenca.
- **Provare le claim invece di citarle.** Il gotcha del seed era «documentato» dall'handoff
  precedente, ma la spiegazione citata (collisione su `P1`–`P4`) era **sbagliata**: le label
  collidenti sono `1`–`30`. Verificarlo ha richiesto due query.
- **Il gate COMPLETO, non le suite del pacchetto toccato.** Ha trovato un typecheck rotto in
  `web-platform` e un presidio (`reset-dev`) che nessuna suite singola tocca.

### 5c. Errori miei, da non ripetere

1. **Ho scritto un modale che salva un insieme vuoto su errore di lettura** (§6.1) — cioè ho chiuso
   AUD-012 per la *lettura* e l'ho lasciato aperto per la *scrittura*, nello stesso file, con un
   commento che dichiarava il problema risolto.
2. **Ho gatato la sidebar per permesso senza guardare da quali endpoint dipendono le viste** (§6.1).
3. **Ho passato testo con backtick a `node -e` dentro Bash** e ho corrotto `deferred.md`.
4. **Ho scritto «~60 annotazioni», «già a 290 righe», «§2.2 di ADR-0063»** — tre numeri/riferimenti
   mai verificati, tutti sbagliati.
5. **Ho scritto nella spec che la FK composita «non è esprimibile nel DSL Prisma»** e poi l'ho
   lasciata generare a Prisma, senza correggere la frase.

Il filo, ormai su cinque sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.** Il
corollario nuovo: **un gate verde non vede una regressione funzionale.**

---

## 6. Lavori aperti

### 6.1 ⭐ I DUE DIFETTI GRAVI (prima di tutto)

Entrambi confermati da **entrambi** gli scettici, entrambi riprodotti.

#### A. Il modale dei permessi azzera tutto se la lettura fallisce

**File**: [`StaffPermissionsModal.vue`](../../apps/web-staff/src/features/establishment/StaffPermissionsModal.vue)
(righe 25, 29-36, 50-60, 104-109).

`granted` nasce `new Set()` vuoto e il `watch` esce se `dto` è assente. Il **corpo** del modale è
protetto (`QueryBoundary` + `v-if="!data"`), ma il bottone **Salva** sta in `<template #footer>`,
cioè **fuori** dal `QueryBoundary`, e `Button.vue:22` disabilita solo su `loading`. Quindi con la
GET in errore — o nella finestra anti-flicker — Salva è cliccabile e invia `{"permissions":[]}`.
Il server tratta il body come **insieme completo desiderato**: scrive 10 righe `granted:false`,
risponde 200, la UI dice «Permessi aggiornati.» e chiude. L'operatore perde tutto tranne
`session.read`.

**Riprodotto** dallo scettico con una spec temporanea: `SALVA disabled = false` e
`BODY INVIATO = {"permissions":[]}` sia in errore sia in pending.

⚠️ **Etichettalo bene**: non è un buco di autorizzazione (degrada in «nega tutto», che è
fail-closed), è una **perdita di dati silenziosa con conferma di successo**.

**Fix**: legare il footer al dato (`:disabled`/`v-if` su `data`) **e** far uscire `submit()` se
`data` è assente. **Poi il presidio**: il test esistente
(`StaffPermissionsModal.spec.ts:114-124`) promette nel nome la chiusura di AUD-012 e copre solo la
metà visiva — va esteso al salvataggio.

#### B. Le viste dipendono da endpoint di ALTRI permessi

**File**: `RentalCatalogView.vue:28`, `RentalsView.vue:28,32`, `MapView.vue:32,33`,
[`navigation.ts:12`](../../apps/web-staff/src/app/navigation.ts).

Il gating della sidebar associa **una voce a un permesso**, ma le viste chiamano endpoint governati
da permessi **diversi**. Esempio dall'ADR stesso: revocare `pricing.manage` lasciando
`rental-catalog.manage` mostra «Listino noleggi» in sidebar, ma la vista chiama anche `/seasons`
(che è `pricing.manage`) e va in 403. Stessa cosa per Mappa e Noleggi.

**Conseguenza**: la configurazione-esempio che l'ADR usa per spiegare la feature **rompe tre
schermate in silenzio**.

**Fix da decidere** (è una scelta strutturale → **presentala all'utente, non deciderla**):
1. ogni voce di nav dichiara **l'insieme** dei permessi che la sua vista richiede davvero;
2. oppure le viste degradano sui sotto-dati negati invece di rompersi;
3. oppure si dichiarano dipendenze fra permessi e la schermata admin le impone.

⚠️ Qualunque scelta, **serve un presidio**: oggi nulla lega la sidebar agli endpoint che la vista
chiama, ed è esattamente il tipo di divergenza che il brief di D-063 temeva.

### 6.2 Gli altri 11 difetti reali

| # | Dove | Cosa |
|---|---|---|
| 1 | `apps/web-staff/src/test/utils.ts:9-23` | il commento dice che `permissionsOfRole` **deriva** i permessi dall'enum: la lista dello staff è **scritta a mano** e nulla la vincola a `PERMISSION_ROLES` |
| 2 | `establishment-users.service.spec.ts` + `staff-permissions.e2e-spec.ts` | il **corpo di risposta** del `PUT /permissions` non è asserito da nessuna parte |
| 3 | `EstablishmentView.vue:65,240,78-85,305` | l'**unico ingresso** della schermata e la regola «l'admin non è configurabile» lato UI non hanno **alcun** test |
| 4 | `staff-permissions.e2e-spec.ts:214-218` | «uno staff con `team.manage` può configurare» esegue solo una **GET**, non una scrittura |
| 5 | `staff-permissions.service.ts:41-42` | la prova per mutazione dichiara «4 test in 2 suite» senza dire **in quale runner**: sul gate completo sono 11 in 3 |
| 6 | `spec:112, 125-127` | la spec dice che la FK composita **non è esprimibile in Prisma**: è nello schema, e la genera Prisma |
| 7 | `ADR-0063:137` | il Rubric check dice «la risoluzione resta in `permission.ts`», contraddicendo la Decision dello stesso ADR |
| 8 | `spec:210-211` | dice che `permission.ts` conserva le costanti di §5.1: stanno nei **contracts** |
| 9 | `piano:82, 409` | indica `docs/architecture/data-model.md`, file che **non esiste** (è `docs/design/`) |
| 10 | 7 file di produzione | citano «§2.2», «§5.1», «§5» **di ADR-0063**: sono sezioni della **spec**, e «§5» esiste anche nell'ADR e parla d'altro |
| 11 | `useEstablishment.ts:96-99` | il commento motiva la non-invalidazione della sessione con una ragione che ADR-0063 **contraddice** |

### 6.3 I residui dei finding refutati (17, quasi tutti da una riga)

⚠️ **Nella sessione 10 il difetto più caro stava dentro un finding refutato da entrambi.** Questi
sono già stati estratti — non rifare la review, leggi qui.

- `useEstablishment.ts:29` — il commento dice che l'overview «è leggibile da tutto lo staff»: dopo
  D-063 è **falso**. E `useEstablishmentOverview` è l'unica query dello shell **senza gate**: due
  403 sprecati per ogni caricamento a un operatore ristretto.
- `identity.service.spec.ts:16-17` — il commento giustifica il cablaggio del service vero con un
  argomento sulla «proiezione», ma **nessuno** dei 5 test asserisce `res.user.permissions`.
- `establishment-users.service.spec.ts:171,176-177` — il test «scrive **UNA** riga `granted:false`»
  ne scrive **nove**, e usa `toContain` dove il gemello a `:186-187` usa `toEqual`: nessuna
  asserzione fissa l'insieme esatto.
- `staff-permissions.service.spec.ts:129-135` — il test «include SEMPRE i non configurabili» è
  **strettamente ridondante** col test a `:98-105`. E il fatto nudo resta: `has()`/`effectiveFor()`
  si fidano di **ogni** riga; l'insieme ammesso è vincolato dallo **scrittore**, non dal database.
- `permissionGuard.spec.ts:33-34` — il commento descrive il **sotto-caso opposto** a quello che la
  fixture instanzia.
- `ADR-0063:112` — «la latenza di 8 ms **misurata da** ADR-0062» comprime «che ADR-0062 ha
  **misurato come punto di rottura**» (formula corretta, presente nella spec a `:63-64`).
- `spec:59` — la formula `(D−C)/A` usa tre simboli **mai definiti** nel documento.
- `migration.sql` + 4 file — i valori 1,54 / 4,92 / 2,81 / 2,99 **non sono riproducibili**: nessun
  harness è committato. Vanno letti come «misurato una volta su una macchina».
- `ADR-0057` (pre-esistente, non di questa slice) — «le ~60 annotazioni `@RequiresPermission`»: nel
  repo sono **37** (21 di classe + 16 di metodo). Il referente giusto sono le **rotte**, non i
  decoratori.
- `StaffPermissionsModal.vue:10` — «`EstablishmentView.vue` è già a **290** righe»: è a **307**, e
  290 non è mai stato uno dei valori attraversati dal file.
- `spec:283` — «il router negherà le rotte prima che ci si arrivi» è **falso** nel caso di revoca
  totale, in cui la guardia **lascia passare** di proposito (`permissionGuard.ts:37`).
- `spec:264` e `piano:75` — dicono «`authorization-staff.e2e-spec.ts` **esteso**»: quel file ha
  guadagnato 7 righe di commento e **zero** `it(`.
- `docs/legal/registro-trattamenti.md:165` e `docs/legal/dpa-coralyn-lido.md:228` — dichiarano
  «**6** tabelle fuori RLS» verificate sul codice: **ora sono 7**, e la settima è la prima
  tenant-scoped. ⚠️ Il DPA è un **allegato contrattuale destinato alla firma**.
- `registro-trattamenti.md:44` — cita `schema.prisma:146-157`; `model User` ora è a **146-159**.
- `registro-trattamenti.md:36,38` — la finalità A1 dice «controllo degli accessi **per ruolo**»:
  dopo D-063 non è più solo per ruolo. → materiale per **D-062**.
- `ADR-0063 Decision §6` e `deferred.md` D-063 punto 3 — dicono «il gating **del frontend**» dove
  intendono «di **web-staff**»: `web-platform` è rimasta al ruolo.
- `data-model.md` — `STAFF_PERMISSION_OVERRIDE` è l'unica delle 26 entità citate in una relazione a
  **non avere il blocco attributi**, e manca l'arco verso `ESTABLISHMENT`.

### 6.4 Dopo D-063

1. **AUD-015** — l'immagine Docker dell'API è single-stage e gira come root (29 advisory, 9 HIGH).
   ⚠️ **Urgente il giorno del primo deploy, non prima: non esiste alcun VPS.**
2. **AUD-020 / AUD-021** — prestazioni: il pre-check anti-overlap carica **tutta** la storia di
   coperture, e **non esiste paginazione** (0 `take`/`skip`/`cursor` su 58 `findMany`).
3. **[D-067](../architecture/deferred.md#d-067)** — budget di transazione e di pool. Tocca **ogni**
   transazione dell'API, va deciso con `connection_limit` e i timeout SMTP, con la sua misura.
   ⚠️ ADR-0063 lo cita come ragione per non mettere la tabella sotto RLS: se D-067 cambia le carte,
   quella decisione va **rivisitata, non solo citata**.
4. **Igiene**: [D-068](../architecture/deferred.md#d-068) (`contracts/dist` tracciato in CRLF) e
   [D-069](../architecture/deferred.md#d-069) (presidio sull'indice ADR).

### 6.5 Azioni dell'utente

1. **Bloccanti legali**: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
   ⚠️ Il §6.3 aggiunge materiale per D-062: la finalità A1 del registro.
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali.
3. **Igiene branch** — sulla macchina con 22 branch locali.

### 6.6 Numeri liberi

**Prossimo ADR libero: 0064.** **Prossima deferred libera: D-070.**

⚠️ **D-063 è già segnata CHIUSA** in `deferred.md` e nell'indice. Se il §6.1 dovesse cambiare una
delle quattro decisioni, quella voce va **riaperta**, non annotata.

---

## 7. Ancore

- **La slice**: [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md) ·
  [spec](../superpowers/specs/2026-07-27-permessi-configurabili-d063-design.md) ·
  [piano](../superpowers/plans/2026-07-27-permessi-configurabili-d063.md) ·
  [brief originale](../superpowers/specs/2026-07-25-permessi-configurabili-design.md)
- **Prerequisito**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/)
- **Tenant e RLS**: [`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts) ·
  [`rls-isolation.e2e-spec.ts`](../../apps/api/test/rls-isolation.e2e-spec.ts) ·
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
- **Gate dei documenti**: [ADR-0059](../architecture/decisions/0059-gate-link-documenti.md) ·
  [`link-check.ts`](../../packages/docs-lint/src/link-check.ts) ·
  [`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-27 AUD-022 chiusa](2026-07-27-aud-022-chiusa-prossimo-d063.md)
