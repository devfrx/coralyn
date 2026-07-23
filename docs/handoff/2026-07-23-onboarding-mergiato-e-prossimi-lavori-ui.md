# Handoff 2026-07-23 (sera): onboarding mergiato, prossimo blocco di lavoro UI/UX + legale

> **Leggi questo per primo: è il punto d'ingresso unico.** Contiene stato del repo, baseline verde,
> gotcha che costano ore, metodo atteso e la ricognizione già fatta sui **sette lavori** che l'utente
> ha indicato per la prossima sessione (§5). Gli handoff precedenti restano validi come storia; i
> gotcha di quelli sono **riportati qui in forma cumulativa**, quindi non serve rileggerli tutti.

**`origin/main = c7a2467`**, working tree pulito, nessun branch di lavoro aperto, tutto pushato.

---

## 1. Cosa è stato fatto in questa sessione

**Onboarding guidato di prima configurazione** (era la §5 dell'handoff precedente, allora non ancora
progettato). Percorso completo: brainstorming con l'utente, spec, piano a 13 task, esecuzione
subagent-driven con reviewer per task, review finale whole-branch, fix-loop, gate visivo dell'utente,
merge fast-forward su `main` con ok esplicito. 18 commit, nessuna migration, nessun debito lasciato.

Cosa esiste ora che prima non c'era:

- **`GET /api/establishment/setup-status`** (admin-only): misura la completezza della configurazione
  sulla catena reale dei prerequisiti (struttura, fasce, stagioni *usable*, tariffe). La logica di
  giudizio è una **funzione pura**, `computeSetupStatus`
  ([setup-status.projection.ts](../../apps/api/src/establishment/setup-status.projection.ts)), separata
  dalle query ([setup-status.service.ts](../../apps/api/src/establishment/setup-status.service.ts)).
- **Wizard `/onboarding`** in web-staff (admin-only, a piena larghezza): sei passi (Benvenuto,
  Struttura, Fasce, Stagione, Listino, Riepilogo) che **orchestrano gli endpoint già esistenti**, non
  ne introducono di nuovi. Alla riapertura riprende dal primo passo incompleto.
