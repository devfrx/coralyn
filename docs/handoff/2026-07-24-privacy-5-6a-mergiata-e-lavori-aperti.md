# Handoff 2026-07-24 (3ª sessione): Privacy 5.6a mergiata + lavori aperti

> **PUNTO D'INGRESSO UNICO.** Stato, baseline verde misurata, gotcha cumulativi (questi **sostituiscono**
> la rilettura degli handoff precedenti), metodo atteso, lavori aperti con ricognizione. Gli handoff più
> vecchi sono **storia**: se un loro testo dice «nessuna pagina legale in nessuna app» o «D-024 resta
> deferito solo il consenso/informativa», è superato da qui.

**`main = origin/main = 24c41ba`**, working tree pulito, nessun branch di lavoro aperto, tutto pushato.

---

## 1. Cosa è stato fatto in questa sessione

**5.6a — Informativa privacy Art. 13 al bagnante (slice D-024, piano A)**: mergiata FF su `main`
(`ad46979..24c41ba`, 24 commit) e pushata con ok esplicito dell'utente. Metodo: brainstorming →
writing-plans → subagent-driven (15 task, reviewer per task) → review finale whole-branch su Opus
(**Ready-to-merge, 0 Critical / 0 Important**) → verifica verde consolidata → merge.

Cosa contiene:
- **API**: nuova entità **`EstablishmentLegalProfile`** (1:1 con `Establishment`, RLS ENABLE+FORCE, policy
  `tenant_isolation`, `onDelete: Cascade`, tutti i campi nullable) + `LegalProfileService`
  (`getForTenant`/`upsert`/`getTitolare`) in **`EstablishmentModule`** (esportato) + 3 endpoint:
  - `GET`/`PUT /establishment/legal-profile` — staff, **admin-only** (`@Roles(Role.Admin)`).
  - `GET /public/informativa/:establishmentId` — **pubblico** (`@Public`), legge **dentro RLS** impostando
    il tenant dall'id in URL; `P2025`→404 tradotto **localmente** nel controller.
  - `GET /customer/me/informativa` — **canale cliente** (`@Public` + `CustomerJwtGuard`), tenant dal JWT
    (no IDOR). Gli ultimi due vivono in un **`InformativaModule`** sottile che riusa il service condiviso.
- **web-staff**: form titolare admin-only (card + `LegalProfileModal`) in `EstablishmentView`; riga
  promemoria + **link anteprima deep-link** nei due form cliente (create/edit). **Nessun consenso salvato.**
- **web-customer**: rotta pubblica **`/privacy`** (`PrivacyView`) che rende l'informativa Art. 13 reale
  (11 sezioni, contenuto versionato in `informativa.content.ts`) + blocco titolare **per-lido**; link in
  `ActivationView` e `MySubscriptionsView`.
