# Handoff di chiusura sessione 2026-07-23 (mattina) — superato

> ⚠️ **NON è più il punto d'ingresso.** Il punto d'ingresso corrente è
> [2026-07-23-onboarding-mergiato-e-prossimi-lavori-ui.md](2026-07-23-onboarding-mergiato-e-prossimi-lavori-ui.md),
> che riporta i gotcha in forma cumulativa e aggiornata. Questo documento resta come **storia**: la sua
> §5 descriveva l'onboarding guidato quando non era ancora progettato, ed è stato poi realizzato e
> mergiato ([ADR-0054](../architecture/decisions/0054-onboarding-incrementale-setup-status.md)); la
> baseline della §2 è superata da quella del nuovo handoff.

> Contiene: stato del repo, baseline verde, i gotcha che costano ore,
> il metodo atteso e il **prossimo lavoro** (onboarding guidato di prima configurazione).
> I due handoff di dettaglio delle feature di oggi sono linkati dove servono.

**`origin/main = b19e583`**, working tree pulito, nessun branch di lavoro aperto, tutto pushato.

---

## 1. Cosa è stato fatto in questa sessione (tutto mergiato con ok esplicito)

Tre blocchi, in ordine cronologico. Nessuno ha lasciato debito.

1. **Script `typecheck` per `apps/api`** — `pnpm -r typecheck` ora copre anche l'api, **spec inclusi**:
   né `nest build` (esclude gli spec) né ts-jest intercettavano il drift di tipo nelle fixture, ed è il
   buco che aveva nascosto una fixture rotta nel branch D-056. Chiude il chip `task_8e2c58fd`.
2. **[D-058](../architecture/deferred.md)** — le quattro FK dimensionali di `Rate`
   (`sector`/`row`/`package`/`timeSlot`) portate a **`onDelete: Restrict` esplicito** + migration
   `20260723062405_rate_fk_restrict` + **canary e2e DB-level**. Il default Prisma (`SET NULL`) non
   rompeva la tariffa: la rendeva *più generica* (dimensione azzerata = wildcard sulla firma
   ADR-0032), cioè prezzi cambiati in silenzio. Dettagli: [handoff typecheck+D-058](2026-07-23-typecheck-api-d058.md).
   Come sottoprodotto: **e2e sequenziali per configurazione** (`maxWorkers: 1`), vedi §3.
3. **Wiring di `retiredFrom` nello storico prenotazioni** (backlog D-055) — la Scheda cliente non
   mostra più «— · 12» per un ombrellone ritirato ma la posizione storica «Centro · Fila 1 · 12» con
   badge «Ritirato». Contratto additivo (`umbrellaRetiredAt`/`umbrellaRetiredFrom`), enrichment senza
   query nuove, helper FE condiviso che **riduce** il chip prima triplicato.
   Dettagli: [handoff retiredFrom storico](2026-07-23-retiredfrom-storico.md).

**Coerenza docs↔codice verificata prima della chiusura** (a mano, non presunta): tutte le SHA citate
nei tre handoff di oggi esistono; tutti i link relativi risolvono; ogni claim dei documenti è stato
riscontrato sul codice (script typecheck, `maxWorkers`, le 4 FK a Restrict, migration e canary
presenti, i due campi nel contratto, il gate su `retiredAt` nel service, l'helper `positionLabel`, il
badge nelle tre card, nessun `sectorName ?? ` residuo); `prisma migrate status` **pulito su entrambi**
i DB (`coralyn_dev` e `coralyn_test`, 27 migration).

## 2. Baseline verde (misurata di prima mano sul mergiato, una suite alla volta)

| Suite | Esito | Comando |
|---|---|---|
| api unit | **268/268** (48 suite) | `corepack pnpm -C apps/api test` |
| api e2e | **393/393** (35 suite) | `corepack pnpm -C apps/api test:e2e` |
| web-staff (include ui-kit) | **541/541** (84 file) | `corepack pnpm -C apps/web-staff test` |
| web-customer | **25/25** (5 file) | `corepack pnpm -C apps/web-customer test` |
| web-platform | **17/17** (6 file) | `corepack pnpm -C apps/web-platform test` |
| typecheck (tutti i pacchetti, api compresa) | exit 0 | `corepack pnpm -r typecheck` |

**Due comandi sono cambiati oggi** rispetto agli handoff precedenti: `pnpm -C apps/api typecheck`
adesso esiste (ed è dentro `pnpm -r typecheck`, che quindi è il gate completo); le e2e **non vogliono
più `--runInBand`**.

## 3. Gotcha che costano ore (cumulativi — leggi tutti prima di toccare qualcosa)