- **Ingressi**: card «Configurazione guidata» con Callout in Stabilimento, empty-state con CTA nella
  Mappa (CTA solo per admin, l'empty-state informativo lo vede anche lo staff).
- **`setupComplete`** in `PlatformEstablishmentDTO` e badge «Da configurare» nella lista lidi della
  Platform Console (PII-free, coerente con ADR-0040).
- **[ADR-0054](../architecture/decisions/0054-onboarding-incrementale-setup-status.md)**, sezione 10 di
  [flows.md](../design/flows.md), mockup [onboarding-wizard.html](../design/mockups/onboarding-wizard.html).

**La decisione architetturale che conta** (il resto discende da lì): l'utente chiedeva un onboarding
«atomico». È stato **rifiutato l'endpoint aggregato transazionale** e adottato il modello incrementale
con ripresa, perché l'aggregato avrebbe creato un secondo write-path da mantenere per sempre in
parallelo ai sei service esistenti, e comunque non sarebbe stato applicabile al rilancio su un lido già
operativo (dove il dominio vieta i reset distruttivi). «Atomico» è quindi una proprietà **del singolo
passo**; «completo» è uno stato **misurato dal server**, non dedotto dal client. Il perché completo sta
nell'ADR-0054.

**Il vincolo di lungo periodo generato da questa scelta** (segnalato dalla review finale e cablato nel
codice): i 422 di `throwPriceError` ([bookings.service.ts:194](../../apps/api/src/bookings/bookings.service.ts))
sono la definizione operativa di «lido non configurato». Se lì nasce una nuova reason di configurazione
mancante e **non** viene riflessa in `computeSetupStatus`, il setup-status dichiarerà «completo» un lido
che poi fallisce la prenotazione. C'è un commento-sentinella nel punto in cui il prossimo sviluppatore
passerà per forza.

## 2. Baseline verde (misurata di prima mano sul mergiato, una suite alla volta)

| Suite | Esito | Comando |
|---|---|---|
| api unit | **275/275** (49 suite) | `corepack pnpm -C apps/api test` |
| api e2e | **397/397** (36 suite) | `corepack pnpm -C apps/api test:e2e` |
| web-staff (include ui-kit) | **578/578** (89 file) | `corepack pnpm -C apps/web-staff test` |
| web-customer | **25/25** (5 file) | `corepack pnpm -C apps/web-customer test` |
| web-platform | **18/18** (6 file) | `corepack pnpm -C apps/web-platform test` |
| typecheck (tutti i pacchetti, api compresa) | exit 0 | `corepack pnpm -r typecheck` |

## 3. Gotcha che costano ore (cumulativi: questi sostituiscono la lettura degli handoff precedenti)

**Test e ambiente**

- **Suite di pacchetti diversi SEMPRE una alla volta**, mai in parallelo: su questo host la contesa
  produce falsi rossi massicci. Se una suite mostra errori di *collection* con 0 test rossi, è il flake
  noto: rilancia quella suite da sola.
- Le **e2e api sono sequenziali per configurazione** (`maxWorkers: 1` in `apps/api/test/jest-e2e.json`,
  con la chiave `"//"` che ne porta il motivo). Non rimuoverlo: le e2e condividono un solo
  `coralyn_test` e in parallelo lo lasciano sporco in modo persistente. Recovery:
  `DATABASE_URL=…coralyn_test npx prisma migrate reset --force --skip-seed`.
- Se **tutte** le e2e falliscono in connessione a `:5433`, Docker Desktop è giù (container `coralyn-db`).
- Regola cross-file: dopo ogni modifica gira l'**intera** suite del pacchetto toccato, mai il solo spec.
- Warning jest «worker process has failed to exit gracefully»: pre-esistente su questo host, non inseguirlo.
- **`corepack pnpm -C <app> test -- <pattern>`**: su questo host il passaggio del pattern dopo `--` a
  volte non arriva a vitest. Fallback verificato: `corepack pnpm -C <app> exec vitest run <pattern>`.

**«Oggi» è congelato in DUE punti, per sempre** (il contratto è scritto in testa a entrambi i file):
`apps/api/test/jest-frozen-calendar.setup.ts` (tutte le e2e api al **2026-07-15**, finge SOLO `Date`) e
il `beforeAll` di `apps/web-customer/.../AbsenceReleaseModal.spec.ts` (stesso istante). Le date di test
sono **letterali** dentro la stagione seed `[2026-05-01, 2026-09-30]`: non sono date vecchie da
aggiornare. La suite unit api NON è congelata. Il perché sta in
[e2e frozen calendar](2026-07-22-e2e-frozen-calendar.md), da leggere prima di scrivere e2e.

**Prisma / DB**

- `prisma migrate dev` applica **solo** a `coralyn_dev`: dopo ogni migration serve `migrate deploy`
  anche su `coralyn_test`, o le e2e falliscono in modo fuorviante.
- Una relation resa **opzionale** fa degradare la FK a `ON DELETE SET NULL` **senza dirtelo**: dichiara
  sempre `onDelete` esplicito. Le residue non decise sono in **D-059**.
- L'**indice unico parziale** su `Umbrella` è invisibile al DSL Prisma: un `migrate dev` che tocca
  `Umbrella` può generarne il DROP. **Genera sempre le migration con `--create-only` e leggile.** Idem
  per `Rate_signature_key` (`NULLS NOT DISTINCT`): mai `prisma db push`.

**Frontend**

- **reka-ui vive SOLO dentro `packages/ui-kit`** (dipendenza dichiarata lì, versione 2.10.1): le app non
  la importano mai, consumano i wrapper. Oggi la usano `Modal`, `Drawer`, `NavDrawer`, `Popover`,
  `HoverCard`, `ConfirmDialog`; NON la usano `Select` e `SegmentedControl` (fatti a mano).
- Negli spec reka-ui serve stubbare `ResizeObserver` (assente in jsdom) e cercare il contenuto
  portalato su `document.body`: modelli già pronti in `Popover.spec.ts` e `Modal.spec.ts`.
- **Due test proteggono lo stile e vanno messi in conto prima di ritoccare la UI**:
  `packages/ui-kit/src/components/Select.spec.ts` asserisce **l'elenco esatto delle classi Tailwind** del
  select, e `packages/ui-kit/src/styles/motion.spec.ts` legge `theme.css` e asserisce token e keyframes.
  Non sono ostacoli da aggirare: sono il punto in cui dichiarare che il cambio di stile è voluto.
- Gli handler MSW di web-staff stanno in `src/mocks/server.ts`; `src/mocks/handlers.ts` è **volutamente
  vuoto** (dev non monta un worker). Non aggiungere handler nel file sbagliato.
- Nei test, il submit di un form si scatena con `.trigger('submit')` sul bottone: in questo setup jsdom
  il `click` su `type="submit"` non fa bubbling al form.
- I pannelli dell'ispettore Cantiere si cablano in **un solo** punto: `InspectorPanels.vue`. I form si
  sincronizzano **per id**, non per identità oggetto (trade-off documentato in `SectorPanel.vue`).
- vue-query: `mutate()` perde le callback se il componente si smonta prima della risposta, quindi usa
  `mutateAsync().then()` nei flussi che chiudono il pannello; nei componenti che restano montati (per
  esempio i passi del wizard) `mutate` + `onSuccess` va benissimo.
- Esc globale con guardia sui dialog aperti; `enableAutoUnmount(afterEach)` negli spec che montano viste
  con listener su `window`; `:disabled` esterno su `Button` sempre in OR col pending; `ConfirmDialog`
  **solo** per azioni distruttive; niente hex fuori da `theme.css`; **non esiste tema dark**.
- **Verifica visiva di web-staff**: dev usa il backend reale (no MSW), proxy `/api` verso `:3000`, DB
  `:5433`, e c'è un **login gate**. L'agente non può fare screenshot autenticati da solo: la prova visiva
  va chiesta all'utente.

**Processo**

- `.superpowers/` è **gitignorato**: i report dei subagent e il ledger `progress.md` vivono solo su
  disco, non nei commit. Il ledger si **appende**, non si sovrascrive.
- I file scratch vanno prefissati per sessione (usati finora: `task-N`, `task-ls-N`, `task-sc-N`,
  `task-sd-N`, `task-se-N`, `task-sf-N`, `task-sg-N`; **prossimo libero: `task-sh-N`**).

## 4. Metodo atteso (ha pagato: 13 task, 1 solo fix-loop, 2 difetti veri presi dai gate)

- Skill `dev-discipline` + `dev-communication` sempre; `frontend-design` sul FE; `design-docs` quando la
  modifica tocca dominio, dati, flussi o decisioni architetturali.
- Lavoro multi-task: **brainstorming → writing-plans → subagent-driven-development**, con reviewer per
  task e **review finale whole-branch su modello top**. Il fix-loop con re-review non si salta.
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.** In tre sessioni consecutive la diagnosi
  ovvia era sbagliata e un probe minimo l'ha smontata.
- Le decisioni strutturali si **segnalano prima**, non si eseguono in autonomia. **Nessun merge su main
  senza ok esplicito dell'utente.**
- Quando l'utente delega una scelta con un criterio («la soluzione più professionale, senza debiti»),
  la si prende, la si **dichiara** e si spiega perché: in questa sessione è così che è stato rifiutato
  l'endpoint aggregato.
- Due esempi concreti di gate che hanno funzionato, da replicare: la review finale ha trovato che
  l'empty-state della mappa scattava **anche in caso di errore API** (un lido configurato si vedeva dire
  «non è ancora configurata»); un reviewer per task ha trovato una copy divergente tra due Callout che
  descrivono la stessa condizione.

