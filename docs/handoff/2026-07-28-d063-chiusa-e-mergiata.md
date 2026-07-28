# Handoff 2026-07-28 (sessione 12): D-063 è chiusa e mergiata, con ADR-0064 a correggerla

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-28 D-063 implementata](2026-07-28-d063-implementata-da-chiudere.md), che resta **superato**.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**D-063 è chiusa e su `main`** (`fd549d8`). I due difetti gravi del report precedente sono chiusi, i
28 minori pure, ed è nato **[ADR-0064](../architecture/decisions/0064-permessi-vicini-gate-per-query.md)**
perché il gating per voce di nav non reggeva la composizione. Due review avversariali di fila hanno
trovato **una regressione introdotta dai fix stessi** e **tre affermazioni false scritte nella stessa
sessione**, una in un allegato contrattuale.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -4
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

`main` = `fd549d8`. Il branch `feat/permessi-configurabili-d063` è **mergiato**: si può cancellare.

Poi, in ordine: **§1 (ambiente)**, **§4 (gotcha)**, **§5 (metodo)**, **§6 (cosa fare)**.

---

## 1. Ambiente

### 1a. I cinque file gitignorati

| File | Template versionato | Nota |
|---|---|---|
| `.env` | ✅ [`.env.example`](../../.env.example) | completo e commentato |
| `apps/api/.env` | ⚠️ **nessuno** | **byte-identico a `.env`**: copia lo stesso file due volte |
| `.env.test` | ✅ [`.env.test.example`](../../.env.test.example) | |
| `apps/web-staff/.env` | ✅ [`apps/web-staff/.env.example`](../../apps/web-staff/.env.example) | |
| `RUNBOOK.local.md` | — | stantio sui numeri, utile sul *perché*. Non linkarlo: è gitignorato |

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** Tre handoff di fila li hanno dati per assenti
ed erano tutti al loro posto — anche in questa sessione. Se mancano davvero i valori (JWT dev,
password di `admin@coralyn.dev` e `super@coralyn.dev`), quelli sì vanno chiesti all'utente:
**il repo è PUBBLICO.**

⚠️ **`JWT_SECRET` contiene la stringa `change-me` ma NON è il segnaposto di `.env.example`.**
Confronta col template, non col testo.

⚠️ **Perché `apps/api/.env` è un duplicato**: `ConfigModule.forRoot` non passa `envFilePath`, dotenv
risolve dalla **cwd**, e `pnpm --filter @coralyn/api …` la mette in `apps/api/`.

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
- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.

Migration su **entrambi** i database:

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_test?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
```

- ⚠️⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Per generare l'SQL usa
  `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, poi scrivi a
  mano `prisma/migrations/<ts>_<nome>/migration.sql` e fai `migrate deploy`. Il timestamp deve
  essere **posteriore** all'ultima migration.
- ⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: le label
  `1`–`30` esistono attive sotto uuid casuali (ombrelloni creati via app) e collidono con l'indice
  parziale. **Non "correggere" il seed.** Conseguenza operativa:
  `SEED_ON_START=false docker compose --profile full up -d`.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**
- `coralyn` è superuser e **BYPASSRLS**, `coralyn_app` no: per **ispezionare i dati** serve
  `coralyn`, o l'RLS ti dà zero righe e la verifica *sembra* pulita.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- **Il repo è PUBBLICO.**

---

## 2. Cosa è stato fatto

### 2a. I due difetti gravi del report precedente

**A — il modale dei permessi azzerava l'operatore.** Il bottone Salva sta nel footer del `Modal`,
**fuori** dal `QueryBoundary`: con la GET in errore inviava `{"permissions":[]}`, che il server
tratta come insieme completo desiderato, **con toast di successo**. Riprodotto prima di correggere
(`SALVA disabled = false`, `BODY = {"permissions":[]}`). Due presìdi indipendenti, ognuno provato
dalla **sua** mutazione.

**B — le viste componevano endpoint di ALTRI permessi.** Incrociando le 29 query di `web-staff` coi
`@RequiresPermission` dei controller: **7 delle 8 voci operative** dipendono da permessi fuori dal
proprio. E il guasto non era un errore, era **silenzio**: misurata la Mappa con tre endpoint a 403 e
il caso di controllo accanto, rendeva **identica**, senza alcuno stato d'errore.
→ **[ADR-0064](../architecture/decisions/0064-permessi-vicini-gate-per-query.md)**: la nav dichiara
il permesso **primario**, ogni query dichiara il **suo**, e l'assenza da permesso **si dichiara**.