- **Docs**: **[ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)**, `deferred.md`
  (D-024 aggiornata; nuove **D-061**/**D-062**), `data-model.md` (ER), `flows.md` (§11).

**Audit di coerenza docs↔codice eseguito a fine sessione: coerente** (unica deriva trovata e corretta:
lo spec §5 diceva modulo `public`, il reale è `informativa`).

## 2. Baseline verde (misurata di prima mano, una suite alla volta, su `24c41ba`)

| Suite | Esito | Comando |
|---|---|---|
| api unit | **278/278** (50 suite) | `corepack pnpm -C apps/api test` |
| api e2e | **406/406** (39 suite) | `corepack pnpm -C apps/api test:e2e` |
| web-staff (incl. ui-kit) | **608/608** (95 file) | `corepack pnpm -C apps/web-staff test` |
| web-customer | **29/29** (6 file) | `corepack pnpm -C apps/web-customer test` |
| web-platform | **18/18** | `corepack pnpm -C apps/web-platform test` |
| typecheck tutti i pacchetti | **exit 0** | `corepack pnpm -r typecheck` (dopo `prisma generate`) |

## 3. Gotcha che costano ore (CUMULATIVI: questi sostituiscono gli handoff precedenti)

### Ambiente / processo
- **Su questo host ogni `corepack pnpm ...` può ri-triggerare un wipe/reinstall di `node_modules`**
  (auto-risposto `true` in non-interattivo). È lento **e cancella il client Prisma di `apps/api`** →
  `pnpm -r typecheck` fallisce su api finché non rigiri **`prisma generate`**. Le suite JS restano ok.
  *(In questa sessione il prompt è comparso senza reinstall reale: verifica prima di farti prendere dal panico.)*
- **Suite di pacchetti diversi SEMPRE una alla volta** (in parallelo = falsi rossi massicci, timeout di
  collection). e2e api sequenziali (`maxWorkers: 1`). Se **tutte** le e2e falliscono in connessione a
  `:5433` → Docker Desktop giù (container `coralyn-db`).
- **`.superpowers/` è gitignorato**; ledger `progress.md` **append-only**. Gli scratch `task-N-*.md`
  **collidono tra sessioni**: prefissali. Usati finora fino a **`task-sj-N`**. **Prossimo libero: `task-sk-N`.**
- **Verifica visiva web-staff/web-customer è dietro login: l'agente non può fare screenshot autenticati** →
  va chiesta all'utente.
- **Nessun merge su `main` senza ok esplicito dell'utente.**

### Legale / GDPR (NUOVI, da questa sessione)
- **Esiste la skill `anthropic-skills:compliance-docs`**: usala per qualunque lavoro legale/GDPR. Produce
  **bozze qualificate, non pareri legali**; impone `⚖️ [DA VALIDARE CON LEGALE]` sui punti a giudizio,
  `[COMPILARE: …]` sui dati mancanti (**mai inventarli**) e la **riverifica via web search** della normativa
  nazionale corrente. *(Se non risulta disponibile, l'utente può ricaricare le skill.)*
- **Ruoli multi-tenant, il fork che cambia tutto** ([ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)):
  verso il **bagnante** il **titolare** è il **lido** (ogni tenant, diverso), Coralyn è **responsabile**
  (Art. 28); verso l'**operatore** il titolare è **Coralyn**. Sono **piani distinti**: non mescolarli nella
  stessa slice (è l'errore più comune nelle policy dei SaaS).
- **Base giuridica = contratto/obbligo legale, NON consenso.** Art. 13 obbliga a *informare*, non a
  raccogliere consenso. **Non introdurre checkbox «acconsento»** per i dati contrattuali: implicherebbe una
  base sbagliata. Nessun flag di consenso è salvato da nessuna parte (verificato).
- **Due nature di `[COMPILARE]`, non confonderle:**
  1. **Campi del titolare** → nel DB sono `NULL`; la stringa **non è mai salvata**. `PrivacyView.vue`
     (`const TODO = '[COMPILARE]'`) la stampa **a render-time**. Sparisce da sola quando **quel** lido
     compila il form. È **per-lido**: lidi diversi hanno stati diversi, isolati da RLS.
  2. **Hosting / trasferimenti extra-UE** → letterali **hardcoded** in `informativa.content.ts:44,74`.
     **Nessun lido può risolverli dal form**: sono fatti a livello Coralyn, uguali per tutti. Si sistemano
     con **una modifica a quel file** quando l'hosting è deciso.

### API / NestJS (NUOVI)
- **`JwtAuthGuard` + `RolesGuard` sono globali (`APP_GUARD`)**: ogni rotta non-staff **deve** avere
  **`@Public()`** (`src/identity/public.decorator.ts`). Il canale cliente usa il combo
  **`@Public()` + `@UseGuards(CustomerJwtGuard)` + `@CurrentCustomer()`** (precedente: `GET /customer/me`).
- **`PrismaExceptionFilter` lascia `P2025` a 500 di proposito** (c'è un test dedicato): quindi
  `findUniqueOrThrow` **non** produce automaticamente un 404. Se ti serve il 404, traducilo **localmente**
  nel controller con un catch **stretto** (`code === 'P2025'`, rethrow di tutto il resto) — vedi
  `public-informativa.controller.ts`.
- **RLS**: `prisma.forTenant(tenantId, tx => …)` apre una transazione e setta
  `set_config('app.current_tenant', …, true)`. Idioma di policy da copiare verbatim:
  `nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"` in **USING e WITH CHECK**.
  Per una lettura pubblica **by-id** si può restare **dentro** RLS (il tenant è noto dall'URL): non serve
  derogare. Le tabelle fuori-RLS restano solo quelle del canale cliente (tenant ignoto prima del token).
- **Difesa in profondità sulle scritture**: `ValidationPipe({ whitelist: true })` **strippa** campi iniettati
  nel body (es. un `establishmentId` malevolo) prima del service; RLS `WITH CHECK` è la seconda linea.
- **Migration**: sempre `--create-only`, **leggile**, e **appendi il blocco RLS a mano** (Prisma non lo
  genera). Dopo `migrate dev` su `coralyn_dev`, **`migrate deploy` anche su `coralyn_test`** o le e2e
  falliscono in modo fuorviante. Indici parziali (`Umbrella`) e `NULLS NOT DISTINCT` (`Rate_signature_key`)
  sono invisibili al DSL: **mai `prisma db push`**.
- Relation opzionale = FK **`SET NULL` silenzioso** → dichiara sempre `onDelete` (residui in **D-059**).

### Frontend (cumulativi + NUOVI)
- **`CustomerMeDTO` NON espone `establishmentId`** al FE di web-customer (solo `establishmentName`): il
  tenant vive nel JWT lato server. Per dati per-tenant serve un endpoint `/customer/me/...`, non un id dal FE.
- **`queryResource` supporta `enabled?: () => boolean`** (web-customer e web-staff). **Usalo per gateare le
  query condizionali**: senza gating, una vista pubblica montata da sloggati spara la query autenticata →
  `401` → l'interceptor tenta il refresh → **logout + redirect** (bug reale evitato in `PrivacyView`).
- **Convenzione `VITE_*` introdotta ora**: prima non esisteva. `apps/web-staff/src/vite-env.d.ts` dichiara
  `ImportMetaEnv`; c'è `.env.example`. **`VITE_WEB_CUSTOMER_URL` va settata al deploy** (origin di
  web-customer) o l'anteprima operatore cade su un `/privacy?e=` relativo.
- **I contenuti dei Modal sono portalati/teleportati**: nei test usa `document.querySelector(...)`, **non**
  `w.get(...)`; smonta il wrapper **prima** di pulire `document.body` (trappola teardown Presence/Select).
- **`pushToast(message: string)`** — firma a stringa, non oggetto.
- **`Popover`**: props+emit espliciti (`open?: boolean` + `update:open`), **non** `defineModel` (la
  coercizione Boolean romperebbe `defaultOpen`). Contratto `v-model:open` invariato.
- **`Calendar`** (ui-kit, reka-ui): `v-model` stringa ISO `yyyy-mm-dd`, confine ISO↔`CalendarDate` via
  `parseDate`/`.toString()`; `@internationalized/date` è dep **diretta** di ui-kit. Test: helper
  `pickCalendarDay` (celle portalate, escludi `data-outside-view`); oracolo «oggi» via
  `today(getLocalTimeZone())`; il selezionato vince su «oggi» con la guardia strutturale
  `[&[data-today]:not([data-selected])]`.
- **`ConfirmDialog`** mette la `description` nel **BODY** (non header) + `Modal.ariaDescription` sr-only.
- **`Select`** (reka-ui): helper `selectOption(trigger, label)` nei test (mai `.setValue()`), sentinella
  privata `SELECT_EMPTY` per `value=""` (≠ `__none__`/`__new__`, che sono valori applicativi reali).
- **reka-ui vive SOLO in `packages/ui-kit`**; MSW di web-staff in `src/mocks/server.ts` (`handlers.ts`
  volutamente vuoto). **web-customer NON usa MSW**: i suoi spec mockano il composable con `vi.mock`.
- **Rail fila Cantiere**: `Selection.row.focus 'generate'|'danger'`, `RowPanel` scrolla+evidenzia;
  `select-row` resta senza focus.
- **Niente em dash `—` nel testo mostrato all'utente** (usa `–` come segnaposto di cella). **Attenzione:
  `docs/` è FUORI da questo perimetro** — gli ADR e i design doc usano `—` e vanno lasciati coerenti coi
  fratelli. Non «correggere» i doc.
- **Non registrare una rotta il cui componente lazy non esiste ancora**: web-customer non ha lo shim
  `declare module '*.vue'` → `vue-tsc` va rosso (TS2307). Rotta e view nascono nello **stesso** task.

### Test / DB
- **«Oggi» è congelato in DUE punti**: `apps/api/test/jest-frozen-calendar.setup.ts` (tutte le e2e api al
  **2026-07-15**, finge solo `Date`) e il `beforeAll` di `AbsenceReleaseModal.spec.ts` in web-customer. Le
  date nei test sono **letterali** dentro la stagione seed `[2026-05-01, 2026-09-30]`: **non sono date
  vecchie da aggiornare**. Leggi [e2e frozen calendar](2026-07-22-e2e-frozen-calendar.md) **prima** di
  scrivere e2e.
- Nelle e2e **riusa gli helper di bootstrap/login esistenti** (`createTestApp`/`createUser`/`login`,
  provisioning+activate per il canale cliente): non reinventare seed o flussi di auth.
- Warning jest «worker process has failed to exit gracefully»: **pre-esistente**, non inseguirlo.
- Dopo ogni modifica gira l'**intera** suite del pacchetto toccato, mai il solo spec.

### Convenzioni docs
- **`deferred.md` usa ID sequenziali `D-0NN`** senza eccezioni: **l'ultimo assegnato è D-062**, il prossimo
  libero è **D-063**. Le etichette di slice (es. «5.6b») stanno **nel testo**, mai nella colonna ID.
- **Il prossimo ADR libero è `0056`** (l'ultimo è
  [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)).
- Gli ADR nuovi si modellano su un fratello recente dello stesso dominio (per il legale:
  [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)), disclaimer legale incluso.

## 4. Metodo atteso (ha pagato: 15 task, 0 bug sfuggiti ai gate)

- Skill **`dev-discipline` + `dev-communication` SEMPRE**; **`frontend-design`** sul FE; **`design-docs`**
  quando tocchi dominio/dati/flussi/decisioni; **`compliance-docs`** per il legale.
- Le **decisioni dell'utente si raccolgono in `brainstorming`**, non si assumono. In questa sessione erano
  sue: forma del deliverable, decomposizione A/B/C, modello dati, touchpoint di raccolta, anteprima
  operatore. Le scelte strutturali si **segnalano prima**, non si eseguono in autonomia.
- Lavoro multi-task: **brainstorming → writing-plans → subagent-driven-development**, con **reviewer per
  task** e **review finale whole-branch su Opus**, fix-loop con re-review. Ledger `.superpowers/sdd/progress.md`
  in append (è la recovery map dopo una compaction: fidati di quello e di `git log`, non della memoria).
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.**
- Gate che hanno funzionato, da replicare: il reviewer ha trovato un **break di convenzione** (ID deferred),
  un **self-review fattualmente errato** dell'implementer, e ha confermato una **deviazione giustificata**
  (P2025→404). L'audit finale docs↔codice ha trovato una deriva che nessun task-review poteva vedere.
- **Adjudica i rilievi, non applicarli meccanicamente**: un «Important» del reviewer sugli em dash nei
  `docs/` era **over-reach di una mia constraint** e l'ho respinto motivando. Il piano non è vangelo: due
  suoi difetti reali (rotta prematura, query non gateate) sono stati corretti **nel piano** prima di eseguirli.

## 5. Lavori aperti (con ricognizione)

### 5.1 Residui diretti di 5.6a (piccoli, ma sono i più «dovuti»)
- **`VITE_WEB_CUSTOMER_URL` al deploy** di web-staff (vedi §3 Frontend). Senza, l'anteprima operatore usa
  un path relativo.
- **Hosting e trasferimenti extra-UE**: due `[COMPILARE]` letterali in
  `apps/web-customer/src/features/legal/informativa.content.ts:44,74`. Servono i dati dell'hosting reale
  (decisione dell'utente) → modifica di due righe + aggiornamento test se asseriscono la copy.
- **Validazione legale/DPO** dell'informativa prima della pubblicazione reale (i punti `⚖️` sono nello
  spec §12 e in ADR-0055). **Non è un lavoro da agente**: è una consegna all'utente.
- **Follow-up opzionali non bloccanti** (dalla review Opus): (a) `PrivacyView` passa `eid.value` come
  snapshot a `usePublicInformativa` — l'id non è reattivo se lo **stesso** componente montato cambia `?e=`
  (impatto reale nullo: il deep-link apre un tab nuovo); (b) `Promise.all` di due read dentro una
  interactive tx in `getTitolare` (stile, sequenziale sarebbe più prudente); (c) tre gap di copertura test
  minori: `create.establishmentId` nell'unit di `upsert`, e2e del **null-clearing** `PUT`, conversione
  `''`→`null` / `dpoContact`-clear nello spec del modal.

### 5.2 Slice legali successive (decomposte da 5.6, tracciate)
- **D-061 (slice 5.6b)** — **Privacy policy operatori** (Coralyn **titolare**) + **cookie/imprint** per
  `web-staff`/`web-platform`. Piano B, distinto da 5.6a. Nota tecnica già verificata: **nessun SDK di
  analytics/tracking e nessun cookie** in tutte e tre le app (solo `localStorage` tecnico per i token) →
  verosimilmente **niente banner di consenso**, solo la dichiarazione. Trigger: onboarding del primo lido
  reale. Qui si valuterà anche l'estrazione a un package legale condiviso (oggi sarebbe prematura: un solo
  consumatore reale).
- **D-062 (slice 5.6c)** — **DPA Coralyn↔lido (Art. 28)** + **registro dei trattamenti (Art. 30)**, come
  documenti in `docs/legal/`. Formalizza contrattualmente la qualificazione ratificata da ADR-0055.
  Trigger: primo contratto con un lido reale.

### 5.3 Backlog tecnico (indipendenti, meglio in branch separati)
- **D-059** (aperta) — relation opzionali residue con `ON DELETE SET NULL` implicito:
  `Umbrella.umbrellaTypeId`, `Booking.packageId`; caso a parte `Rental.customerId` (l'erasure GDPR conta
  solo le `Booking`: un cliente con soli noleggi verrebbe hard-deletato e i noleggi perderebbero il
  riferimento — **comportamento emergente, non una decisione**). Impatto basso (le guardie 409 coprono i
  flussi normali, resta la finestra read-committed). Trigger: prossimo branch che tocca tipologie/pacchetti,
  o una decisione esplicita su erasure↔noleggi. `--create-only`.
- **Follow-up a11y** — combobox con `<label>` **fratello non associato** (senza `for`) restano senza nome
  accessibile (es. `MapView`, campi Tipo/Cliente/Pacchetto del modale prenotazione). Due strade: wrapper
  `<Field>` o `aria-label` esplicito. Fare un grep dei `<label` non associati.
- **Follow-up 5.3** — scorciatoie «Oggi + salti» (inizio/fine stagione, ±7) nel `Calendar`; migrare i **16
  `<input type="date">`** residui in modali/form al `Calendar` tematizzato.
- **Follow-up rail fila (flash-replay)** — il flash non si ri-triggera con lo **stesso** intent su una fila
  **diversa** a pannello già aperto (`data-focus` resta `'on'`, l'animazione non replaya); **lo scroll è
  sempre corretto**. Fix: forzare un reflow o keyare le sezioni su `focus`+`row.id`. Non bloccante.
- **`ConfirmDialog` senza `description`**: se una conferma non passa `description` e non ha slot default il
  body resta vuoto (mini-gap; nessuna conferma attuale è in questo caso). Opzionale.

## 6. Verifica visiva pendente (per l'utente)

5.6a **non è mai stata vista in un browser autenticato**. Da provare quando vuoi:
1. **web-staff → Stabilimento**: la card «Informativa privacy» (solo admin) apre il modal, salva i dati del
   titolare, e il toast conferma.
2. **web-staff → Clienti → Nuovo cliente / Modifica**: compare la riga promemoria con «apri anteprima» che
   apre `/privacy?e=<id>` su web-customer in un tab nuovo (serve `VITE_WEB_CUSTOMER_URL`, vedi §5.1).
3. **web-customer → `/privacy`**: da sloggato mostra il testo fisso col titolare generico; dopo
   l'attivazione mostra i dati del **proprio** lido; i campi non compilati appaiono come `[COMPILARE]`.
4. **Multi-tenant**: compilando il profilo del lido A, l'informativa del lido B resta `[COMPILARE]`
   (isolamento RLS).

## 7. Ancore

- 5.6a: [spec](../superpowers/specs/2026-07-24-privacy-informativa-art13-5-6a-design.md) ·
  [piano](../superpowers/plans/2026-07-24-privacy-informativa-art13-5-6a.md) ·
  [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md).
- GDPR erasure (già chiuso, il fratello di ADR-0055):
  [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md).
- Registro decisioni rimandate: [deferred.md](../architecture/deferred.md) (D-059 aperta; D-061/D-062 nuove;
  D-024 = piano A chiuso).
- Calendario e2e congelato (**da leggere prima di scrivere e2e**):
  [2026-07-22](2026-07-22-e2e-frozen-calendar.md).
- Handoff precedente (storia: Calendar day-nav 5.3, fix rail fila e ConfirmDialog):
  [2026-07-24 (2ª)](2026-07-24-calendar-daynav-fix-ui-e-lavori-aperti.md).
- Design system e modello: `docs/design/design-system.md` · `docs/design/data-model.md` ·
  `docs/design/flows.md` (§11 = informativa).
- Ledger subagent-driven: `.superpowers/sdd/progress.md` (append-only, gitignorato).