---

## 5. PROSSIMO LAVORO: sette item indicati dall'utente

⚠️ **Nessuno di questi è progettato.** Sotto c'è la **ricognizione verificata sul codice** (percorsi e
righe reali, non presunti) più le **domande aperte**, che sono decisioni dell'utente: vanno poste in
`brainstorming`, non decise in autonomia. Sono lavori tra loro indipendenti: si possono affrontare in
branch separati, e conviene farlo perché tre di essi (Select, navigazione giorni, em dash) toccano molti
file in modo trasversale.

**Ordine consigliato** (dal più contenuto e a rischio zero al più strutturale): 5 → 4 → 1 → 2 → 6 → 3 → 7.

### 5.1 Sidebar (blocco lido e blocco utente con il CTA logout)

- Tutta la sidebar è **un solo file**: [SidebarNav.vue](../../apps/web-staff/src/app/SidebarNav.vue) (68
  righe). [Sidebar.vue](../../apps/web-staff/src/app/Sidebar.vue) è solo il wrapper `aside` desktop
  (`w-[248px]`, `lg:flex`); su mobile lo stesso `SidebarNav` è montato dentro `NavDrawer`
  ([AppShell.vue:21,27](../../apps/web-staff/src/app/AppShell.vue)). Una modifica vale per entrambi i
  contesti: verificarla anche in fascia compatta.