### 2b. La regressione che i fix hanno introdotto

Il gate sulla query **primaria** rendeva **muta** la vista di atterraggio: `permissionGuard`
lasciava passare quando nessuna destinazione è accessibile, motivandolo con «meglio una vista che
mostra il proprio errore» — premessa che il gate ha reso **falsa**, perché la query non parte e
non c'è errore. La Mappa rendeva mare, battigia e **zero ombrelloni**, subito dopo il login.
Corretta alla radice: rotta terminale **`/nessun-accesso`**, un punto per dodici viste.

⚠️ **Trovata dalla review avversariale, non dal gate**, che era verde su tutto.

### 2c. Il resto

- **`PERMISSION_ROLES` spostata in `@coralyn/contracts`**: il banco di prova di `web-staff` la
  **ricopiava a mano** sotto un commento che la dichiarava derivata. Ora è derivata davvero.
- **`mountApp` semina una sessione**: **23 dei 39 spec** che lo usano montavano con `user = null`,
  stato che nell'app non esiste. Tre test dichiarati «staff» passavano **per la ragione sbagliata**.
- **Documenti legali**: DPA e registro trattamenti da 6 a **7** tabelle fuori RLS, con la
  distinzione fra garanzia **in scrittura** (FK composita) e **in lettura** (applicativa) — la
  prima stesura prometteva più di quanto il codice dà, in un allegato destinato alla firma.
- **11 difetti** ulteriori chiusi dopo una seconda verifica avversariale (§2d).

### 2d. Le due review avversariali, in numeri

| | finding | verificati dagli scettici | reali | non-difetti | refutati |
|---|---|---|---|---|---|
| Sui fix (5 lenti × 2 scettici) | 41 | 5 | 4 confermati | — | 1 |
| Sul residuo (17 verificatori + 2 scettici) | 17 temi | 13 | 11 | 4 | 2 |

**Quattro volte su quattro la review ha pagato.** Questa volta ha trovato: una regressione mia, tre
affermazioni false mie, e **tre buchi nel presidio che avevo appena scritto** (non leggeva i `.vue`,
accettava `hasPermission(` dentro un commento, contava le graffe dentro le stringhe).

---

## 3. Baseline su `main` (`fd549d8`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1 file) |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **473 (61)** |
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| api unit | `pnpm --filter @coralyn/api test` | **414 (60)** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **529 (44)** |
| tutto insieme | **`pnpm run test`** | **1268 / 185** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

**Criterio di «ambiente rimesso in piedi»**: `pnpm run test` a **1268/185** e `test:e2e` a
**529/44**. Se i numeri non tornano è l'ambiente, non il codice.

---

## 4. Gotcha

### 4a. Nuovi, verificati in questa sessione

- ⚠️⚠️ **Su `Button.vue` il `disabled` passato come fallthrough attr VINCE sul `:disabled="loading
  || undefined"` interno.** Misurato: con `loading:true` e `disabled:false` l'attributo reso è
  **assente**. Quindi ogni `:disabled` su un `Button` deve **ripetere** la condizione di loading, o
  riapre la finestra di doppio invio. È l'idioma già usato da `MultiPanel.vue` e `RowPanel.vue`;
  `RowCreateForm` e `UmbrellaGeneratorForm` **non** lo fanno (latente, fuori scope).
- ⚠️⚠️ **In TanStack Query v5 `isLoading = isPending && isFetching`.** Con `enabled:false` lo stato
  è `pending` + `fetchStatus:'idle'`, quindi **`isLoading` è FALSE ma `isPending` è TRUE**. Un
  widget legato a `isPending` gira uno scheletro all'infinito; uno legato a `isLoading` rende il
  ramo «vuoto». **Guarda quale dei due usa il widget prima di concludere.**
- ⚠️⚠️ **Vite pre-bundla `@coralyn/contracts`** (`apps/web-staff/vite.config.ts`,
  `optimizeDeps.include`). Dopo aver ricostruito i contracts, un dev server già in esecuzione serve
  la copia vecchia e i simboli nuovi sono `undefined`. Rimedio: `pnpm --filter @coralyn/web-staff
  dev --force`, o cancella `apps/web-staff/node_modules/.vite`. **Succede a ogni build dei
  contracts**: in questa sessione due volte.
