# Handoff 2026-07-27 (sessione 10): AUD-022 è chiusa, il prossimo è D-063

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-26 il piano d'audit chiuso e la macchina nuova](2026-07-26-piano-audit-chiuso-e-macchina-nuova.md),
> che resta **superato**. Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole
> di ingaggio sono dentro, non per rimando.

---

## 0. In una riga

**AUD-022 è chiusa e mergiata** ([ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)):
il generatore di ombrelloni non fa più 500 INSERT sequenziali. La misura ha corretto il finding in
tre punti e **uno ha cambiato la soluzione**. Una review avversariale prima del merge ha trovato
**otto difetti reali, cinque miei di quella sessione**. Il prossimo lavoro è **D-063** — permessi
dello staff configurabili — che è una slice di dominio vera, non un fix.

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb && git log --oneline -6 main
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

Poi, in ordine: **§1 (ambiente)**, **§4 (gotcha)** e **§5 (metodo)** di questo documento, il
[brief di D-063](../superpowers/specs/2026-07-25-permessi-configurabili-design.md), e
`git log --format=%B -3` per il razionale — **i messaggi di commit di questo repo sono più densi
della documentazione, e non è una figura retorica**.

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

⚠️ **Sulla macchina della sessione 10 erano già tutti presenti e popolati** — l'handoff precedente
li dava per assenti, e chiederli all'utente sarebbe stato tempo perso. **Controlla prima di
chiedere.** Se manchi davvero i valori (JWT dev, password di `admin@coralyn.dev` e
`super@coralyn.dev`), quelli sì vanno chiesti: **il repo è PUBBLICO** e non devono finirci.

⚠️ **`JWT_SECRET` contiene la stringa `change-me` ma NON è il segnaposto di `.env.example`.** Un
controllo che cerca quella sottostringa dà un falso positivo. Confronta col template, non col testo.

⚠️ **Perché `apps/api/.env` è un duplicato**: `ConfigModule.forRoot` non passa `envFilePath`, quindi
dotenv risolve dalla **cwd**, e `pnpm --filter @coralyn/api …` la mette in `apps/api/`. Il file di
root **non viene letto**. Tienili allineati.

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

- ⚠️ **Il daemon Docker può essere giù**, anche a inizio sessione. Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` — i container di compose
  risalgono da soli in ~60 s. **Prima di diagnosticare un rosso e2e, `docker ps`.**
- **La porta è la 5432**, e `localhost` funziona (la vecchia nota su `127.0.0.1` obbligatorio non si
  applica). Se vedi la 5433, viene dal runbook stantio, non dal repo.

Migration su **entrambi** i database — dimenticare `coralyn_test` è il modo più comune di vedere
43 suite rosse per niente:

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_test?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
pnpm --filter @coralyn/api exec prisma db seed
pnpm --filter @coralyn/api run db:bootstrap-superuser
```