- **Blocco lido** (righe 36-43): bottone che naviga a `/establishment`, icona `waves` con **gradiente
  inline hardcoded**, nome del lido da `session.establishmentName`, stagione da `useActiveSeason`.
  ⚠️ Alla riga 42 c'è una **chevron-down puramente decorativa**: sembra un menu a tendina ma non apre
  nulla. È il difetto UX più evidente del blocco.
- **Blocco brand** (righe 29-35): logo, «Coralyn» e «Gestionale lidi» hardcoded.
- **Blocco utente** (righe 56-66): avatar con iniziali derivate dall'email, email, ruolo, e il **logout
  come bottone solo-icona** (riga 64, `aria-label="Esci"`). Per confronto, la Platform Console usa un
  `Button variant="secondary"` **con il testo «Esci»**
  ([PlatformShell.vue:43-46](../../apps/web-platform/src/app/PlatformShell.vue)): le due app divergono.
- L'array `nav` è hardcoded (righe 14-23, 8 voci) e **non filtra per ruolo**: le rotte admin-only
  (`/establishment/structure`, `/onboarding`) non sono in sidebar e si raggiungono solo dalla pagina
  Stabilimento.
- Test esistente: `apps/web-staff/src/app/Sidebar.spec.ts`.
- **Domande per l'utente**: la chevron deve diventare un vero menu (cambio lido? impostazioni?) o
  sparire? Il logout resta icona o diventa testo, e va allineato a web-platform? Le voci admin-only
  entrano in sidebar con un filtro per ruolo?

### 5.2 Select: componente per le option e freccia attaccata al bordo

- [Select.vue](../../packages/ui-kit/src/components/Select.vue) è **un `<select>` nativo di 15 righe**,
  senza `appearance-none`, senza icona propria e con padding orizzontale simmetrico (`px-3.5`). La
  freccia che tocca il bordo è **quella nativa del browser**: non è uno stile del repo, è l'assenza di
  stile. Non esiste alcun componente per le option: si passano via slot o via prop `options`.
- Impatto: **15 file consumatori, circa 24 istanze**, tutti in `apps/web-staff/src/features/`
  (i più densi: `PricingView.vue` 6 usi, `MapView.vue` 3, `StepStructure.vue` 3, i pannelli del
  Cantiere 1-2 ciascuno). Nessun uso in web-platform e web-customer.
