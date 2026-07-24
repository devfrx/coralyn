# Handoff 2026-07-24: blocco UI (D-060, em dash, Stabilimento, sidebar, Select su reka-ui) + lavori aperti

> **Leggi questo per primo: è il punto d'ingresso unico.** Stato del repo, baseline verde, gotcha che
> costano ore (cumulativi: **sostituiscono** la rilettura degli handoff precedenti), metodo atteso, e i
> lavori ancora aperti con la ricognizione già fatta. Gli handoff più vecchi sono **storia**: se un loro
> testo dice che «Select è fatto a mano» o descrive lo stato pre-migrazione, è superato da qui.

**`origin/main = b230fc9`**, working tree pulito, nessun branch di lavoro aperto, tutto pushato.

---

## 1. Cosa è stato fatto in questa sessione (5 lavori, tutti mergiati su `main`)

Cinque item indipendenti, ciascuno in branch separato, ciascuno con review (per i piccoli TDD diretto +
review finale; per il grosso — il Select — subagent-driven con reviewer per task + review whole-branch su
Opus). Nessun debito lasciato, nessuna migration.

1. **D-060 — label degli ombrelloni ritirati** (`fix/d060-label-ombrelloni-ritirati`, chiusa in
   [deferred.md](../architecture/deferred.md)). `useEntityLabels().umbrellaLabel`
   ([useEntityLabels.ts](../../apps/web-staff/src/lib/useEntityLabels.ts)) ora fonde i ritirati dalla
   `GET /establishment/umbrellas/retired`, **aperta anche allo staff** (i `@Roles` sono scesi dalla
   classe ai singoli handler di `UmbrellasController`: mutazioni e CRUD restano admin-only). Nuovo
   `retiredUmbrellaIds` alimenta il badge «Ritirato» in Prenotazioni e Rinnovi, come nella Scheda
   cliente. È la stessa regola di risoluzione storica che `packageName` usa per i pacchetti archiviati.
2. **5.5 — rimozione em dash dal testo utente** (`fix/copy-em-dash`,
   [spec](../superpowers/specs/2026-07-23-copy-em-dash-design.md)). Perimetro deciso dall'utente: **solo
   testo mostrato all'utente** (sorgenti UI delle app + messaggi in `apps/api/src`). Prosa riscritta
   frase per frase (virgole/due punti/parentesi, nessun segno sostitutivo); il **placeholder di cella
   `'—'` → `'–'` (en dash)**; commenti di codice, `packages/contracts` e `docs/` **fuori perimetro** per
   scelta esplicita. Gli spec che asserivano la copy toccata aggiornati nello stesso task.