- ⚠️ **`@coralyn/contracts` è compilato in CommonJS** (`"type": "commonjs"`): **niente
  tree-shaking**. Chi importa *qualcosa* dai contracts si porta dietro il modulo **intero** —
  `PERMISSION_ROLES` viaggia anche in `web-customer`, che non la usa.
- ⚠️ **Modificare una migration già applicata invalida il suo checksum in `_prisma_migrations`.**
  `migrate deploy` non se ne accorge (verificato), ma `migrate dev` sì. In questa sessione tre righe
  di commento sono state aggiunte e poi **tolte**: il contenuto viveva già altrove.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Un `scan.txt` è finito in `apps/web-staff/src/` e
  **nessun presidio lo ha visto**: vitest include solo `src/**/*.spec.ts`, typecheck e lint ignorano
  l'estensione. Rimosso in `fd549d8`. **Guarda la lista dei file prima di committare.**
- ⚠️ **Il merge su `main` può essere bloccato dal classificatore dei permessi.** In questa sessione
  `git merge --ff-only` è stato negato due volte e poi è passato al terzo tentativo (a distanza).
  **Non aggirarlo** con `reset --hard` o con un push che riscrive `main`: se resta bloccato, chiedi
  all'utente di lanciarlo.

### 4b. Ereditati e ancora validi

- ⚠️ **Su Windows OGNI primitiva di sleep è quantizzata a ~15,6 ms.** Per latenze sotto i 15 ms
  serve uno **spin su `process.hrtime.bigint()`**.
- ⚠️ **Non passare testo con backtick a `node -e` dentro Bash**: la shell li interpreta come command
  substitution e li **cancella in silenzio**. Per Markdown, accenti e non-ASCII usa Edit/Write.
- ⚠️ **Python su Windows traduce `\n` in `\r\n` in text mode**; **via heredoc legge in cp1252**.
  ⚠️ E molti file del repo sono **CRLF**: un `replace` che cerca `\n` non matcha nulla. Usa Edit, o
  gestisci entrambi i terminatori.
- ⚠️ **Esistono DUE presìdi che pretendono RLS**: `rls-isolation.e2e-spec.ts` (`SENZA_RLS`) e
  `apps/api/prisma/reset-dev.core.ts` (`KEEP_LIST`). Il secondo emerge solo con la suite e2e
  **completa**.