- Il pattern del repo per un controllo ricco è **reka-ui dietro ui-kit** (vedi §3): reka-ui 2.10 offre le
  primitive `SelectRoot`/`SelectTrigger`/`SelectContent`/`SelectItem`, coerenti con come sono già fatti
  `Popover` e `Modal`.
- ⚠️ `Select.spec.ts` asserisce l'elenco esatto delle classi Tailwind: cambiando lo stile quel test va
  aggiornato **deliberatamente**, ed è il posto giusto in cui dichiarare la nuova resa.
- **Decisione strutturale da porre**: (a) fix minimo, restando su `<select>` nativo con
  `appearance-none` più icona e padding a destra (rischio zero, nessun cambio di API, ma il menu resta
  quello del sistema operativo e le option non si possono stilare); oppure (b) `Select` custom su
  reka-ui con un componente `Option` dedicato (menu stilabile, coerente col resto di ui-kit, ma è una
  migrazione che tocca 15 file e va fatta preservando `v-model` e la prop `options`). L'utente ha
  chiesto sia il componente per le option sia il fix della freccia, il che punta verso (b), ma il modo di
  arrivarci (big-bang oppure `Select` nuovo affiancato e migrazione a ondate) è una sua scelta.

### 5.3 Navigazione tra giorni con popup calendario

- Non esiste un componente: il controllo è **inline nella Topbar**, righe 38-45 di
  [Topbar.vue](../../apps/web-staff/src/app/Topbar.vue). Due bottoni chevron chiamano `shiftDay(±1)`, e
  l'etichetta ha sopra un **`<input type="date">` nativo reso invisibile** (`absolute inset-0 opacity-0`)
  che apre il calendario del browser.
- Stato: `session.activeDate` (ISO `yyyy-mm-dd`) nello store; utility in `apps/web-staff/src/lib/dates.ts`
  (`todayIso`, `addDays`, `clampDate`). La formattazione dell'etichetta è **interamente in UTC** per non
  reintrodurre aritmetica in ora locale (commento alle righe 14-15: è una convenzione, non un caso).
- Il controllo appare solo dove `meta.usesDate === true`: `/map`, `/bookings`, `/rentals` (tre rotte).
  `RenewalsView` usa `activeDate` **senza** avere il navigatore.
- **In tutto il monorepo non esiste alcun date-picker**: 16 punti usano `<input type="date">`, alcuni via
  `Input` di ui-kit, altri con classi locali (incoerenza di resa già presente). ui-kit non ha `Calendar`
  né `DatePicker`.
- reka-ui 2.10 ha le primitive calendario/date-picker: un `Calendar` in ui-kit servirebbe sia a questo
  lavoro sia, potenzialmente, ai 16 input sparsi.
- **Domande**: il nuovo controllo resta in Topbar o diventa un componente ui-kit riusabile? Deve
  guadagnare scorciatoie («Oggi», «Domani», settimana)? Il calendario nuovo sostituisce anche gli
  `<input type="date">` delle modali (lavoro molto più ampio) o solo la navigazione giorni?

### 5.4 Centrare la schermata Stabilimento

- Fatto verificato, e **contraddice in parte la premessa**: `EstablishmentView` è l'**unica** vista con un
  `max-w`. Ha `max-w-[940px] px-[26px] pb-[30px] pt-[22px]` **senza `mx-auto`**
  ([EstablishmentView.vue:116](../../apps/web-staff/src/features/establishment/EstablishmentView.vue)),
  quindi resta ancorata a sinistra. Le altre sette viste ordinarie (`Bookings`, `Customers`, `Pricing`,
  `Report`, `Renewals`, `Rentals`, `RentalCatalog`) usano `px-[26px] pb-[30px] pt-[22px]` **a larghezza
  piena, senza cap e senza centraggio**; `MapView` e `EstablishmentStructureView` usano layout
  `h-full flex-col`; `/onboarding` è a piena larghezza per scelta esplicita (commento nel file).