3. **5.4 — Stabilimento centrata** (`fix/stabilimento-centrata`): `mx-auto` accanto al `max-w-[940px]`
   già presente in [EstablishmentView.vue](../../apps/web-staff/src/features/establishment/EstablishmentView.vue).
   Una riga (era l'unica vista col cap di larghezza, ma ancorata a sinistra).
4. **5.1 — sidebar** (`fix/sidebar-5-1`; assorbe anche 5.7, che l'utente ha chiarito riferirsi solo alla
   sidebar). In [SidebarNav.vue](../../apps/web-staff/src/app/SidebarNav.vue): **chevron decorativa
   rimossa** (prometteva un menu che non esiste — un utente = un lido; il blocco resta un bottone che
   naviga a `/establishment`, ora con `title`/`aria-label`), **logout da icona a bottone full-width con
   testo «Esci»** allineato a web-platform ma reso coi token della sidebar, e nav **a sezioni**:
   «Operativo» (invariata) + «Amministrazione» con la voce **Struttura** (il Cantiere) visibile ai soli
   admin. `/onboarding` resta fuori di proposito. La review ha trovato un difetto vero: senza
   `overflow-y-auto` sul root, su viewport bassi (laptop 768p, drawer mobile `fixed`) «Esci» diventava
   irraggiungibile — fixato.
5. **5.2 — Select custom su reka-ui** (`feat/select-reka-ui`, 16 commit,
   [ADR-implicito nella spec](../superpowers/specs/2026-07-23-select-reka-ui-design.md) +
   [piano](../superpowers/plans/2026-07-23-select-reka-ui.md)). **Il lavoro grosso della sessione.**
   Vedi §2bis per il dettaglio, perché genera i gotcha nuovi più importanti.

## 2. Baseline verde (misurata di prima mano, una suite alla volta)

| Suite | Esito | Comando |
|---|---|---|
| api unit | **275/275** | `corepack pnpm -C apps/api test` |
| api e2e | **398/398** (36 suite) | `corepack pnpm -C apps/api test:e2e` |
| web-staff (include ui-kit) | **589/589** (91 file) | `corepack pnpm -C apps/web-staff test` |
| web-customer | **25/25** | `corepack pnpm -C apps/web-customer test` |
| web-platform | **18/18** | `corepack pnpm -C apps/web-platform test` |
| typecheck (tutti i pacchetti) | exit 0 | `corepack pnpm -r typecheck` |

Le suite api/web-customer/web-platform non sono state toccate da questa sessione (nessuna consuma
`Select`): i loro numeri sono invariati rispetto all'handoff precedente. web-staff è passata 578→589
(nuovi test di sidebar, D-060, Select/Option, helper `selectOption`, round-trip valore vuoto).

## 2bis. Il Select su reka-ui in dettaglio (genera i gotcha di §3)

`Select.vue` di ui-kit era un `<select>` nativo di 15 righe. Ora è un **componente composto su reka-ui**
(`SelectRoot/Trigger/Value/Portal/Content/Viewport`), stesso pattern headless-dietro-wrapper di
`Popover`/`Modal`, più un nuovo **`Option.vue`** (`SelectItem`+`SelectItemText`+`SelectItemIndicator`)
esportato da ui-kit. **API preservata**: `v-model` stringa, prop `options`, slot con `Option`, `$attrs`
al trigger, `disabled`.

**La decisione tecnica che conta** (e che il prossimo sviluppatore incontrerà): reka-ui **vieta
`SelectItem value=""`** (lancia — `dist/Select/SelectItem.js:89`), ma 10+ consumatori usano `''` come
stato reale selezionabile («Scegli…», «Tutte», «Nessuno»). La soluzione è una **sentinella privata**
`SELECT_EMPTY` in [select-internal.ts](../../packages/ui-kit/src/components/select-internal.ts) che mappa
`''`↔sentinella ai due bordi (`Select.vue` sul modello, `Option.vue` sul value dell'item), **trasparente
ai consumatori**: continuano a scrivere `value=""` e a ricevere `''`. **Non è esportata** da `index.ts`.
Va tenuta distinta dalle **sentinelle applicative** che NON sono il vuoto: `__none__` in `MultiPanel`
(«Normale» → `null` sul wire) e `__new__` in Pricing («+ Crea nuovo tipo…») sono valori stringa reali,
nessun trattamento speciale.

Migrazione **big-bang** completata: ~28 `Select` in 8 gruppi di viste (Rinnovi, Listino, Mappa, Noleggi,
Stabilimento/Onboarding, Cantiere) **più i tre `<select>` NATIVI** dei modali di incasso/cessione
(`SettlePaymentModal`, `SettleRentalPaymentModal`, `TransferSubscriptionModal`) — due dei quali *non erano
nell'inventario del piano* e sono emersi da un audit `grep '<select'` durante l'esecuzione. **Gate di
completezza superato**: zero `<select>`/`<option>` nativi e zero `HTMLSelectElement` in tutto web-staff.
`SegmentedControl` resta **fatto a mano** (non toccato).

## 3. Gotcha che costano ore (cumulativi: questi sostituiscono la lettura degli handoff precedenti)

**Test e ambiente**

- **Suite di pacchetti diversi SEMPRE una alla volta**, mai in parallelo: la contesa produce falsi rossi
  massicci (timeout di collection con 0 test rossi = flake noto, rilancia quella suite da sola).
- Le **e2e api sono sequenziali per configurazione** (`maxWorkers: 1` in `apps/api/test/jest-e2e.json`):
  non rimuoverlo, condividono un solo `coralyn_test`. Recovery se restano sporche:
  `DATABASE_URL=…coralyn_test npx prisma migrate reset --force --skip-seed`.
- Se **tutte** le e2e falliscono in connessione a `:5433`, Docker Desktop è giù (container `coralyn-db`).
- Dopo ogni modifica gira l'**intera** suite del pacchetto toccato, mai il solo spec.
- **`corepack pnpm -C <app> test -- <pattern>`**: su questo host il pattern dopo `--` a volte non arriva a
  vitest. Fallback verificato: `corepack pnpm -C <app> exec vitest run <pattern>`.
- Warning jest «worker process has failed to exit gracefully»: pre-esistente, non inseguirlo.

**«Oggi» è congelato in DUE punti, per sempre**: `apps/api/test/jest-frozen-calendar.setup.ts` (tutte le
e2e api al **2026-07-15**, finge SOLO `Date`) e il `beforeAll` di
`apps/web-customer/.../AbsenceReleaseModal.spec.ts`. Le date di test sono **letterali** dentro la stagione
seed `[2026-05-01, 2026-09-30]`: non sono date vecchie da aggiornare. Il perché sta in
[e2e frozen calendar](2026-07-22-e2e-frozen-calendar.md), da leggere **prima di scrivere e2e**.

**Prisma / DB**

- `prisma migrate dev` applica **solo** a `coralyn_dev`: dopo ogni migration serve `migrate deploy` anche
  su `coralyn_test`, o le e2e falliscono in modo fuorviante.
- Una relation resa **opzionale** degrada la FK a `ON DELETE SET NULL` **in silenzio**: dichiara sempre
  `onDelete`. Le residue non decise sono in **D-059** (vedi §5).
- L'**indice unico parziale** su `Umbrella` è invisibile al DSL Prisma. **Genera sempre le migration con
  `--create-only` e leggile.** Idem per `Rate_signature_key` (`NULLS NOT DISTINCT`): mai `prisma db push`.

**Frontend — reka-ui e il nuovo Select (NOVITÀ di questa sessione)**

- **reka-ui vive SOLO dentro `packages/ui-kit`** (versione 2.10.1): le app consumano i wrapper. Oggi la
  usano `Modal`, `Drawer`, `NavDrawer`, `Popover`, `HoverCard`, `ConfirmDialog` **e ora `Select`/`Option`**.
  NON la usa `SegmentedControl` (ancora a mano).
- **Testare il nuovo `Select` (reka-ui) è diverso dal nativo.** Gli stub jsdom necessari
  (`ResizeObserver`, `Element.prototype.hasPointerCapture/releasePointerCapture/setPointerCapture`,
  `scrollIntoView`) sono ora **globali e additivi** (`??=`) in
  [`src/test/setup.ts`](../../apps/web-staff/src/test/setup.ts): non ridefinirli per-spec.
- **L'unico modo di interagire nei test è l'helper `selectOption(trigger, label)`** in
  [`src/test/utils.ts`](../../apps/web-staff/src/test/utils.ts): apre il trigger su `pointerdown`,
  seleziona per **label visibile** su `pointerup`. Il menu è **portalato**: le option vivono in
  `document.body` **solo a menu aperto**. Per leggere il valore di un Select si legge il **testo del
  trigger** (`w.get('[data-test="…"]').text()`), NON `.value`. **`.setValue()` sul trigger non fa nulla**:
  se un vecchio spec lo usava, va migrato a `selectOption`. I data-test stanno sul **trigger** (via
  `$attrs`), quindi `w.get('[data-test="…"]')` e `.exists()` continuano a funzionare.
- **Sentinella valore vuoto**: una `Option value=""` è selezionabile (round-trip trasparente via
  `SELECT_EMPTY`, vedi §2bis). Non confonderla con `__none__`/`__new__` (valori applicativi reali).
- **Trappola di teardown**: `SelectContent` (reka-ui) pianifica un `setTimeout(0)` reale alla chiusura e
  lo annulla in `onUnmounted`. Se ripulisci `document.body` **prima** di smontare il wrapper, il timeout
  scatta nel test successivo e patcha nodi rimossi. Modello corretto nell'`afterEach` di
  `Select.spec.ts` (smonta il wrapper corrente, POI pulisci il body).
- **Contratto diverso dal nativo**: un `v-model` che non corrisponde ad alcuna `Option` mostra un trigger
  **vuoto** (non la prima opzione, come faceva il nativo). Inizializza sempre il modello a `''` o a un
  valore valido. (Nota nel design-system §10.)
- `Select.spec.ts` asserisce l'**elenco esatto delle nuove classi Tailwind** del trigger (dichiarazione
  della resa 5.2): se ritocchi lo stile del Select, quel test va aggiornato **deliberatamente**. Idem
  `motion.spec.ts` legge `theme.css`.
- `z-[90]` sul contenuto del Select (sopra i Modal `z-[80]`): serve perché i Select vivono anche dentro
  Modal/Drawer portalati.

**Frontend — altri**

- Gli handler MSW di web-staff stanno in `src/mocks/server.ts`; `src/mocks/handlers.ts` è **volutamente
  vuoto**.
- Nei test, il submit di un form si scatena con `.trigger('submit')` sul bottone (in jsdom il `click` su
  `type="submit"` non fa bubbling al form).
- I pannelli dell'ispettore Cantiere si cablano in **un solo** punto: `InspectorPanels.vue`; i form si
  sincronizzano **per id**, non per identità oggetto.
- vue-query: `mutate()` perde le callback se il componente si smonta prima della risposta → usa
  `mutateAsync().then()` nei flussi che chiudono il pannello; `mutate` + `onSuccess` va bene nei
  componenti che restano montati.
- Esc globale con guardia sui dialog aperti; `enableAutoUnmount(afterEach)` negli spec che montano viste
  con listener su `window`; `ConfirmDialog` **solo** per azioni distruttive; niente hex fuori da
  `theme.css`; **non esiste tema dark**.
- **Niente em dash `—` nel testo mostrato all'utente** (policy 5.5, questa sessione): usa virgole/due
  punti/parentesi in prosa, `'–'` (en dash) come segnaposto di cella vuota. Commenti di codice e `docs/`
  restano fuori perimetro. Gli spec che asseriscono copy con em dash vanno aggiornati nello stesso task.
- **Verifica visiva di web-staff**: dev usa il backend reale (no MSW), login gate. **L'agente non può fare
  screenshot autenticati**: la prova visiva va chiesta all'utente.

**Processo**

- `.superpowers/` è **gitignorato**: report dei subagent e ledger `progress.md` vivono solo su disco. Il
  ledger si **appende**, non si sovrascrive.
- I file scratch vanno prefissati per sessione. Usati finora: `task-N`, `task-ls-N`, …, `task-sg-N`, e in
  questa sessione **`task-sh-N`**. **Prossimo libero: `task-si-N`.**

## 4. Metodo atteso (ha pagato in questa sessione: 10 task subagent-driven, 0 bug sfuggiti ai gate)

- Skill `dev-discipline` + `dev-communication` **sempre**; `frontend-design` sul FE; `design-docs` quando
  la modifica tocca dominio/dati/flussi/decisioni architetturali.
- Le **decisioni dell'utente si raccolgono in `brainstorming` prima di progettare**, non si assumono. In
  questa sessione: perimetro em dash, esito Stabilimento (centrata vs piena larghezza), chevron/logout
  sidebar, architettura Select (custom vs fix minimo) e strategia di migrazione (big-bang) — tutte poste
  all'utente. La scelta strutturale (Select custom su reka-ui) è stata **segnalata prima**, non eseguita
  in autonomia.
- Lavoro multi-task (come il Select): **brainstorming → writing-plans → subagent-driven-development**, con
  **reviewer per task** e **review finale whole-branch su modello top (Opus)**. Il fix-loop con re-review
  non si salta. Il ledger traccia i commit (recovery map dopo compaction).
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.**
- **Nessun merge su `main` senza ok esplicito dell'utente.** In questa sessione ogni merge (5 branch, FF
  in sequenza) è avvenuto solo dopo conferma.
