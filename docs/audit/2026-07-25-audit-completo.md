# Audit Coralyn — 2026-07-25

Commit `62eb63f` (`main` = `origin/main`), working tree pulito.
Perimetro: **tutto il repo**, partizionato in 9 aree × 11 livelli. Modalità: report + fix su conferma.

> ## Stato della remediation
>
> **Fasi A, B e C eseguite, verificate e MERGIATE su `main`** il 2026-07-25 (fast-forward a
> `a996dd6`, spinto su `origin/main`). La CI ha girato per la **prima volta** su quel push:
> [run #1](https://github.com/devfrx/coralyn/actions/runs/30159012576), entrambi i job verdi.
>
> **Fase D eseguita, verificata e MERGIATA su `main`** il 2026-07-25 (fast-forward da `37a585f`).
> Ogni difetto è stato riprodotto con un test rosso PRIMA del fix, e ogni fix è stato provato per
> mutazione.
>
> | Finding | Stato |
> |---|---|
> | **AUD-001** e2e che cancellano il DB dev | ✅ **CORRETTO** — guardia sul nome della risorsa in `jest-setup-env.ts` + `.env.test.example` versionato |
> | **AUD-006** `JWT_SECRET` nelle immagini Docker | ✅ **CHIUSO** — `.dockerignore` è ora allow-list. ⛔ **La richiesta di rotazione era infondata** e l'azione residua **decade**: non esiste alcun VPS (confermato 2026-07-25). Vedi la correzione qui sotto |
> | **AUD-018** nessuna CI / nessuno script `verify` | ✅ **CORRETTO E VERIFICATO** — `pnpm run verify` + `.github/workflows/verify.yml`; `packages/contracts` ha ora `typecheck` (6/7 → 7/7). La CI ha girato per la prima volta il 2026-07-25 su `main`: **entrambi i job verdi**, nessun ritocco necessario |
> | Flake OOM di Jest | ✅ **CORRETTO** — `maxWorkers: '50%'` + `workerIdleMemoryLimit`. Da 49/50 suite a **50/50** |
> | Doppio conteggio ui-kit (P6-014, P7-018, P8-002) | ✅ **CORRETTO** — rimosso l'include da `web-staff/vitest.config.ts` |
> | Lint (P6-015, P7-008) | ✅ **CORRETTO** — 73 errori → **0**; copertura da 494 a **603 file**, inclusi i 109 `.vue` prima invisibili |
> | P6-020 scaffolding morto nelle e2e | ⚠️ **PARZIALE** — variabili rimosse, ma **il test cross-tenant lato operatore che le giustificava non è stato scritto**: resta aperto |
> | **AUD-004** autorizzazione opt-in (9 controller scoperti) | ✅ **CORRETTO** (Fase C) — guard fail-closed + `@RequiresPermission`, [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md). ⚠️ Il **passo intermedio proposto al §4/7 era sbagliato**: vedi sotto |
> | **AUD-002** `trust proxy` mai impostato | ✅ **CORRETTO** (Fase C) — `configureApp` condivisa fra `main.ts` e le e2e + `TRUST_PROXY_HOPS` (2 in produzione) |
> | **AUD-003** login staff esposto senza throttling né anti-enumerazione | ✅ **CORRETTO** (Fase C) — `ThrottlerGuard` method-scoped sulle 3 rotte `@Public` di `AuthController`, hash civetta, `@MaxLength(128)`. D-026 (revoca a sessione in corso) **resta aperta** |
> | **AUD-016/017** configurazione non validata, 11 env non documentate | ✅ **CORRETTO** (Fase C) — `validate` in `common/env.validation.ts`; chiude **P7-011** per costruzione: il compose dev senza `CUSTOMER_APP_URL` ora non parte |
> | **AUD-005** guardia del seed annullata dall'entrypoint | ✅ **CORRETTO** (Fase C) — `prisma/dev-database.ts` su `current_database()`, fallback letterali rimossi, `\|\| echo` tolto dall'entrypoint |
> | **AUD-007** `suspend` crea un range invertito → 500 | ✅ **CORRETTO** (Fase D) — `bookings/coverage.carve.ts`, funzione pura condivisa dai 4 punti di carve + CHECK `coverage_range_valid`. Riprodotto (500) e verificato per mutazione |
> | **AUD-008** `DELETE /seasons/:id` → 500 | ✅ **CORRETTO** (Fase D) — `P2003 → 409` in `mapPrismaKnownError` (backstop di ogni FK futura) + i count mancanti in `SeasonsService.remove` (messaggio che nomina la causa) |
> | **AUD-009** `CustomerAccessCard` congela `bookingId` | ✅ **CORRETTO** (Fase D) — thunk in tutti e 15 i composable di `useCustomers.ts` e nei 12 punti di chiamata. Riprodotto: la POST partiva verso l'abbonamento precedente |
> | **AUD-010** `web-customer` senza logout, 401 terminale che non redirige | ✅ **CORRETTO** (Fase D) — `logout()` revoca lato server, `clearSession()` per la sessione già morta, redirect in `CustomerShell` (rotte `meta.public` escluse) |
> | **AUD-011** due politiche UUID incompatibili | ✅ **CORRETTO** (Fase D) — `@IsUuidShape()` in `common/`, 16 sostituzioni, lint `no-restricted-imports` che vieta `IsUUID`. Trovato in più: `seed-report-demo.ts` puntava a id inesistenti (helper divergente) |
> | **P2-008** contatore PIN non atomico | ✅ **CORRETTO** (Fase D) — `{ increment: 1 }` + lock guardato. Riprodotto: 5 tentativi paralleli consumavano **1** slot |
> | **P2-009** articolo archiviato noleggiabile | ✅ **CORRETTO** (Fase D) — regola unica in `rental.projection.ts` (`RENTABLE_ITEM_WHERE` + `isRentable`) |
> | **P1-004** guardia «cliente anonimizzato» in 1 write-path su 4 | ✅ **CORRETTO** (Fase D) — `customers/active-customer.ts` nei 4 percorsi; `PATCH /customers/:id` su anonimizzato è ora **409** (era PII fuori inventario). La guardia che *esisteva già* (cessione) non aveva test: aggiunto |
> | PII in `GET /establishment/overview` | 🔓 **APERTO** — [D-064](../architecture/deferred.md). L'inversione **non** lo chiude: l'app-shell chiama quell'endpoint a ogni caricamento, quindi separare `team[]` è un cambio di contratto FE/BE |
> | Permessi configurabili dall'admin | 🔓 **PIANIFICATO** — [D-063](../architecture/deferred.md) + [brief di delega](../superpowers/specs/2026-07-25-permessi-configurabili-design.md) |
> | **Tutto il resto** | 🔓 **APERTO** — fasi E → H del §4 |
>
> ### ⛔ Correzione ad AUD-006 / P2-006 — la rotazione del `JWT_SECRET` non serviva
>
> Il finding è accurato sul **meccanismo** — `RUNBOOK.local.md` finiva davvero in ogni immagine API
> — e sbagliato sulla **conseguenza**. Confronto delle impronte SHA-256 (valori mai stampati):
> il `JWT_SECRET` in `RUNBOOK.local.md`, quello in `apps/api/.env` e quello in **`docker-compose.yml`**
> hanno lo stesso hash. È il segnaposto `dev-secret-change-me-at-least-32-characters-long`, che sta
> **in chiaro in un file versionato**, su un repository **pubblico**.
>
> Quindi non c'era alcun segreto da ruotare: era già leggibile da chiunque, con o senza immagini.
> Il fix di Fase A resta giusto per l'altra ragione — una deny-list dimentica **il prossimo** file,
> quello che conterrà un segreto vero.
>
> **Il rischio reale è un altro, e non è un'esposizione ma una precondizione.** ✅ **2026-07-25,
> confermato dall'utente: non esiste alcun VPS.** Non c'è quindi nessuna produzione che possa usare
> quel segnaposto oggi, e l'azione «verificare il `JWT_SECRET` di produzione» **decade**: non era
> verificabile da qui perché non c'era nulla da verificare. Resta come **precondizione al primo
> deploy**, dove è già presidiata: `deploy/README.md:167` prescrive `openssl rand -base64 48` e la
> checklist `:343` richiede che i placeholder siano sostituiti.
>
> Perché la precondizione conta: chi conosce il `JWT_SECRET` non legge i token, **li forgia** — può
> firmarsi `role: superuser` su qualunque `establishmentId`, e il tenant arriva dal token (ADR-0026),
> quindi scavalca anche l'RLS. Sullo stesso piano, e per lo stesso motivo, `docker-compose.yml`
> pubblica anche `DEV_ADMIN_PASSWORD` e `PLATFORM_SUPERUSER_PASSWORD`: dichiarati dev-only, e da
> non riusare mai altrove.
>
> *Metodo*: questo errore è passato perché la conseguenza è stata ereditata dal report invece di
> essere verificata. Bastavano due `sha256`.
>
> ### ⛔ Correzione al §4/7 di questo report
>
> Il passo intermedio «*a costo zero*» — `@Roles(Role.Admin)` di classe sui 9 controller scoperti
> più `overview` — **è sbagliato**, verificato aprendo il frontend. Quei controller servono
> `/pricing`, `/rentals`, `/rentals/catalogo` e `/renewals`, che `SidebarNav.vue` mostra a **ogni**
> ruolo; `overview` è chiamata dall'app-shell a ogni caricamento via `useActiveSeason`. Il passo
> avrebbe rotto quattro sezioni per lo `staff` — **e la suite sarebbe rimasta verde**, perché
> nessuno dei 9 file e2e di quei controller crea un utente `staff`: fanno tutti login come `admin`.
> Anche l'affermazione «la migrazione è verificabile, 40+ file e2e coprono ogni controller» va letta
> così: coprono ogni *controller*, non ogni *ruolo*. Il buco era esattamente sul ruolo colpito.
> Da qui `authorization-staff.e2e-spec.ts`, che quel ruolo lo esercita.
>
> Le sezioni §0 e §2-§3 restano la **misura al momento dell'audit** e non sono state riscritte:
> servono a spiegare *perché* i fix esistono. Lo stato corrente è questo riquadro.

---

## 0. Baseline (misurata, non ereditata)

| Suite | Comando | Esito |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11/11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190/190 |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23/23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 29/29 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 617/617 **(incl. i 190 di ui-kit)** |
| api unit | `pnpm --filter @coralyn/api test` | 283/283 |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 406/406 |
| typecheck | `pnpm -r typecheck` | exit 0 (**6 progetti su 7**) |
| lint | `pnpm lint` | **73 errori** (unico rosso) |

**Totale reale: 1369 test distinti**, non 1559 — `apps/web-staff/vitest.config.ts` include `../../packages/ui-kit/src/**/*.spec.ts`, quindi i 190 di ui-kit girano due volte e la baseline documentata li somma due volte (60 spec web-staff + 36 ui-kit = 96 file, il numero riportato). Verificato.

**Regola di verifica post-fix**: le suite restano a questi numeri, typecheck exit 0, lint non **sale** sopra 73.

---

## 1. Quadro

**145 finding** su 9 partizioni. Copertura dichiarata, nessun campionamento silenzioso:
`apps/api` 157/157 file non-spec · `web-staff` 105/105 · `web-platform` 20/20 · `web-customer` 18/18 · `ui-kit` 43/43 · `legal` 8/8 · tutte le 28 migration · tutti i 45 DTO · tutti i 25 controller · tutti i 294 `.md` (passata meccanica: 2725 link risolti) · tutti i 199 spec (analisi meccanica) · 30 spec letti integralmente.

| Severità | N |
|---|---|
| Critico | 1 |
| Alto | 32 |
| Medio | 71 |
| Basso | 41 |

### Cosa regge — va detto, perché cambia la lettura di tutto il resto

Questo **non** è un repo in cattivo stato. È un repo con presidi progettati bene e **senza automazione che li mantenga**.

- **L'affermazione contrattuale «RLS su 22 tabelle tenant-scoped, 6 fuori» è ACCURATA**, verificata tabella per tabella contro schema e 28 migration. Tutte e 22 hanno `USING` **e** `WITH CHECK`; l'espressione è fail-closed (senza GUC `nullif` dà NULL e non seleziona nulla); i 3 `NO FORCE` temporanei sono richiusi nella stessa migration; il ruolo è `NOSUPERUSER NOBYPASSRLS` in dev **e** prod. È l'affermazione più delicata dei documenti legali e tiene.
- **Zero segreti nella storia git** (1010 commit scansionati per `sk_live`, `AKIA`, `ghp_`, `xox*`, `BEGIN PRIVATE KEY`, JWT).
- **Zero `any`, `@ts-ignore`, `@ts-expect-error`, TODO, FIXME in `apps/api/src`.** Zero cast di comodo fuori dai test.
- **Nessun ciclo** nel grafo dei moduli backend. **Nessuna dipendenza duplicata** (un client HTTP, una libreria di date, un validatore, una libreria grafici). **Nessun range di versione pericoloso**; lockfile committato, `--frozen-lockfile` in tutti i Dockerfile.
- **Zero occorrenze di reka-ui ed echarts fuori da `ui-kit`** — il confine dichiarato regge.
- **Nessuna union di dominio è divergente oggi** (verificate valore per valore). **Zero voci orfane** negli `.env.example`.
- **La parete PII della console piattaforma è intatta**: `PlatformEstablishmentDTO` contiene solo aggregati; le uniche stringhe personali rese sono email di **operatori**, dichiarate nella policy.
- **Igiene di listener e timer completa**, zero leak.
- **Il pezzo più forte della suite**: `booking-overlap-constraint.e2e-spec.ts` testa che un trigger scatti su `UPDATE OF bookingId` **e non scatti** sulle altre colonne, con pin del rilevatore `23P01`.
- **La spec migliore del repo**: `packages/legal/src/legal.spec.ts` usa asserzioni **negative** su frasi vietate, ancorate ad ADR-0055, col commento che spiega quale review trovò la contaminazione.

---

## 2. Le dodici radici

Le 145 constatazioni non sono 145 problemi indipendenti. Si riducono a dodici cause, in ordine di quanto spiegano.

### R-A · Non esiste alcun anello che trasformi una decisione in un vincolo eseguibile
**Identificata indipendentemente da tutte e 9 le partizioni.** Nessuna CI (`.github/` non esiste), nessun hook (`.husky/` assente, `core.hooksPath` non impostato), nessuno script `test`/`typecheck` aggregato alla root. Il repo ha 57 ADR, un registro delle decisioni rimandate, e una rubrica (ADR-0002) che stabilisce «il debito tracciato è ammesso, quello silenzioso no» — **la qualità del pensiero documentale è alta**, manca l'anello che la rende eseguibile.
La sproporzione lo dice meglio di qualsiasi analisi: il repo ratifica per ADR la variante `danger` di un `IconButton` (ADR-0044) e **non ha mai deciso di non avere una CI**.
*Conseguenze misurate*: 73 errori lint dove la doc ne dichiara 15 · 95 link rotti dove ne dichiara 4 · 29 advisory di sicurezza · 11 env non documentate · `packages/contracts` fuori dal typecheck ricorsivo · 109 `.vue` fuori dal linter · `dist` committato contro `.gitignore` · 3 versioni di TypeScript · ui-kit testato due volte.
→ P7-006, P7-002, P7-005, P7-009, P7-012, P7-013, P7-018, P6-007, P6-014, P6-015, P6-020, P5-001, P5-010, P8-004, P8-008, P8-013, P8-014, P8-015

### R-B · La difesa è opt-in: la strada scorretta non costa nulla
`RolesGuard` passa in assenza di metadato → 9 controller di dominio scoperti. `@IsUUID()` resta usabile accanto alla policy `UUID_SHAPE` → 14 campi che rifiutano id che il repo dichiara validi. `@Query('x')` scalare sfugge al `ValidationPipe` → 8 punti non validati, due dei quali danno 500. `ConfigModule` senza `validationSchema` → tre politiche di fallback incoerenti nello stesso servizio. Le e2e possono puntare a qualunque database.
**Evidenza più netta**: dentro `establishment.controller.ts` l'unico endpoint che espone PII (`GET overview`, elenco email di tutti gli operatori) è **l'unico senza `@Roles`**, mentre quello che la deferred descrive come «puro DTO senza PII» è protetto. La copertura non segue il rischio: segue la storia dei commit.
→ P2-004, P1-010, P1-003, P1-005, P7-004, P7-001, P1-008

### R-C · Il presidio strutturale esiste ma è sostituito da una copia applicativa mantenuta a mano
Il progetto ha già stabilito il principio giusto (ADR-0037/0046: controllo applicativo primario, constraint DB come backstop di race) e lo ha applicato brillantemente all'anti-overlap. **Non lo ha esteso.**
Nessun indice unico parziale per «una sola sospensione aperta» → la regola è ricalcolata 7 volte in TypeScript, già con 3 formulazioni diverse. Nessun `varchar(n)` né CHECK su alcuna colonna testuale → `POST` rifiuta un nome vuoto, `PATCH` lo accetta. Nessuna FK su `BookingCoverage.umbrellaId`, che è la **prima chiave di partizionamento dell'unico garante anti-double-booking**. Nessun `CHECK (startDate <= endDate)`. La cascata FK di `Season` è riscritta in TypeScript contro il grafo *com'era*.
→ P2-007, P2-011, P2-005, P1-002, P1-016, P1-001, P1-007

### R-D · L'API del modulo condiviso è troppo stretta: violarla costa meno che estenderla
`lib/useActiveSeason` espone solo `name` → 4 reimplementazioni con 4 semantiche diverse, e il banco noleggi applica le tariffe di una stagione mentre l'editor ne modifica un'altra. `lib/statusMaps` copre solo Booking/Rental → `SlotState` mappato altrove. `lib/queryKeys` espone solo chiavi complete → 4 prefissi scritti a mano. `resolveSeasonWithin` non restituisce il `pricing` → `priceWithin` riscrive la query 40 righe sotto la docstring che la dichiara «single source». `IdentityModule` non esporta `PasswordHasher` → 4 moduli lo ri-provvedono, uno con la giustificazione di un ciclo **inesistente**.
**Il segnale è costante: il difetto si ripete nello stesso punto e per la stessa ragione.** È la radice col miglior rapporto fix/beneficio.
→ P3-R1, P1-006, P1-009, P3-001, P3-008, P3-009, P3-010, P9-R1

### R-E · `ui-kit` fornisce mattoni, non pattern; il conto lo paga chi consuma
ADR-0033 definisce *cosa* può entrare (niente dominio) e *come* deve apparire (fedeltà ai mock), non *cosa è pubblico* né *cosa serve per consumarlo*.
`DataTable` non generico → **83 doppi cast `as unknown as`**, che sono `@ts-ignore` travestiti che nessuna regola intercetta. `Select`/`Field` senza etichettatura → **32 combobox senza nome accessibile** (un `<button role="combobox">` non è etichettabile da un `<label>` che lo avvolge). Nessun `ErrorState` né slot d'errore → 9 viste su 12 non consultano mai `isError`. Nessun contenitore modale-form → 7 scheletri riscritti, 10 input senza anello di fuoco. Barrel che riesporta tutto + side effect non dichiarato → **ECharts (~130 KB gzip) nel bundle di una PWA mobile con 3 viste**.
→ P3-011, P3-003, P3-002, P3-007, P4-008, P4-009, P4-010, P4-012, P4-013, P4-016, P9-007

### R-F · Il clone è il metodo di bootstrap e manca il passo di riconciliazione
`web-platform` clona `web-staff` (05/07), `web-customer` clona `web-platform` (15/07). Il clone è difendibile — ADR-0041 accetta esplicitamente il costo. Manca il momento in cui si decide, voce per voce, cosa della copia è pertinente.
**Il sintomo diagnostico sono i commenti**: `web-platform` spiega il `null`-body citando `/renewal-campaigns`, endpoint che non chiama mai; `web-customer` giustifica `transformAssetUrls` citando un logo che non possiede e spiega la rimozione di un service worker MSW che non ha mai registrato.
→ P4-003, P4-005, P4-011, P4-014, P4-015, P7-011

### R-G · La documentazione cresce per append e asserisce in prosa fatti che dovrebbero stare in un test
`deferred.md` è 73.680 caratteri su 131 righe, con una singola cella di tabella da 6.000 caratteri; viola la regola del proprio preambolo («quando una voce è affrontata si rimuove da qui») con ≥7 voci chiuse ancora in tabella e D-051 duplicata.
**Il testo iniziale falso sopravvive SOTTO le correzioni invece di essere sostituito da esse.** È il vettore diretto del finding di compliance più grave: D-061 continua ad affermare che il token in `localStorage` è «l'unica memorizzazione» — falso su due fronti (due token, più la Cache Storage di Workbox su tutte e tre le app) — e la conclusione «niente banner» poggia su quella premessa.
Specularmente: `docs/legal/privacy-policy-operatori.md` porta un blocco «✅ Verificato sul codice» con **due affermazioni oggi false**, mentre gli stessi fatti **sono** correttamente vincolati da test in `credential-setup.email.spec.ts` e `legal-routes.spec.ts`. La prosa è invecchiata **a un giorno** dalla stesura, sulla superficie dove costa di più.
→ P8-001..P8-017, P4-006, P1-017, P2-012, P2-010

### R-H · Il perimetro di rete è cambiato e nessuna difesa che ci si appoggiava è stata rivalutata
Tre deroghe (D-026/027/029) accettate con la motivazione esplicita «il login staff **non è esposto pubblicamente**»; la slice deploy di due giorni dopo lo ha messo su Internet con TLS. Nella stessa slice il throttler del canale cliente ha perso ogni granularità perché è comparso un reverse proxy e `trust proxy` non è stato impostato.
**Il repo non ha un momento in cui si chiede quali assunzioni un cambio di topologia invalidi.** La precondizione di una deroga vive nella prosa della colonna «Perché rimandata», non in un campo verificabile.
→ P2-001, P2-002, P2-003

### R-I · Il fixture non contiene lo stato che il titolo del test promette di verificare
Pattern singolo più costoso della suite. `credential-setup.service.spec.ts` dice «invalida i precedenti» con `tokens = []`. `positionLabel.spec.ts` dice «ignora sectorName» passando `sectorName: undefined`. `EstablishmentsListView.spec.ts` dice «passa a Sospeso» su un seed che contiene già un lido sospeso — e il primo test dello stesso file asserisce la stessa stringa **senza compiere alcuna azione**.
Corollario: **i fake modellano la firma, non il contratto.** `forTenant: (_t, cb) => cb(tx)` butta via l'unico argomento che porta la garanzia di isolamento; `hasher.verify` cablato su `true` rende irraggiungibile metà di `login`.
*Regola di review derivata*: se il titolo contiene «invece di», «ignora», «invalida», «non», «passa a», il fixture deve contenere l'alternativa scartata.
→ P6-001, P6-002, P6-003, P6-004, P6-005, P6-008, P6-011, P6-012, P6-013, P6-016, P6-019

### R-J · Un solo livello di test regge le aree più critiche, ed è quello lento
RLS, difesa cross-canale, theft-detection, `outstanding`, tutta l'orchestrazione booking: coperte **solo** da e2e. Le e2e non sono scritte male — al contrario. Sono il **solo** guardiano, e basta un `.env` disallineato per azzerare la copertura effettiva di metà prodotto.
**Radice sotto la radice**: `bookings.service.ts` è 1024 LOC e non ha unit test perché **non si può scriverli** senza montare mezza applicazione. La correlazione è perfetta — dove la logica è pura (`resolvePayment`, `reconcileCessionPayment`, `resolvePrice`) i test sono forti con casi limite veri; dove è accoppiata non ci sono. **Il finding è sul codice di produzione, non sui test.**
→ P6-006, P6-009, P6-010, P6-017, P6-018

### R-K · Il filtro di dominio vive in JS invece che nel repository
`findMany` largo → `.some()`/`.filter()`/`.reduce()` in JavaScript. **Conseguenza diretta sugli indici**: un `where` che il DB non vede non genera mai la domanda «quale indice lo serve?» — ed è esattamente lì che mancano i 4 indici.
→ P9-001, P9-002, P9-004

### R-L · Il caso peggiore non è definito da nessuna parte
`connection_limit`, `transactionOptions`, timeout SMTP, cap di paginazione: quattro soglie operative delegate ai default impliciti di tre librerie diverse. Ciascuna innocua da sola; insieme fanno sì che il sistema **non abbia un modo di fallire in modo prevedibile**.
→ P9-003, P9-006, P9-010

### R-M · La produzione è stata progettata con cura; lo sviluppo locale è rimasto conoscenza tacita
`docs/deploy/README.md` è una guida eccellente (10 passi, hardening del VPS, backup con test di restore); `docker-compose.prod.yml` è motivato riga per riga e scrive «Nessun `ports:` — il DB non è raggiungibile da Internet». Il ragionamento è stato fatto **e non retro-applicato**: il compose dev espone DB e Mailpit su `0.0.0.0` con credenziali pubblicate nel repo; il `README.md` non contiene una sola riga di setup; `RUNBOOK.local.md` è gitignorato; `docker-compose.override.yml` non ha un `.example`.
**Il pattern è costante: ogni volta che il problema è stato affrontato per la produzione è stato risolto bene; ogni volta che aveva anche una faccia locale, quella faccia è rimasta scoperta.**
→ P7-007, P7-015, P7-003, P7-014, P7-001, P8-012

---

## 3. Critico e Alto — la lista breve

### 🔴 CRITICO

**AUD-001 · Su un clone pulito, la suite e2e cancella il database di SVILUPPO** *(P7-001, verificato personalmente)*
`.env.test` non è versionato → `jest-setup-env.ts:6` è un no-op silenzioso se manca → `ConfigModule.forRoot()` senza `envFilePath` carica `apps/api/.env` dalla cwd → `DATABASE_URL` = `coralyn_dev` → 11 `deleteMany({})` incondizionati negli helper → e l'unica guardia (`reset-dev.core.ts:22`) **accetta esplicitamente `coralyn_dev`**.
Secondo vettore attivo anche col file presente: `jest-setup-env.ts:20` usa `if (!process.env[key])`, quindi una `DATABASE_URL` esportata in shell **scavalca `.env.test`**.
*Radice*: il file che decide contro quale database si distrugge è gitignorato, senza template e senza validazione; la guardia esistente protegge dalla produzione mentre in locale il rischio è il dev.

### 🟠 ALTO — attivi oggi, riproducibili

| ID | Cosa | Dove |
|---|---|---|
| AUD-002 | **`trust proxy` mai impostato** → il rate-limit del canale cliente è un bucket **globale** per tutti i clienti di tutti i lidi. Superate 10 req/min in aggregato, il refresh riceve 429, l'interceptor lo legge come sessione morta e slogga: **il canale cliente si autodistrugge a due cifre di utenti**. Il test esistente non può rilevarlo (in-process, `req.ip` già loopback) | `main.ts:6-11` · P2-001 |
| AUD-003 | **Le 3 deroghe sull'auth staff poggiano su «non esposto pubblicamente»**, premessa che il deploy ha reso falsa: login su Internet senza throttling, con oracolo di enumerazione via timing e senza revoca (8h). Password senza `@MaxLength` → argon2 su input arbitrario | `Caddyfile:19-22` · P2-002 |
| AUD-004 | **9 controller senza `@Roles`**: uno `staff` riscrive il listino, cancella stagioni e tariffe, apre campagne. E `GET /establishment/overview` — **elenco email di tutti gli operatori** — è l'unico dei tre endpoint del suo controller senza guard | P2-004, P1-010 |
| AUD-005 | **La guardia anti-produzione del seed è annullata dall'entrypoint** (`NODE_ENV=development` sovrascritto in `docker-entrypoint.sh:11-16`) + password admin di fallback hardcoded e assente da `.env.prod.example`. Il pattern corretto è 30 righe più in là (`reset-dev.core.ts` guarda `current_database()`) | P2-003 |
| AUD-006 | **`RUNBOOK.local.md` (contiene un `JWT_SECRET`) è in `.gitignore` ma NON in `.dockerignore`**, e il Dockerfile fa `COPY . .` → il segreto è in ogni immagine API costruita. Mai finito in git: **questa è l'unica via di fuga, ed è chiudibile**. Richiede **rotazione**, non solo rimozione | P2-006 |
| AUD-007 | **`suspend` crea un range invertito** su coverage frammentata → `data_exception` non mappato → **500 dove il contratto prevede 422**. Sequenza riproducibile con soli passi leciti. La stessa classe di difetto era già stata trovata e corretta per `terminate` nell'audit del 09/07, che dichiarava l'invariante a livello di sistema e lo ha verificato su un solo metodo | `bookings.service.ts:649-672` · P1-001 |
| AUD-008 | **`DELETE /seasons/:id` → 500** perché la cascata applicativa ignora 2 FK RESTRICT su 4. **Raggiungibile con il seed shipped** | `seasons.service.ts:44-61` · P1-002 |
| AUD-009 | **`CustomerAccessCard` congela `bookingId`** → genera/revoca l'accesso di **un altro bagnante** mostrando all'operatore QR+PIN che crede del cliente a schermo. Il pattern corretto (thunk) esiste e **è documentato** 4 cartelle più in là | `CustomerAccessCard.vue:10-12` · P3-001 |
| AUD-010 | **`web-customer` non ha logout** (né UI né revoca server-side: `POST /customer/logout` esiste, è coperto da e2e, ha **zero chiamanti**) e **il 401 terminale non redirige** (l'handler è `logout`, che non naviga) → l'utente resta su una pagina che dice «Non hai abbonamenti attivi» | P4-002, P4-001 |
| AUD-011 | **Due politiche UUID incompatibili**: `@IsUUID()` in 14 campi rifiuta gli id sintetici che `common/uuid.ts` dichiara validi → il Pedalò del seed **non è noleggiabile**; lo stesso `customerId` è accettato da `POST /bookings` e rifiutato da `POST /bookings/:id/transfer` | P1-003 |
| AUD-012 | **9 viste su 12 non consultano mai `isError`**: un guasto della Mappa rende **una spiaggia vuota**, non un errore; nelle tabelle un fallimento è indistinguibile da «nessun risultato» | P3-002, P4-004 |
| AUD-013 | **Nessuno dei 32 `Select` ha un nome accessibile** (WCAG 4.1.2): `Field` avvolge in `<label>` un `<button role="combobox">`, che non è etichettabile → lo screen reader annuncia il **valore**, mai l'etichetta | P3-003 |
| AUD-014 | **`web-platform` non ha alcuna gestione globale del 401** — D-037 è marcata **CHIUSA** senza che l'app sia mai stata nominata in nessuno dei tre aggiornamenti | P4-003 |
| AUD-015 | **29 advisory** di cui 9 HIGH realmente in produzione, perché l'immagine API è **single-stage, gira come root** e contiene l'intera toolchain di sviluppo. I tre Dockerfile web sono multi-stage: solo l'API no | P7-002, P7-003 |
| AUD-016 | **La configurazione non è validata all'avvio**: tre politiche incoerenti nello stesso servizio, e `CUSTOMER_APP_URL` degrada in silenzio producendo `activationUrl` **relativo** — il QR consegnato al cliente è inutilizzabile e **il token monouso viene bruciato** | P7-004 |
| AUD-017 | **11 env lette dal codice non sono in nessun `.env.example`**, fra cui `CUSTOMER_APP_URL` che governa l'intero canale cliente. Direzione inversa: **zero voci orfane** | P7-005 |
| AUD-018 | **Nessuna CI, nessuno script `verify`.** `packages/contracts` è l'unico progetto senza `typecheck` → `pnpm -r typecheck` copre 6/7. I consumatori typecheckano contro `dist` **committato**, non contro `src` | P7-006, P5-001 |
| AUD-019 | **Il setup locale non è ricostruibile dal repo** e la macchina attuale è disallineata (container 5432, `.env` 5433). Il `README.md` non ha una riga di setup; la 5433 è **hardcodata nel codice versionato** (`reset-dev.ts:7,10`) | P7-007, P8-012 |
| AUD-020 | **Il pre-check anti-overlap carica tutta la storia di coperture** dell'ombrellone (nessun predicato di data) → 300-600 KB per singola creazione dalla 2ª-3ª stagione, sul percorso di scrittura più caldo | P9-001 |
| AUD-021 | **Nessuna paginazione in tutto lo stack** (0 `take`/`skip`/`cursor` su 58 `findMany`; `DataTable` supporta `pageSize`, nessuno lo passa) | P9-002 |
| AUD-022 | **`generate` ombrelloni: 500 INSERT sequenziali** in una transazione col timeout di default → **P2028 e rollback totale** con RTT ≥10ms, cioè il lido grande in onboarding su infrastruttura gestita. Regge in dev e si rompe in produzione | P9-003 |
| AUD-023 | **Documentazione che mente su fatti verificabili**: D-061 «unica memorizzazione» (falso: 2 token + Cache Storage ×3 app) su cui poggia la conclusione «niente banner»; ⚖️-18 cita `/privacy` (path vietato dai test) nella riga che un legale legge per verificare l'art. 14.3(a); `data-model.md` mostra `Package.equipment` **rimosso da ADR-0036**; l'indice ADR si ferma a 0051 | P8-001, P8-003, P8-007, P8-004 |
| AUD-024 | **Invarianti di sicurezza con protezione ZERO nei test**: «invalida i token precedenti/fratelli» mai asserito (cancellare le due righe lascia 10 test verdi); la revoca dell'accesso cliente non è mai verificata sulle **sessioni vive** (la UI dice `revoked`, il cliente continua per **120 giorni**) | P6-001, P6-002 |
| AUD-025 | **La precedenza del pricing è testata su 3 coppie su 15**: scambiare settore↔pacchetto in `specificity()` lascia **tutti i 17 test verdi** e viola ADR-0032 §2 | P6-003 |
| AUD-026 | **L'idioma `forTenant: (_t, cb) => cb(tx)` scarta il tenantId** in 7 spec → passare il tenant sbagliato è invisibile a tutti i 283 unit. **RLS testata su 1 tabella su 22, in sola lettura**; il `WITH CHECK` non è mai esercitato | P6-005, P6-009 |
| AUD-027 | **`bookings.service.ts`: 1024 LOC, zero unit test** — e il difetto è nel **codice di produzione**, non nei test | P6-006 |
| AUD-028 | **`JwtAuthGuard` senza unit spec**: invertire una riga rende pubblica l'intera API e **tutti i 283 unit restano verdi** | P6-018 |

---

## 4. Piano di remediation, ordinato per dipendenza

Le radici prima di ciò che ci sta sopra. Le fasi B e C sbloccano la verificabilità di tutto il resto.

### ✅ Fase A — Fermare i danni attivi — **ESEGUITA** *(commit `374007e`)*
1. **AUD-001** — asserzione hard sul nome DB in `jest-setup-env.ts` + `.env.test.example` versionato + inversione della precedenza env
2. **AUD-006** — `.dockerignore` da deny-list ad **allow-list** · ~~richiede rotazione di `JWT_SECRET`~~ **infondata** (il valore era il segnaposto già pubblico) e comunque priva di oggetto: nessun VPS esiste

### ✅ Fase B — Il gate eseguibile — **ESEGUITA** *(commit `6f618f5`)*
*Eccezione dichiarata*: `isolatedModules` **non applicata**. In ts-jest 29.4 l'opzione nel transform
è deprecata e va impostata nel `tsconfig`, cambiando il contratto del compilatore per tutta l'API:
è una decisione strutturale, non un ritocco di config. Il fix su `maxWorkers` attacca comunque la
causa misurata e l'OOM è chiuso; `isolatedModules` resta una proposta aperta (eliminerebbe il
doppio type-check, oggi fatto una volta da `tsc` e una volta per worker da ts-jest).
3. Script `verify` a root (`lint && typecheck && test`) + `typecheck` a `packages/contracts` (chiude il 6/7) + CI minimale
4. **Config Jest**: `isolatedModules` + `maxWorkers: '50%'` → chiude l'OOM (oggi il type-check è fatto **due volte**, una delle quali 31 volte in parallelo)
5. Rimuovere l'include ui-kit da `web-staff/vitest.config.ts` → baseline vera, e stesso file non più eseguito in due ambienti diversi
6. Lint: `varsIgnorePattern: '^_'` + `no-explicit-any` a `warn` negli spec (**azzera 66 errori su 73 senza toccare la produzione**) + `eslint-plugin-vue` per i 109 `.vue`

### ✅ Fase C — Da opt-in a opt-out — **ESEGUITA** *(chiude R-B; branch `chore/audit-2026-07-25-fase-c`)*
*⚠️ L'«interim a costo zero» del punto 7 era sbagliato: correzione nel riquadro in cima.*
7. **AUD-004** — guard **fail-closed** e vocabolario a **permessi** invece che a ruoli ([ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)), perché la destinazione — permessi configurabili dall'admin ([D-063](../architecture/deferred.md)) — cambia solo la *risoluzione* e non le ~60 annotazioni
8. **AUD-002/003** — `configureApp` condivisa + `trust proxy` da env + `ThrottlerGuard` **method-scoped** (non di classe: `/auth/me` è chiamata a ogni caricamento) + `@MaxLength(128)` + hash civetta
9. **AUD-016/017** — `validate` con class-validator, nessuna dipendenza nuova; valida senza trasformare, per non rompere i lettori esistenti
10. **AUD-005** — guardia del seed su `current_database()`, condivisa con `reset-dev`

### ✅ Fase D — Bug di correttezza — **ESEGUITA E MERGIATA** *(6 commit di codice, fast-forward su `main`)*
11. **AUD-007** — `carveInterval` puro usato da suspend (aperto e chiuso), releaseAbsence e terminate + CHECK `coverage_range_valid`
12. **AUD-008** — `P2003 → 409` in `mapPrismaKnownError` + i count mancanti in `SeasonsService.remove`
13. **AUD-009** — thunk nei composable di `useCustomers.ts` (15 composable, 12 punti di chiamata)
14. **AUD-010** — logout con revoca server-side + redirect in `CustomerShell` su fine sessione
15. **AUD-011** — `@IsUuidShape()` in `common/` + lint che vieta `@IsUUID` + `prisma/dev-ids.ts` condiviso dai due seed
16. P2-008 (`pinAttempts` con `increment`), P2-009 (articolo archiviato noleggiabile), P1-004 (guardia anonimizzato nei 4 write-path)

*Scoperto eseguendo:* `seed-report-demo.ts` non poteva funzionare su un database appena seedato
(riferiva id prodotti da un helper divergente da quello di `seed.ts`), e il ramo
`NEW_CUSTOMER_ANON` della cessione — l'unica guardia «cliente anonimizzato» che *già esisteva* —
non aveva un solo test: cancellarlo lasciava la suite verde.

### ✅ Fase E — Presidi strutturali — **ESEGUITA** *(chiude R-C; branch `chore/audit-2026-07-25-fase-e`)*
17. **P2-007** — 3 indici unici **parziali** (sospensione aperta, assenza attiva per giorno, rinnovo confermato) · **P2-005** — FK `BookingCoverage.umbrellaId` → `Umbrella` (RESTRICT) + `coverage_fill_slot_minutes()` estesa a ereditare anche `umbrellaId`, con il trigger ricreato su `UPDATE OF "bookingId", "umbrellaId"`
18. **P9-004** — **2** indici compositi, non 3: `(establishmentId, customerId)` e `(establishmentId, collectionDate)`. Il terzo, su `previousBookingId`, è **ridondante** con l'indice unico parziale dei rinnovi — stessa colonna in testa, predicato implicato da entrambe le query. Verificato con `EXPLAIN` su 25.000 prenotazioni sintetiche
19. *(fuori dalla lista originale, §5.3 dell'handoff di Fase D)* — CHECK `booking_range_valid` e `suspension_range_valid`, gemelli del `coverage_range_valid` di Fase D

*Scoperto eseguendo:* **ADR-0046 dichiarava `umbrellaId` «mantenuto DB-autoritativo dai trigger» dall'origine,
e non lo era**: il trigger popolava solo i minuti. Il documento correva avanti al codice da 17 giorni, ed è
esattamente il finding P2-005 scritto in un ADR senza che nessuno lo leggesse come un difetto. Inoltre **due
test esistenti erano costruiti su premesse che i nuovi vincoli invalidano**: quello di `coverage_range_valid`
sarebbe passato per il constraint sbagliato (entrambi 23514), e quello del trigger su `UPDATE OF bookingId`
ora collide davvero con `coverage_no_overlap` — prima passava solo perché la chiave di partizionamento
restava stantia, cioè l'occupazione fantasma in persona.

### Fase F — API dei moduli condivisi *(chiude R-D/R-E; ⚠️ decisioni strutturali)*
19. Allargare `useActiveSeason`, `statusMaps`, `queryKeys`, `lib/dates` · `crypto.module.ts` `@Global`
20. `DataTable` generico · etichettatura in `Field`/`Select` · `QueryBoundary`/`ErrorState` · `sideEffects` in `ui-kit`

### Fase G — Test *(chiude R-I/R-J)*
21. Mirror unit delle difese di sicurezza (4-10 righe ciascuno: `JwtAuthGuard`, `token.service` kind, `CustomerSessionService`)
22. Fixture con lo stato concorrente sui test che oggi non possono fallire · fake `forTenant` che **asserisce** il tenant · test RLS parametrico derivato da `grep CREATE POLICY`

### Fase H — Documentazione *(chiude R-G)*
23. Correggere le affermazioni false verificate (D-061, ⚖️-18, `data-model.md`, indice ADR, README root, README web-staff, guida deploy)
24. Igiene di `deferred.md` · spostare le asserzioni verificabili dai documenti ai test

---

## 5. Cosa NON è stato fatto in questo audit

- **Nessun fix applicato.** Modalità concordata: report + fix su conferma.
- **Nessuna modifica al repo.** L'unica esecuzione con effetti è stata la suite e2e su `coralyn_test`, con `DATABASE_URL` passata inline e nessuna migration applicata (`coralyn_test` era già allineato a tutte e 28).
- **Non verificati end-to-end**: 20+ e2e API (fra cui `bookings.e2e-spec.ts`, 61 KB), ~25 unit API, ~15 spec web-staff, i DTO di scrittura non citati, ~50 handoff storici pre-21/07, `docs/plans/` e `docs/superpowers/`.
- **Non verificati gli anchor** `#sezione` dei link: **95 link rotti è un minimo**.
- **Nessuna misurazione dinamica** di performance: ogni ordine di grandezza è derivato dal conteggio delle query nel codice e da costanti verificate nelle dipendenze installate.