- Quindi «coerente con tutte le altre viste» e «centrata» sono due esiti **diversi**: la coerenza vuole
  la rimozione del `max-w` (piena larghezza), il centraggio vuole `mx-auto` mantenendo i 940px.
  **Domanda secca da porre all'utente**, una riga di codice in entrambi i casi.

### 5.5 Rimuovere gli em dash

- Conteggio reale (righe che contengono almeno un em dash `—`, U+2014):
  **67** nei sorgenti UI delle app (`.vue`/`.ts` sotto `apps/*/src`, spec esclusi), **10** in
  `apps/api/src`, **59** nei file di test, **10** in `packages/contracts/src` (zero in `ui-kit/src`),
  **5777** in `docs/`.
- I file UI più densi: `CustomerDetailView.vue` (6), `RentalsView.vue` (5), `RenewalsView.vue` (3),
  `MapView.vue` (3), poi una coda di file con 2.
- ⚠️ **Tre distinzioni che vanno decise prima di partire, o il lavoro diventa una regressione:**
  1. Una parte degli em dash nei sorgenti è in **commenti di codice**, non in testo mostrato all'utente.
  2. `'—'` è usato come **placeholder funzionale di cella vuota** nelle tabelle (per esempio
     `{{ row.phone ?? '—' }}` in `CustomersView.vue`): non è punteggiatura, è un segnaposto. Va scelto
     con cosa sostituirlo (trattino semplice, «n/d», stringa vuota) perché cambia la resa dei dati.
  3. Diversi **spec asseriscono copy che contiene em dash**: vanno aggiornati nello stesso task,
     altrimenti la suite diventa rossa (e aggiornarli «per far passare i test» senza accorgersene è il
     modo tipico di rompere una copy).
- **Domande**: perimetro (solo testo mostrato all'utente? anche commenti? anche docs, dove sono 5777
  righe?) e politica di sostituzione per ciascuno dei tre casi sopra.

### 5.6 Privacy, policy GDPR e sicurezza dei dati

- **Cosa esiste**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)
  (erasure e retention del Cliente, con un disclaimer esplicito: non è consulenza legale, va validata da
  un DPO), la minimizzazione dei contatti
  ([ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md)), e il diritto
  all'oblio **implementato**: `DELETE /api/customers/:id` admin-only, con delete reale a zero
  prenotazioni, anonimizzazione in place con storico, e 409 se esiste una prenotazione confermata futura.
- **Cosa manca, verificato rotta per rotta**: **nessuna pagina legale in nessuna delle tre app**
  (web-staff 17 rotte, web-customer 3, web-platform 4: zero `/privacy`, `/cookie`, `/informativa`,
  `/termini`). Nessun footer in nessuno dei tre shell. Zero occorrenze di «privacy», «informativa»,
  «cookie», «GDPR» nei `.vue`.
- **D-024 è esplicita**: il core dell'erasure è chiuso, resta deferito **solo il consenso e l'informativa
  (Art. 13 GDPR) al momento della raccolta**. Questo lavoro è esattamente quella slice.
- **Punti di raccolta di dati personali oggi privi di informativa**: creazione e modifica cliente
  (`firstName`, `lastName`, `phone`, `email`, e soprattutto `notes`, una textarea libera che è il vettore
  più aperto per PII non prevista), invito utente staff (email), registrazione lido, attivazione cliente
  nella PWA.
- ⚠️ **Questo item non è solo codice.** Il contenuto di un'informativa dipende da fatti che solo l'utente
  conosce: titolare del trattamento e dati societari, eventuale DPO, hosting e sub-responsabili, tempi di
  conservazione, base giuridica per ciascun trattamento, uso di cookie tecnici o analitici. Un agente può
  produrre la struttura, il testo tecnico su misure di sicurezza (RLS multi-tenant, argon2, JWT, token
  opachi del canale cliente, isolamento per tenant) e i punti di raccolta del consenso: **non può
  inventare quei dati né sostituire una validazione legale**. Il primo passo è chiedere all'utente quei
  fatti e se il testo debba essere sostanziale o un segnaposto strutturato.