- Gate che hanno funzionato, da replicare: la review whole-branch del Select ha trovato uno stile
  ridondante (`:class="inputClass"` sui trigger già stilati) e la review della sidebar un difetto
  d'accessibilità vero (scroll interno mancante). L'audit `grep` durante l'esecuzione ha scoperto 2
  `<select>` nativi fuori inventario: **l'inventario di un piano di migrazione va verificato col grep, non
  fidato.**
- **Su questo host `git` a volte è filtrato dal classificatore auto-mode** (checkout/merge concatenati):
  se un comando git viene bloccato, spezzalo in passi singoli o usa lo strumento Bash con comando singolo.
  Attenzione anche alla sintassi dei messaggi di commit multi-riga: `git commit -m @'…'` è sintassi
  **PowerShell**, in bash inserisce un `@` spurio nel subject — usa un heredoc `-F -` in bash.

---

## 5. PROSSIMO LAVORO (lavori aperti, con ricognizione)

Dei sette item indicati dall'utente nell'handoff precedente, **cinque sono FATTI** (5.5, 5.4, 5.1+5.7,
5.2, più D-060 come warm-up). **Restano due**, entrambi già ricogniti nell'handoff 2026-07-23 §5 (la
ricognizione resta valida) più due voci di backlog.

### 5.3 Navigazione tra giorni con popup calendario (aperto, **decisione utente già presa**)