- ⚠️ **Prisma ESPRIME le FK composite** e il `@@unique` che serve loro: non appenderle a mano.
- ⚠️ **`packages/contracts/dist` è tracciato in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE e
  va committato.** Distinguili con `git diff --numstat`. → [D-068](../architecture/deferred.md#d-068).
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
- ⚠️ **Il parser di `deferred-registry.ts`** pretende indice ordinato per numero, anchor = ID,
  indice e voci coincidenti ID-per-ID e stato-per-stato, la riga dei conteggi agganciata al totale.
  **Leggi il parser prima di spostare una voce.**
- ⚠️ **`forTenant` vuole un `TenantId`, non una `string`.**
- ⚠️ **Togliere il `throw` dell'anti-overlap in `priceAndWrite` lascia le e2e verdi e NON è un
  buco**: il constraint DB dà lo stesso 409. **Non "correggerlo".**
- **e2e `maxWorkers: 1`**, suite di pacchetti diversi **una alla volta**, **calendario e2e congelato
  al 2026-07-15**.
- **`ApiError` SEMPRE da `@coralyn/data-layer`**; **`@IsUUID` vietato** → `@IsUuidShape()`;
  **P2003 → 409**; un endpoint senza `@RequiresPermission` dà **403** e
  `authorization-coverage.spec.ts` lo intercetta.
- **Su template Vue usa `Edit`, non regex.** **`pnpm --filter X test -- --flag` passa `--` a jest**:
  va senza. ⚠️ E `pnpm --filter X test run <file>` su **vitest** passa `run` come filtro: il comando
  giusto è `pnpm --filter X test run <file>` solo se lo script è `vitest`, altrimenti `… test <file>`.
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
  ⚠️ **«La soluzione meno pigra, più professionale, senza debiti» è una DELEGA, non una scelta:**
  decidi tu e argomenta. In questa sessione ha portato a scartare **tutte e tre** le opzioni
  proposte dal report — per aritmetica misurata, non per gusto — e a proporne una quarta.
- **Nessun merge su `main` senza ok esplicito.** Una slice = un branch = **un commit denso**, poi
  fast-forward e push. ⚠️ Ma **non lasciare nulla solo in locale a fine sessione**: si lavora su più
  macchine. Spingere il **branch** non è un merge.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Un finding è un'ipotesi, non un verbale. Misura il PROBLEMA prima di risolverlo.**
- **Riproduci prima di correggere, e prova la mutazione nei due versi**, contando *quanti* e *quali*
  test diventano rossi, **e dichiarando in quale runner**. ⚠️ Vale anche per i presìdi che scrivi tu.
- **Misura invece di stimare, dichiara lo scope del conteggio**, e **confronta il numero con la
  RISOLUZIONE dello strumento prima di scriverlo**.
- **Correggi il testo falso, non annotarlo sotto.**
- **Se un documento afferma un fatto sul codice, la domanda non è «è ancora vera?» ma «cosa la
  renderebbe rossa se smettesse di esserlo?»**

### 5b. Cosa ha pagato in questa sessione

- ⚠️ **La review avversariale SUI FIX.** È la volta in cui ha reso di più: ha trovato una regressione
  introdotta dalle correzioni stesse, che nessuna suite vedeva. **Non saltarla perché «sto solo
  correggendo».**
- ⚠️ **Verificare i finding sul codice ATTUALE, non sul loro testo.** Nella seconda passata, 4 temi
  su 17 sono risultati **non-difetti** con la prova alla riga, e 2 refutati: agire su tutti e 17
  avrebbe prodotto 6 modifiche inutili.
- **Provare lo strumento prima dell'oggetto misurato.** Il primo estrattore string-aware del presidio
  ha rotto i template literal — 24 blocchi invece di 29 — ed è stato colto **dal suo autotest**.
  Il primo regex di misura sulla Mappa dava un falso positivo agganciando «Non disponibile» della
  legenda.
- **Il caso di CONTROLLO accanto a ogni misura.** Senza, `NOMI_OCCUPANTI: false` sembrava una prova
  e non lo era: usciva `false` anche col caso pieno.

### 5c. Errori miei, da non ripetere

1. **Ho introdotto una regressione chiudendo un difetto**, e il gate verde non l'ha vista.
2. **Ho scritto tre affermazioni false** nella stessa sessione in cui ne correggevo trentotto: una
   sul DPA (documento da firmare), una sullo stato di AUD-012, una sul tree-shaking dei contracts.
3. **Ho inventato la definizione di tre simboli** (`(D−C)/A`) che non potevo verificare, invece di
   dichiarare che la formula non è ricostruibile.
4. **Ho scritto «1256» nel messaggio di commit** quando il totale era 1258.
5. **Ho lasciato entrare `scan.txt` con un `git add -A`.**

Il filo, ormai su sei sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.** Il
corollario di questa: **anche la correzione è codice nuovo, e va rivista come tale.**

---

## 6. Lavori aperti

### 6.1 Da dove ripartire — ⚠️ **si decide CON L'UTENTE, non da soli**

L'utente ha chiuso la sessione 12 dicendo esplicitamente che **la scelta del prossimo lavoro va
ponderata insieme**. Quindi: **non aprire un branch e cominciare.** Leggi questa tabella, verifica
sul codice i numeri che ti sembrano decisivi (sono di seconda mano finché non li rimisuri), e
**presenta all'utente una raccomandazione argomentata con i trade-off**, come al §5a.

| Candidato | Cos'è | Quanto pesa | Perché farlo **ora** | Perché **non** ora |
|---|---|---|---|---|
| **AUD-020 / AUD-021** | Prestazioni: il pre-check anti-overlap carica **tutta** la storia di coperture; **nessuna paginazione** (0 `take`/`skip`/`cursor` su 58 `findMany`) | Slice media, tocca query di dominio e i loro test | Degrada con i dati, quindi peggiora da solo col passare delle stagioni; è misurabile con un fixture grande, quindi il metodo «misura il problema» si applica pulito | Nessun lido reale in esercizio: oggi il degrado è teorico, e la misura va costruita apposta |
| **[D-067](../architecture/deferred.md#d-067)** | Budget di transazione e di pool: `connection_limit`, timeout SMTP, durata massima delle transazioni | **Decisione architetturale**, tocca *ogni* transazione dell'API | ⚠️ **ADR-0063 lo cita come la ragione per cui `StaffPermissionOverride` sta fuori da RLS.** Finché D-067 non è deciso, quella scelta poggia su una premessa non verificata | Richiede una misura vera su carico realistico, che oggi non esiste; deciderlo a naso sarebbe peggio che lasciarlo aperto |
| **[D-068](../architecture/deferred.md#d-068)** | `packages/contracts/dist` tracciato e committato in CRLF | Piccola, ma tocca il flusso di build di tutti | È un gotcha che morde **ogni sessione** (§4b), e ha già causato commit sbagliati in due versi | Nessun motivo forte: è la candidata più a buon mercato |
| **[D-069](../architecture/deferred.md#d-069)** | Presidio sull'indice ADR | Piccola | L'indice è già stato dimenticato una volta | — |
| **AUD-015** | Immagine Docker API single-stage, gira come root (29 advisory, 9 HIGH) | Media | — | ⚠️ **Urgente il giorno del primo deploy, e non un giorno prima: non esiste alcun VPS.** Farla ora significa lavorare su vincoli che non conosciamo ancora |

**Come impostare la conversazione** (il modo che ha funzionato in questa sessione): porta all'utente
**una raccomandazione**, non un menù neutro; dichiara cosa hai verificato e cosa hai preso per buono;
e se pensi che nessuna delle voci in tabella sia la mossa giusta, **dillo e proponi la terza via** —
è esattamente ciò che ha prodotto ADR-0064.

⚠️ Se la risposta è «la meno pigra, la più professionale, senza debiti», **è una delega**: decidi tu
e argomenta. Non significa «la più invasiva» (§5a).

### 6.2 Note lasciate aperte di proposito

- **AUD-012 è CORRETTA** (Fase F), e ADR-0064 **non la riapre**: governa uno stato diverso
  (`enabled:false`, assenza **da permesso**), non `isError` (assenza **da guasto**). Il confine è
  scritto nell'ADR: non confonderli.
- **`RowCreateForm` e `UmbrellaGeneratorForm`** hanno `:disabled` senza ripetere `isPending`
  (vedi §4a): finestra di doppio invio latente, **non toccata** perché fuori dalla slice.
- **La prova visiva dietro login non è stata fatta**: l'agente non può autenticarsi.

### 6.3 Azioni dell'utente

1. **Bloccanti legali**: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
   ⚠️ Materiale nuovo per D-062: la finalità A1 del registro ora nomina i permessi per operatore.
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali.
3. **Igiene branch** — `feat/permessi-configurabili-d063` è mergiato e si può cancellare; sulla
   macchina con 22 branch locali resta la pulizia.

### 6.4 Numeri liberi

**Prossimo ADR libero: 0065.** **Prossima deferred libera: D-070.**

---

## 7. Ancore

- **La slice**: [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md) ·
  [ADR-0064](../architecture/decisions/0064-permessi-vicini-gate-per-query.md) ·
  [spec](../superpowers/specs/2026-07-27-permessi-configurabili-d063-design.md) ·
  [piano](../superpowers/plans/2026-07-27-permessi-configurabili-d063.md)
- **Prerequisito**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **I presìdi nuovi**: [`query-permissions.spec.ts`](../../apps/web-staff/src/test/query-permissions.spec.ts) ·
  [`permission-degradation.spec.ts`](../../apps/web-staff/src/test/permission-degradation.spec.ts) ·
  [`permissionGuard.ts`](../../apps/web-staff/src/router/permissionGuard.ts)
- **Audit**: [report](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings](../audit/findings/)
- **Tenant e RLS**: [`tenant-id.ts`](../../apps/api/src/tenant/tenant-id.ts) ·
  [`rls-isolation.e2e-spec.ts`](../../apps/api/test/rls-isolation.e2e-spec.ts) ·
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
- **Gate dei documenti**: [ADR-0059](../architecture/decisions/0059-gate-link-documenti.md) ·
  [`link-check.ts`](../../packages/docs-lint/src/link-check.ts)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-28 D-063 implementata](2026-07-28-d063-implementata-da-chiudere.md)