- ⚠️ **`prisma db seed` può dare `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto.**
  Misurato: il seed **è idempotente** (due corse da zero su un DB pulito, exit 0 entrambe). Il
  conflitto viene da ombrelloni creati **via app** le cui `label` collidono con quelle sintetiche
  sotto id diversi — indice parziale `Umbrella_establishmentId_label_active_key` su
  `(establishmentId, label) WHERE "retiredAt" IS NULL`. **Non "correggere" il seed.**
- ⚠️ **`prisma db seed` rifiuta ogni database il cui nome non matcha `/^coralyn_(dev|test)/i`.** Un
  DB di prova va chiamato `coralyn_devprobe`, **non** `coralyn_seedprobe`: altrimenti il fallimento
  sembra del seed ed è della guardia. (Costato un giro di diagnosi.)
- `coralyn` è superuser e **BYPASSRLS**, `coralyn_app` no. Per **ispezionare i dati** serve
  `coralyn`: con `coralyn_app` l'RLS ti dà zero righe e la verifica *sembra* pulita.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
  Il log dei job non è scaricabile senza token: per la causa devi **riprodurre**.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: due push ravvicinati su `main` cancellano il run precedente.
  **Guarda sempre l'ultimo run, non il penultimo.**
- **Il repo è PUBBLICO.**

---

## 2. Cosa è stato fatto

| Slice | Commit | Cosa chiude |
|---|---|---|
| **AUD-022** — il generatore in batch | `90afb65` | [ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md); apre [D-067](../architecture/deferred.md#d-067) |

`POST /establishment/umbrellas/generate` creava gli ombrelloni con un `tx.umbrella.create` **per
ombrellone** dentro l'unica transazione di `forTenant`, che non passa `transactionOptions` e quindi
eredita il timeout di default di Prisma (**5000 ms, verificato sullo strumento, non letto**). Al cap
del DTO — 500, cioè il lido grande in onboarding — sono 506 round-trip. Ora è **una sola
`INSERT … RETURNING`** via `createManyAndReturn`: 7 round-trip, e soprattutto **costanti in `count`**
invece che lineari.

### 2a. Le cose che la misura ha corretto, e che valgono più della chiusura

| Il documento diceva | La misura ha detto |
|---|---|
| P9-003: «rompe da RTT ≥10 ms» | ❌ Rompe a **8 ms**, e a 6 ms era già sul filo. Ginocchio estrapolato a **~7,7 ms** — dentro l'intervallo di un Postgres gestito *nella stessa region*, non solo di uno remoto |
| P9-003: «FIX: `createMany` + `findMany`» | ❌ Esiste di meglio: `UMBRELLA_SELECT` è di **soli scalari piatti**, quindi `createManyAndReturn` basta e risparmia il secondo round-trip |
| «serve anche `transactionOptions`» | ❌ **No**, e questa ha cambiato la *forma* della soluzione: col batch il margine sul default è un **fattore 10**. Alzare il timeout avrebbe mascherato i round-trip. Tracciato in [D-067](../architecture/deferred.md#d-067) invece che infilato nel bugfix |
| P9-003: «rollback totale» | ✅ **Confermato, non corretto** — e l'ADR lo diceva come se fosse una scoperta. Corretto dopo la review |

### 2b. La review avversariale ha pagato di nuovo, e più della volta scorsa

Cinque lenti in parallelo (correttezza · presìdi · numeri · documenti · omissioni), ogni finding a
**due scettici** — uno sui fatti, uno sull'impatto. **14 finding, 9 sopravvissuti, 8 difetti reali**
dopo verifica a mano sui file, **cinque introdotti nella stessa sessione**:

1. due test **promettevano nel nome un'asserzione impossibile**: `toStructureUmbrella` proietta solo
   `{id, label, umbrellaTypeId}`, quindi «logicalOrder contigui» guardava un campo **inesistente**;
2. «506 → 7» valeva **solo con `umbrellaTypeId: null`** (con la tipologia `assertType` aggiunge una
   query: 507 → 8);
3. la e2e si chiamava «una sola INSERT» ma **non osserva nessuna INSERT** — a RTT ~0 il codice
   pre-fix la passava identica;
4. l'ADR spacciava per correzione una **conferma**;
5. il blocco aggiunto al report d'audit era inserito **prima** dell'ultima frase della nota
   precedente, senza riga `>` vuota: in GFM finiva nello stesso paragrafo e **riattribuiva alla
   sessione 10 la chiusura di D-066**, che è della 9;
6. la guardia `toCreate.length > 0` **non era presidiata al confine 1**: mutarla in `> 1` lasciava
   verdi unit ed e2e;
7. l'indice ADR si fermava a 0058 → [D-069](../architecture/deferred.md#d-069);
8. ⚠️ **il più caro**, e viene da un finding che entrambi gli scettici hanno **refutato nel merito**
   convergendo però su un residuo: il «**2 % di margine**» era **più preciso dell'errore sistematico
   dello strumento che lo produceva** — rivendicava 114 ms su un proxy che ne aggiunge 506÷1.012.
   Stessa classe dei «63 MB» di ADR-0059. **Un finding refutato può contenere un difetto vero: leggi
   le refutazioni, non solo i verdetti.**

---

## 3. Baseline verde

| Suite | Comando | Ora |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1 file) |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39 file) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5 file) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7 file) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7 file) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 415 (57 file) |
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5 file) |
| api unit | `pnpm --filter @coralyn/api test` | **387** (59 suite) |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **507** (43 suite) |
| tutto insieme | **`pnpm run test`** | exit 0, **1183** unit su **180** file/suite |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | exit 0, **9 progetti** |

**Totale: 1690 test distinti.** Erano 1687. **Nessuna suite scende.**

Regola di verifica: il **totale** non scende, ogni calo per-suite è spiegato da una riga della
tabella in [baseline](../audit/2026-07-25-baseline.md), typecheck exit 0, lint non sale sopra 0
errori. **Criterio di «ambiente rimesso in piedi»**: `pnpm run test` a 1183/180 e `test:e2e` a
507/43. Se i numeri non tornano è l'ambiente, non il codice.

---

## 4. Gotcha

### 4a. Nuovi, verificati nella sessione 10

- ⚠️⚠️ **Su Windows OGNI primitiva di sleep è quantizzata a ~15,6 ms.** Misurato: `setTimeout(1)`,
  `(5)` e `(10)` durano **tutti ~15,5 ms**, e **`Atomics.wait` è identico** — eredita lo stesso
  timer dell'OS. Un proxy di latenza scritto con `setTimeout` riportava **31 ms sia a RTT 10 sia a
  RTT 20**: lo stesso numero per due condizioni diverse, che è la firma di uno strumento guasto.
  L'orologio che funziona è uno **spin su `process.hrtime.bigint()`** (errore ≤0,2 % da 2 ms in su).
- ⚠️ **`packages/contracts/dist` è tracciato** (nonostante `**/dist/` in `.gitignore`: una volta
  tracciato, l'ignore non si applica), è committato **in CRLF**, e `.gitattributes` non lo copre.
  Con `core.autocrlf=true` **di sistema**, ogni `pnpm install` — che via hook `prepare` ricostruisce
  i contracts — lascia quei file in stato `M` con `git diff` **vuoto**. Non committarli:
  `git checkout -- packages/contracts/dist`. → [D-068](../architecture/deferred.md#d-068).
- **Riscrivere file con Node preserva i line ending** se usi `split('\n')` + `join('\n')`: i `\r`
  restano attaccati a fine riga e il clean filter non vede differenze. **Verifica sempre con
  `git diff --numstat`** che il numero di righe cambiate sia quello che ti aspetti.
- ⚠️ **`prisma db seed` ha una guardia sul nome del database** (§1c). Un fallimento del seed su un DB
  di prova può essere la guardia, non il seed.
- **Un finding refutato può contenere un difetto vero.** Nella review, il finding sul «2 % di
  margine» è stato refutato **da entrambi** gli scettici — e conteneva il difetto più caro degli
  otto. Leggi le refutazioni per intero.

### 4b. Ereditati e ancora validi

- ⚠️ **Python su Windows traduce `\n` in `\r\n` in text mode**: uno script con `io.open(p,'w')` ha
  riscritto 7 config in CRLF senza che nessuno se ne accorgesse. **Per riscrivere file usa Node
  (`fs.writeFileSync`) o lo strumento Edit.**
- ⚠️ **Python via heredoc su questa shell legge in cp1252**: un `print` con `→` esplode e un
  `replace` con accenti **non matcha**. Per testo non-ASCII usa **Edit**.
- ⚠️ **PowerShell: l'operatore `-f` con `N0`/`N1` è locale-dipendente** e rompe un CSV. Un
  campionatore scritto così riportava «56 MB» dove ce n'erano 9.862.
- ⚠️ **Prima di credere a un numero, prova lo strumento su un caso di cui conosci la risposta.** In
  quest'area lo strumento si è rotto **dieci volte** e l'oggetto misurato **zero**.
- ⚠️ **Il gate dei link giudica l'esistenza su `git ls-files`, non sul disco**: un link a un file
  gitignorato è verde in locale e **rosso in CI**. È già successo con `RUNBOOK.local.md`.
- ⚠️ **Il parser di `deferred-registry.ts` tratta OGNI riga `- **D-0NN**` come una voce nuova**, e
  il suo spec pretende: indice **ordinato per numero**, anchor uguale all'ID, indice e voci
  coincidenti ID-per-ID e stato-per-stato, e la riga «Aperte: N · Chiuse: N · totale N» **agganciata
  al conteggio**. **Leggi il parser prima di spostare una voce**: ha già bocciato il suo autore.
- ⚠️ **`forTenant` vuole un `TenantId`, non una `string`.** I punti di produzione sono **quattro**, e
  [`tenant-id.spec.ts`](../../apps/api/src/tenant/tenant-id.spec.ts) fallisce **nominando il file**
  se ne compare un quinto.
- ⚠️ **Togliere il `throw` dell'anti-overlap in `priceAndWrite` lascia 507/507 verdi e NON è un
  buco**: il constraint DB dà lo stesso 409. È annotato accanto alla riga — **non "correggerlo"**.
- **`FORCE ROW LEVEL SECURITY` è il cardine di RLS**: `coralyn_app` è *proprietario* delle tabelle e
  senza `FORCE` Postgres lo esenta. `NO FORCE` su una sola tabella fa cadere 6 test.
- **Migration sempre `--create-only`, leggile, RLS appesa a mano** — solo per tabelle nuove — e
  `migrate deploy` su **entrambi** i DB.
- **e2e `maxWorkers: 1`** (requisito, non preferenza: un solo DB condiviso), suite di pacchetti
  diversi **una alla volta**, **calendario e2e congelato al 2026-07-15**
  ([dettagli](2026-07-22-e2e-frozen-calendar.md)).
- **`ApiError` SEMPRE da `@coralyn/data-layer`** ([presidio](../../packages/data-layer/src/single-source.spec.ts)).
  **`@IsUUID` è vietato dal lint** → `@IsUuidShape()`. **P2003 → 409, P2025 resta 500 di proposito.**
- **Un endpoint nuovo senza `@RequiresPermission` dà 403** (fail-closed) e
  `authorization-coverage.spec.ts` lo intercetta. **`@RequiresPermission` di metodo scavalca quello
  di classe** (verificato per mutazione).
- **Su template Vue usa `Edit`, non regex**: in `sed` le parentesi sono letterali e mangiano il codice.
- **`pnpm --filter X test -- --flag` passa `--` come argomento letterale** a jest. Va senza `--`.
- **`pnpm run test` non è `pnpm run verify`**: il job `static` esegue `lint`, `typecheck` e `test`
  come step **separati** ([verify.yml](../../.github/workflows/verify.yml)).
- ⚠️ **Non usare il gate completo per misurare regressioni di durata**: il tempo è instabile fra
  corse mentre il picco di memoria non lo è. Per le durate serve il confronto **per pacchetto**.

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre, non solo per la fase in corso)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `systematic-debugging`
  **prima** di proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio,
  dati, flussi o decisioni — **D-063 li tocca tutti e quattro**.
- ⚠️ **Questo utente delega la scelta strutturale.** Vuole leggere l'analisi, non farla: **arriva con
  una raccomandazione argomentata e poi esegui.** «Meno pigra» **non** vuol dire più invasiva.
  ⚠️ E se una delle opzioni che hai formulato **non è la migliore disponibile**, dillo e proponi la
  terza via — è successo di nuovo nella sessione 10 (`createManyAndReturn` invece della
  `createMany` + `findMany` che il finding proponeva) ed era giusto.
- **Nessun merge su `main` senza ok esplicito.** Una slice = un branch = **un commit denso**, poi
  fast-forward e push, con l'ok chiesto **ogni volta**. Questo **non** è delegato. ⚠️ Ma **non
  lasciare nulla solo in locale a fine sessione**: si lavora su più macchine.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Un finding è un'ipotesi, non un verbale. Misura il PROBLEMA prima di risolverlo.** Nella
  sessione 10 la misura ha corretto **tre** enunciati e **uno ha cambiato la soluzione**.
- **Riproduci prima di correggere, e prova la mutazione nei due versi**, contando *quanti* e *quali*
  test diventano rossi. ⚠️ **Vale anche per i presìdi che scrivi tu**: nella sessione 10 due dei
  miei avevano un buco, trovato solo mutandoli. ⚠️ E **una mutazione che non compila non prova
  nulla**: se la suite riporta `Tests: 0 total`, hai testato il compilatore, non il presidio.
- **Misura invece di stimare, dichiara lo scope del conteggio, e dichiara la varianza.** ⚠️ E
  soprattutto: **confronta il numero con la RISOLUZIONE dello strumento prima di scriverlo**. Un
  margine di 114 ms misurato con uno strumento che ne aggiunge 506 non è una misura.
- **Correggi il testo falso, non annotarlo sotto**, e distingui «è sempre stato vero» da «lo è
  diventato». ⚠️ Ma prima chiediti se c'è una **terza via che non tocca l'affermazione**.
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»** I modelli sono `single-source.spec.ts`,
  `tenant-id.spec.ts`, `deferred-registry.spec.ts`, `test-workers.spec.ts`, `deploy-guide.spec.ts`.
- **Quando una misura è controintuitiva, scrivila nel codice**, non solo nel commit.
- ⚠️ **Verifica con il renderer/strumento autoritativo, non con la specifica.**

### 5b. Cosa ha pagato

- **La review avversariale indipendente**, per la seconda volta di fila: 8 difetti reali, 5 miei
  della stessa sessione, **nessuno visto dalla rilettura**. ⚠️ E il difetto peggiore stava dentro un
  finding **refutato**: la regola nuova è **leggere le refutazioni, non solo i verdetti**.
- **Provare lo strumento su casi a risposta nota, prima di credergli.** Il proxy di latenza si è
  rotto **due volte** (orologio quantizzato; processi vecchi sopravvissuti a `pkill`) ed entrambe le
  volte l'ha preso la rivalidazione, non il ragionamento.
- **Misurare il problema, non solo la soluzione.** Il finding proponeva una soluzione a 8 round-trip
  e chiedeva `transactionOptions`; la misura ha dato una soluzione a 7 e ha mostrato che il secondo
  intervento era **inutile e mascherante**.
- **Separare ciò che una slice deve fare da ciò che tocca ogni transazione dell'API**
  ([D-067](../architecture/deferred.md#d-067)): «meno pigro» non vuol dire «più invasivo».

### 5c. Errori miei, da non ripetere

1. **Ho scritto «2 % di margine» con una precisione superiore all'errore del mio strumento** — la
   stessa classe dei «63 MB» di ADR-0059, rifatta a una sessione di distanza.
2. **Ho scritto due presìdi con un buco ciascuno** (il confine a 1 elemento; `logicalOrder` asserito
   su un campo che il DTO non espone), e li ho scoperti solo con la review.
3. **Ho dato un numero — «506 → 7» — senza dichiarare la condizione** in cui l'ho misurato.
4. **Ho inserito un blocco in un documento senza guardare come il Markdown lo rende**, e ho
   riattribuito alla mia sessione la chiusura di una voce della precedente.
5. **Ho scritto una mutazione che non compilava** e ho quasi concluso che il presidio funzionasse.
6. **Ho creduto a un `pkill`** che su Windows non aveva ucciso niente: i tre proxy vecchi erano vivi
   e la misura successiva era la loro.

Il filo, ormai su quattro sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.** Il
corollario nuovo: **anche un numero è uno strumento, e va confrontato con la propria risoluzione.**

---

## 6. Lavori aperti

### 6.0 Da dove ripartire, e perché in quest'ordine

1. **Rimetti in piedi l'ambiente** (§1) — senza, non puoi verificare niente. Criterio al §3.
2. ⭐ **D-063 — permessi dello staff configurabili dall'admin del lido.** È il prossimo, ed è una
   **slice di dominio vera**: modello dati, migration, schermata. Il
   [brief di delega](../superpowers/specs/2026-07-25-permessi-configurabili-design.md) esiste già ed
   è esplicito su cosa è ancora da decidere (§3), sui principi non negoziabili (§4), sui gotcha
   verificati (§5) e su come si verifica (§7). Il prerequisito
   [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) **è già su
   `main`**. ⚠️ Il brief dice «chi prende questa slice **scrive prima la spec di design e l'ADR**,
   poi implementa»: rispettalo, e attiva `design-docs` e `brainstorming` prima di toccare il codice.
3. **AUD-015 — l'immagine Docker dell'API è single-stage e gira come root**, con la toolchain di
   sviluppo dentro: 29 advisory, 9 HIGH. I tre Dockerfile web sono già multi-stage: solo l'API no.
   ⚠️ **Urgente il giorno del primo deploy, non prima: non esiste alcun VPS.** L'azione sul
   `JWT_SECRET` di produzione è **decaduta**, non riaprirla.
4. **AUD-020 / AUD-021 — prestazioni.** Il pre-check anti-overlap carica **tutta** la storia di
   coperture dell'ombrellone (nessun predicato di data), e **non esiste paginazione in tutto lo
   stack** (0 `take`/`skip`/`cursor` su 58 `findMany`). Innocue finché i lidi sono piccoli.
5. **[D-067](../architecture/deferred.md#d-067) — budget di transazione e di pool**, la radice n. 3
   di [P9](../audit/findings/P9-performance.md). Tocca **ogni** transazione dell'API e va deciso
   insieme a `connection_limit` e ai timeout SMTP, con la sua misura.
6. **Igiene, piccole:** [D-068](../architecture/deferred.md#d-068) (`contracts/dist` tracciato in
   CRLF) e [D-069](../architecture/deferred.md#d-069) (presidio sull'indice ADR, ~20 righe).

⚠️ **Prima di aprire una fase nuova**, rileggi il §5a: le regole di ingaggio valgono a prescindere
dalla fase, e il §5c elenca gli errori di metodo già pagati.

### 6.1 Azioni dell'utente

1. **Bloccanti legali**: **dati societari di Coralyn**, **scelta infrastruttura** (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali. Tocca testo legale, quindi va con i bloccanti qui sopra.
3. **Igiene branch** — sulla macchina con 22 branch locali (non questa).

### 6.2 Il piano d'audit resta chiuso

Le fasi A→H sono tutte chiuse. Ciò che resta al §6.0 era **fuori dal piano di proposito**, e lo era
già quando il piano è stato scritto. AUD-022 era il primo di quelli a mordere davvero, ed è fatto.

### 6.3 Numeri liberi

**Prossimo ADR libero: 0063.** **Prossima deferred libera: D-070.**

---

## 7. Ancore

- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/) ·
  [P9 prestazioni](../audit/findings/P9-performance.md)
- **La decisione di questa sessione**: [ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)
- **Il prossimo lavoro**: [brief D-063](../superpowers/specs/2026-07-25-permessi-configurabili-design.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **Gate dei documenti**: [ADR-0059](../architecture/decisions/0059-gate-link-documenti.md) ·
  [`link-check.ts`](../../packages/docs-lint/src/link-check.ts) ·
  [`deferred-registry.spec.ts`](../../packages/docs-lint/src/deferred-registry.spec.ts)
- **Tenant e RLS**: [`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts) ·
  [`rls-isolation.e2e-spec.ts`](../../apps/api/test/rls-isolation.e2e-spec.ts) ·
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **Pricing**: [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) ·
  [ADR-0035](../architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md) ·
  [ADR-0037](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) ·
  [`docs/legal/`](../legal/README.md)
- **Deploy**: [guida](../deploy/README.md) · [manutenzione](../deploy/MANUTENZIONE.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-26 piano d'audit chiuso](2026-07-26-piano-audit-chiuso-e-macchina-nuova.md)