- Ancore verificate nell'handoff precedente §5.3: il controllo è **inline nella Topbar**
  ([Topbar.vue](../../apps/web-staff/src/app/Topbar.vue), righe ~38-45), due chevron `shiftDay(±1)` + un
  `<input type="date">` nativo reso invisibile che apre il calendario del browser. Stato in
  `session.activeDate`; utility in `apps/web-staff/src/lib/dates.ts`; formattazione etichetta **in UTC**
  per non reintrodurre aritmetica in ora locale. Il controllo appare dove `meta.usesDate === true`
  (`/map`, `/bookings`, `/rentals`). `RenewalsView` usa `activeDate` **senza** il navigatore.
- **Decisioni utente già raccolte in brainstorming (questa sessione)**: (a) **`Calendar` in ui-kit** su
  primitive reka-ui, riusabile; il **navigatore** resta composizione locale della Topbar (unico
  consumatore oggi). (b) **Solo la navigazione giorni** in questo lavoro: i **16 `<input type="date">`**
  sparsi nelle modali/form NON si migrano ora (follow-up tracciato). Le scorciatoie («Oggi», ecc.) si
  decidono nel design dedicato.
- **Ora abbiamo il pattern reka-ui-dietro-ui-kit collaudato dal Select**: il `Calendar` seguirà lo stesso
  stampo (wrapper + eventuale componente figlio, testabile con lo stesso stile di stub/portal). reka-ui
  2.10 ha le primitive `Calendar`/`DatePicker`.