### 5.7 UI/UX in generale

Voce volutamente ampia dell'utente. Ancore utili raccolte durante la ricognizione: l'inventario ui-kit è
di 33 componenti esportati da `packages/ui-kit/src/index.ts`, e **mancano** `Calendar`/`DatePicker`,
`Dropdown`/`Menu`/`Combobox`, `Tabs`, `Checkbox`/`Radio`/`Switch`, `Footer`. Il tema vive in
`packages/ui-kit/src/styles/theme.css` (Tailwind v4, blocco `@theme`, primitive più token semantici),
importato dalle tre app. La verità corrente del design system è `docs/design/design-system.md`
(§3 token, §10 componenti, §13 Mappa/Tessera, §14 editor Cantiere) più ADR-0052 e ADR-0053.
**Conviene trasformare questa voce in una lista di difetti concreti insieme all'utente** invece di
trattarla come un unico task: i primi candidati emersi da soli sono la chevron decorativa della sidebar
(§5.1), la resa disomogenea degli input data (§5.3) e la divergenza di larghezza tra le viste (§5.4).

---

## 6. Lavoro aperto residuo (nessuno bloccante)

1. **[D-060](../architecture/deferred.md)**: `useEntityLabels().umbrellaLabel` costruisce la mappa
   id-label dalla day-map **viva**, quindi in `BookingsView` e `RenewalsView` un ombrellone ritirato perde
   la **label intera** e mostra «—». Nello stesso file il problema è **già risolto per i pacchetti
   archiviati**: la regola non era mai stata estesa. Piccolo e ad alto valore.
2. **[D-059](../architecture/deferred.md)**: relation opzionali residue (`Umbrella.umbrellaTypeId`,
   `Booking.packageId`) e la decisione esplicita su erasure GDPR e noleggi (`Rental.customerId`, oggi un
   comportamento emergente e non una decisione). Si lega naturalmente a §5.6.
3. **Backlog D-055**: reason dedicata `UMBRELLA_RETIRED` nel quote (⚠️ se viene aggiunta, va riflessa in
   `computeSetupStatus`, vedi §1), guardia su `update`/`remove` dei ritirati, canary sull'indice unico
   parziale di `Umbrella` (modello da copiare: `apps/api/test/rate-fk-restrict.e2e-spec.ts`).
4. **Rifiniture dell'onboarding** emerse dalle review e triagiate come non bloccanti: test dello switch
   stagione a runtime in `StepRates`; test del re-select della fila in `StepStructure` (da scrivere
   insieme alla decisione se il default debba seguire l'ultima fila creata); test delle guardie
   campi-vuoti dei form; assert sul `tx` passato a `computeForTx` nello unit della Platform Console;
   `makeEstablishment` duplicato in `EstablishmentsListView.spec.ts` che potrebbe riusare `baseDto`;
   `sectorKind` non resettato dopo la creazione di un settore, mentre gli altri passi resettano tutto.

## 7. Ancore

- Feature di oggi: [ADR-0054](../architecture/decisions/0054-onboarding-incrementale-setup-status.md) ·
  [spec](../superpowers/specs/2026-07-23-onboarding-prima-configurazione-design.md) ·
  [piano](../superpowers/plans/2026-07-23-onboarding-prima-configurazione.md) ·
  [flows.md §10](../design/flows.md) · [mockup](../design/mockups/onboarding-wizard.html).
- Handoff precedente (storia e dettaglio delle feature del 22-23 luglio):
  [chiusura sessione e onboarding](2026-07-23-chiusura-sessione-e-onboarding.md) ·
  [calendario congelato](2026-07-22-e2e-frozen-calendar.md) (**da leggere prima di scrivere e2e**).
- Registro decisioni rimandate: [deferred.md](../architecture/deferred.md).
- Ledger sessioni subagent-driven: `.superpowers/sdd/progress.md` (append-only, gitignorato).