**Test e ambiente**
- **Suite di pacchetti diversi SEMPRE una alla volta**, mai in parallelo: su questo host la contesa
  produce falsi rossi massicci (timeout di collection). Se una suite mostra errori di *collection*
  con 0 test rossi, è il flake noto: rilancia.
- Le **e2e api sono sequenziali per config** (`maxWorkers: 1` in `apps/api/test/jest-e2e.json`, con
  la chiave `"//"` che ne porta il motivo). Non rimuoverlo e non «ottimizzarlo»: le e2e condividono
  **un solo** `coralyn_test`, e in parallelo si interferiscono lasciando il DB sporco in modo
  persistente (suite crashate a metà non ripuliscono → `customer-access`/`customer-subscriptions`
  restano rosse per unique `User.email`). Recovery, se capita:
  `DATABASE_URL=…coralyn_test npx prisma migrate reset --force --skip-seed` (il DB e2e è usa-e-getta).
- Se **tutte** le e2e falliscono in connessione a `:5433` → Docker Desktop è giù (container `coralyn-db`).
- Regola cross-file: dopo ogni modifica gira l'**intera** suite del pacchetto toccato, mai il solo spec.
- Warning jest «worker process has failed to exit gracefully»: pre-esistente su questo host, non inseguirlo.

**«Oggi» è congelato in DUE punti, per sempre** (non sono date vecchie da aggiornare — il contratto è
scritto in testa a entrambi i file): `apps/api/test/jest-frozen-calendar.setup.ts` (tutte le e2e api →
**2026-07-15**, finge SOLO `Date`) e il `beforeAll` di
`apps/web-customer/.../AbsenceReleaseModal.spec.ts` (stesso istante). Le date di test sono **letterali**
dentro la stagione seed `[2026-05-01, 2026-09-30]`. La suite unit api NON è congelata.
Il perché sta in [handoff calendario congelato](2026-07-22-e2e-frozen-calendar.md): **senza leggerlo si
scrivono e2e sbagliate**.

**Prisma / DB**
- `prisma migrate dev` applica **solo** a `coralyn_dev`: dopo ogni migration serve `migrate deploy`
  anche su `coralyn_test`, o le e2e falliscono in modo fuorviante.
- Una relation resa **opzionale** fa degradare la FK a `ON DELETE SET NULL` **senza dirtelo**. Dichiara
  sempre `onDelete` esplicito. Costato un Important in review (D-055) e una voce deferred (D-058);
  le residue non decise sono in **D-059**.
- L'**indice unico parziale** su `Umbrella` (label unica tra gli ATTIVI) è invisibile al DSL Prisma: un
  `migrate dev` che tocca `Umbrella` può generarne il DROP. Il commento nello schema è la guardia.
  **Genera sempre le migration con `--create-only` e leggile prima di applicarle.**
- Idem per `Rate_signature_key` (`NULLS NOT DISTINCT`, D-039): non usare `prisma db push`.

**Frontend**
- I pannelli dell'ispettore Cantiere si cablano in **un solo** punto: `InspectorPanels.vue`. I form si
  sincronizzano **per id**, non per identità oggetto (trade-off documentato in `SectorPanel.vue`: non
  «correggerlo»).
- vue-query: `mutate()` perde le callback se il componente si smonta prima della risposta → usa
  `mutateAsync().then()` nei flussi che chiudono il pannello (nei pannelli che restano montati,
  `mutate`+`onSuccess` va bene).
- Esc globale con guardia sui dialog aperti; `enableAutoUnmount(afterEach)` negli spec che montano viste
  con listener su `window`; `:disabled` esterno su `Button` sempre in OR col pending; `ConfirmDialog`
  **solo** per azioni distruttive; niente hex fuori da `theme.css`; **non esiste tema dark**.
- Verifica visiva di web-staff: dev usa il backend reale (no MSW), proxy `/api` → `:3000`, DB `:5433`,
  e c'è un **login gate** → la prova visiva richiede il login dell'utente, l'agente non può fare
  screenshot autenticati da solo.

## 4. Metodo atteso (ha pagato: 11 task complessivi oggi, 0 fix-loop nell'ultima feature, 3 difetti veri presi dai gate)

- Skill: `dev-discipline` + `dev-communication` sempre; `frontend-design` sul FE.
- Lavoro multi-task: **brainstorming → writing-plans → subagent-driven-development**, con reviewer per
  task e **review finale whole-branch su modello top**. Il fix-loop con re-review non si salta.
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.** In questa sessione e nella precedente la
  diagnosi ovvia era sbagliata **tre volte** e un probe minimo l'ha smontata (il rosso «data da
  aggiornare» era un conflitto di modelli temporali; il «flake» delle e2e era il parallelismo).