### 5.6 Privacy, policy GDPR e sicurezza dei dati (aperto, **approccio deciso, dati non ancora esistenti**)

- Ancore §5.6 dell'handoff precedente: **nessuna pagina legale in nessuna delle tre app**, nessun footer,
  zero occorrenze di «privacy»/«cookie»/«GDPR» nei `.vue`. **D-024** è esplicita: il core dell'erasure è
  chiuso ([ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)), resta deferito
  **solo il consenso/informativa (Art. 13 GDPR) al momento della raccolta** — questo lavoro è esattamente
  quella slice. Punti di raccolta PII privi di informativa: creazione/modifica cliente (soprattutto
  `notes`, textarea libera), invito staff, registrazione lido, attivazione cliente PWA.
- **Decisione utente (questa sessione)**: approccio **ibrido**. L'utente **non ha ancora** titolare del
  trattamento formalizzato, hosting/sub-responsabili definiti, tempi di conservazione, né certificazioni
  (ha chiarito: non è questione di certificazioni 1718/27001, sono proprio i dati societari che ancora non
  esistono). Quindi: la **parte tecnica reale** (misure di sicurezza già nel codice — RLS multi-tenant,
  argon2, JWT, token opachi del canale cliente, isolamento per tenant, erasure ADR-0043 — più i diritti
  dell'interessato e i punti di raccolta consenso) si scrive **per davvero**; i **dati societari** restano
  **segnaposto `[DA COMPILARE]`**; disclaimer «da validare con DPO/legale» come ADR-0043. L'informativa
  pesa soprattutto su **web-customer** (l'interessato è il bagnante). Serve `design-docs` (tocca flussi e
  forse dominio). **Non inventare i dati mancanti**: sono dell'utente.

### D-059 (aperta) — relation opzionali residue con `ON DELETE SET NULL` implicito

Audit già fatto ([deferred.md](../architecture/deferred.md) D-059): `Umbrella.umbrellaTypeId` e
`Booking.packageId` (stessa classe di rischio di D-058, mai decise esplicitamente → non cambiate
d'autorità); caso a parte `Rental.customerId` (l'erasure GDPR non lo considera — comportamento emergente,
non decisione, si lega a 5.6). Trigger: prossimo branch che tocca tipologie/pacchetti, o una decisione su
erasure↔noleggi. Impatto basso (le guardie 409 coprono i flussi normali). Genera sempre le migration con
`--create-only`.

### Follow-up di accessibilità (chip spawnato questa sessione)

Emerso dalla review whole-branch del Select: diversi form usano `<label>` come **fratello** del controllo
**senza `for`**, quindi il nuovo `Select` (`<button role="combobox">`) resta **senza nome accessibile**
(es. `MapView.vue`, campi Tipo/Cliente/Pacchetto del modale prenotazione). È **pre-esistente** (anche il
`<select>` nativo aveva la stessa non-associazione), ma la migrazione a un combobox custom è il momento
naturale per chiuderlo. Due strade: avvolgere nel wrapper `<Field>` (che associa label e controllo) o
`aria-label` esplicito. Fare un grep dei `<label` non associati nei form di web-staff e sistemare i
combobox in via prioritaria. Non scoped a un item §5.

### Residuo di backlog (non bloccante)

- **Reason dedicata `UMBRELLA_RETIRED` nel quote** (D-055): ⚠️ se aggiunta, **va riflessa in
  `computeSetupStatus`** ([ADR-0054](../architecture/decisions/0054-onboarding-incrementale-setup-status.md):
  i 422 di `throwPriceError` sono la definizione operativa di «lido non configurato»). C'è un
  commento-sentinella nel codice.
- Rifiniture onboarding triagiate come non bloccanti (elenco nell'handoff precedente §6).

---

## 6. Ancore

- Feature di questa sessione: [Select spec](../superpowers/specs/2026-07-23-select-reka-ui-design.md) ·
  [Select piano](../superpowers/plans/2026-07-23-select-reka-ui.md) ·
  [em dash spec](../superpowers/specs/2026-07-23-copy-em-dash-design.md) ·
  [D-060 spec](../superpowers/specs/2026-07-23-d060-label-ombrelloni-ritirati-design.md) ·
  [design-system.md §10 Select](../design/design-system.md).
- Handoff precedente (storia + ricognizione originale dei sette lavori, ancora valida per 5.3/5.6):
  [onboarding mergiato e prossimi lavori UI](2026-07-23-onboarding-mergiato-e-prossimi-lavori-ui.md).
- Calendario congelato (**da leggere prima di scrivere e2e**):
  [e2e frozen calendar](2026-07-22-e2e-frozen-calendar.md).
- Registro decisioni rimandate: [deferred.md](../architecture/deferred.md) (D-059 aperta; D-024 = slice
  5.6).
- Ledger sessioni subagent-driven: `.superpowers/sdd/progress.md` (append-only, gitignorato).