- Esplora **design/ADR**, non solo il codice, quando la modifica tocca una scelta documentata.
  Verità corrente del design system: `docs/design/design-system.md` §3 (token) + §10 (componenti) +
  §13 (Mappa/Tessera) + §14 (editor Cantiere) + ADR-0052/0053. Modello dati: `docs/design/data-model.md`.
- Riusa i primitivi ui-kit e i token semantici; le decisioni strutturali si **segnalano prima**, non si
  eseguono in autonomia; **nessun merge su main senza ok esplicito dell'utente**.
- Ledger `.superpowers/sdd/progress.md`: si **appende**, non si sovrascrive. I file scratch vanno
  prefissati per sessione (usati finora: `task-N`, `task-ls-N`, `task-sc-N`, `task-sd-N`, `task-se-N`,
  `task-sf-N` → **prossimo libero: `task-sg-N`**).

---

## 5. PROSSIMO LAVORO — Onboarding guidato di prima configurazione

**Richiesta dell'utente (verbatim nella sostanza):** creare *«una sorta di onboarding guidato per un
flusso di creazione e spiegazione completo per una prima configurazione **atomica**, **riavviabile**
quando si vuole, facendo attenzione a tutti gli **edge case** del caso»*.

⚠️ **Questa feature NON è ancora progettata.** Parti da `superpowers:brainstorming` con l'utente: sotto
c'è solo la ricognizione fattuale che ho verificato sul codice, perché il prossimo agente non debba
rifarla — **non è un design**, e le domande aperte in §5.4 sono decisioni dell'utente.

### 5.1 Cosa esiste già (ancore verificate)

- **Non esiste alcun onboarding/wizard**: la ricerca su tutto il repo trova solo `RegisterView.vue` e
  `SetPasswordView.vue`, che riguardano le **credenziali**, non la configurazione del lido.
- Il provisioning del tenant è **fornitore + inviti** ([ADR-0028](../architecture/decisions/0028-provisioning-tenant.md)):
  la Platform Console (`apps/web-platform`) crea Stabilimento + admin e manda l'invito set-password
  ([ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)). La
  **self-registration aperta è rifiutata, non rimandata** (D-002): l'onboarding NON deve diventarla.
- La configurazione oggi si fa a mano, sparsa su rotte separate di `web-staff`: `/establishment`
  (anagrafica, utenti), `/establishment/structure` (**Cantiere**: tipologie, settori, file, ombrelloni;
  [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md), design-system §14),
  `/pricing` (stagioni, fasce, pacchetti/dotazioni, tariffe), `/rentals/catalogo` (noleggio, opzionale).
- Esistono script di bootstrap non-UI: `apps/api/prisma/seed.ts`, `reset-dev.ts`,
  `bootstrap-superuser.ts` (utili come riferimento sull'ordine di creazione, non come implementazione).

### 5.2 La catena di prerequisiti reale (verificata sul codice, non presunta)

Perché una prenotazione vada a buon fine servono, in quest'ordine di dipendenza:

1. **Struttura**: Settore → Fila → almeno un Ombrellone (la Tipologia è opzionale).
   Senza ombrellone valido: `422 «Ombrellone non valido»` (`bookings.service.ts:197`).
2. **Fascia oraria** (`TimeSlot`): almeno una.
3. **Stagione** che contiene la data: `422 «Nessuna stagione attiva per questa data»` (`:199`).
   Il `Pricing` è 1:1 automatico con la Stagione e non è mai esposto.
4. **Tariffa** applicabile: `422 «Nessuna tariffa applicabile: configurare il listino»` (`:204`), e per
   gli abbonamenti `422 «Nessuna tariffa Abbonamento configurata per questa stagione»` (`:203`).
   Le reason del quote sono `NO_SEASON`, `NO_RATE`, `UMBRELLA_NOT_FOUND`.

Questa catena **è** il contenuto dell'onboarding: è anche la definizione di «configurazione completa»
(= il lido può incassare la prima prenotazione) e quindi il criterio per sapere a che punto è.

### 5.3 Edge case che il dominio impone già (da non riscoprire a mano)

- **Rilancio su un lido già operativo**: la struttura ha guardie 409 (fila/settore/tipologia con
  ombrelloni o tariffe collegate non si eliminano; un ombrellone con storico **non è eliminabile by
  design** — si **ritira**, ADR-0053). Un onboarding «riavviabile» non deve promettere un reset che il
  dominio vieta.
- **Stato parziale**: oggi ogni entità si crea con endpoint separati, quindi un abbandono a metà lascia
  una configurazione parziale **già scritta**. «Riavviabile» significa riconoscere quello stato e
  riprendere, non ricominciare da zero.
- **Label ombrellone**: unica **tra gli attivi** (indice parziale); i ritirati conservano la loro.
- **Multi-tenant**: tutto passa da `forTenant` + RLS; le mutazioni di struttura/catalogo sono
  **admin-only** (`@Roles(Role.Admin)`), lo staff no.
- **Stagioni**: una prenotazione periodica non può superare `season.endDate`; stagioni multiple e
  sovrapposte sono possibili (tie-break documentato).

### 5.4 Domande aperte — da risolvere in brainstorming con l'utente, non da decidere in autonomia

1. **Cosa significa «atomica»?** Oggi la creazione è per-entità su endpoint separati. Un vero
   tutto-o-niente richiede un **endpoint aggregato transazionale** (decisione strutturale: nuovo
   contratto + una tx server-side) oppure si accetta il modello incrementale a step con ripresa. Sono
   due architetture diverse: è **la** domanda da porre per prima.
2. **Dove vive?** Rotta dedicata (es. `/onboarding`) con redirect automatico al primo accesso di un
   admin su un lido non configurato, oppure pannello/checklist dentro `/establishment` che si può
   riaprire quando si vuole?
3. **Cosa vuol dire «riavviabile»?** Rileggere lo stato reale e riprendere dal primo passo mancante
   (nessun dato distrutto), oppure anche poter **rifare** un passo già fatto — e in quel caso con quali
   guardie sui dati già collegati?
4. **Quanto «spiegazione»?** L'utente chiede un flusso «di creazione **e spiegazione** completo»: va
   capito se serve testo didattico per passo (cos'è un settore, cos'è una fascia, perché serve una
   tariffa catch-all) e con che tono/estensione.
5. **Preset/scorciatoie?** Il generatore di ombrelloni esiste già nel Cantiere; ha senso proporre una
   struttura di partenza («N file × M ombrelloni») e un listino minimo precompilato, o si resta guidati
   ma manuali?
6. **Ambito**: solo `web-staff` (l'admin del lido) o anche un segnale nella Platform Console (il
   fornitore vede quali lidi non hanno completato la configurazione)?

### 5.5 Suggerimento di metodo per questa feature

È una feature di dominio non banale che tocca UI, contratti e possibilmente un endpoint nuovo →
`brainstorming` → `writing-plans` → `subagent-driven-development` con reviewer per task e review finale
whole-branch. Attiva anche `anthropic-skills:design-docs` (probabile **ADR**: se nasce un endpoint
aggregato transazionale o una macchina a stati dell'onboarding, è una decisione architetturale da
registrare) e `frontend-design` per il flusso UI. Il gate visivo finale richiede il login dell'utente (§3).

---

## 6. Lavoro aperto residuo (nessuno bloccante)

1. **[D-060](../architecture/deferred.md)** — `useEntityLabels().umbrellaLabel` costruisce la mappa
   id→label dalla day-map **viva**: in `BookingsView`/`RenewalsView` un ombrellone ritirato perde la
   **label intera** («—»), sintomo peggiore di quello risolto oggi nella Scheda cliente. Nello stesso
   file il problema è **già risolto per i pacchetti archiviati** (`useAllPackages`): la regola non era
   mai stata estesa. Piccolo e ad alto valore.
2. **Backlog D-055**: reason dedicata `UMBRELLA_RETIRED` nel quote · guardia su `update`/`remove` dei
   ritirati · **canary sull'indice unico parziale di `Umbrella`** (modello pronto da copiare:
   `apps/api/test/rate-fk-restrict.e2e-spec.ts`, stessa forma) · passaggio a11y sui `Select` di
   `BeachPanel` senza label.
3. **[D-059](../architecture/deferred.md)** — relation opzionali residue (`Umbrella.umbrellaTypeId`,
   `Booking.packageId`) e la decisione esplicita su erasure GDPR ↔ noleggi (`Rental.customerId`).

## 7. Ancore

- Handoff di dettaglio di oggi: [typecheck+D-058](2026-07-23-typecheck-api-d058.md) ·
  [retiredFrom storico](2026-07-23-retiredfrom-storico.md) · feature precedente:
  [ritira ombrellone D-055](2026-07-23-ritira-ombrellone.md) · **calendario congelato**:
  [e2e frozen calendar](2026-07-22-e2e-frozen-calendar.md).
- Registro decisioni rimandate: [`deferred.md`](../architecture/deferred.md). ADR chiave per il dominio
  toccato di recente: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) (Cantiere),
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) (ritiro),
  [ADR-0028](../architecture/decisions/0028-provisioning-tenant.md) (provisioning),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (pricing).
- Ledger sessioni subagent-driven: `.superpowers/sdd/progress.md` (append-only).
