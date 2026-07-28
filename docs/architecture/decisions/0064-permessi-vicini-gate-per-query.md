# ADR-0064: La nav dichiara il permesso primario, ogni query dichiara il proprio, e l'assenza da permesso si dichiara

- **Status:** Accepted
- **Data:** 2026-07-28
- **Decisori:** Team di progetto
- **Estende:** [ADR-0063](0063-permessi-staff-configurabili-per-operatore.md) (permessi dello staff
  configurabili per operatore)
- **ADR correlati:** [ADR-0057](0057-autorizzazione-fail-closed-permessi.md) (un permesso per
  endpoint, guard fail-closed), [ADR-0021](0021-server-state-frontend.md) (server-state e
  composable), [ADR-0058](0058-package-data-layer-condiviso.md) (`queryResource`/`mutationResource`)
- **Chiude:** nessuna voce differita. Corregge due difetti introdotti da ADR-0063, trovati dalla
  review avversariale.

## Context

[ADR-0063](0063-permessi-staff-configurabili-per-operatore.md) ha reso i permessi dello staff
configurabili per operatore e ha spostato il gating di `web-staff` dal ruolo al permesso: ogni
voce di sidebar dichiara **un** permesso, e il router nega la rotta a chi non ce l'ha.

La review avversariale della slice ha trovato che quel modello **non regge la composizione**. Una
schermata non consuma un solo endpoint: ne compone diversi, governati da permessi diversi. Il
conteggio, misurato incrociando le 29 query di `web-staff` con i `@RequiresPermission` dei
controller, è che **7 delle 8 voci operative** dipendono da endpoint fuori dal proprio permesso:

| Voce di nav | permesso dichiarato | permessi che le sue query richiedono in più |
|---|---|---|
| Mappa | `map.read` | `bookings.manage`, `customers.manage`, `pricing.manage` |
| Prenotazioni | `bookings.manage` | `customers.manage`, `map.read`, `pricing.manage`, `structure.read` |
| Noleggi | `rentals.operate` | `rental-catalog.manage`, `customers.manage`, `pricing.manage` |
| Rinnovi | `renewals.manage` | `bookings.manage`, `pricing.manage`, + i 4 di `useEntityLabels` |
| Listino | `pricing.manage` | `map.read` |
| Listino noleggi | `rental-catalog.manage` | `pricing.manage` |
| Clienti | `customers.manage` | `customer-access.manage` (card «Accesso cliente» nella scheda) |
| Report | `reports.read` | nessuno: pulita |

**E il guasto non è un errore: è silenzio.** Montando la Mappa con quei tre endpoint a 403 e il
caso di controllo accanto, la schermata rende **identica** — settori, ombrelloni, occupazione — e
non mostra **alcuno** stato d'errore: ogni chiamante fa `?? []`, quindi un permesso mancante è
indistinguibile da un insieme vuoto. Nel caso peggiore la UI **afferma il falso**: senza
`customers.manage` il selettore cliente della nuova prenotazione diceva *«Nessun cliente. Crea un
cliente.»*, cioè una bugia con un invito ad agire.

Prima di ADR-0063 questo non era raggiungibile: lo staff aveva un insieme di permessi **fisso**,
quindi «`map.read` senza `customers.manage`» non esisteva. Il `?? []` è più vecchio della slice,
ma **è ADR-0063 che lo rende attivabile** — e la configurazione-esempio con cui quell'ADR apre
(«il bagnino nuovo non tocca il listino») è precisamente una di quelle che rompono.

⚠️ La spec di D-063 aveva messo la resa dei 403 fuori scope con la motivazione «il router negherà
le rotte prima che ci si arrivi». È falsa due volte: il router nega su **un** permesso per rotta,
e nel caso di revoca totale **lascia passare di proposito** (`permissionGuard.ts:37`).

## Decision

**Il permesso della voce di nav resta uno — quello primario della sezione. Le dipendenze vicine si
governano dove nascono: ogni query dichiara il permesso del proprio endpoint, e l'assenza che ne
deriva si dichiara all'operatore invece di somigliare a un insieme vuoto.**

1. **La nav dichiara il permesso PRIMARIO, non l'insieme.** `navigation.ts` non cambia forma.
2. **Ogni query dichiara il permesso del suo endpoint**, con `enabled: () => session.hasPermission(…)`
   sul composable. È il meccanismo che il repo già usava in 3 punti su 29 (`useEstablishmentTeam`,
   `useStaffPermissions`, `useSetupStatus`); qui diventa la regola. Conseguenza: **zero 403 sprecati**
   invece di due per query (`retry: 1`).
3. **Il widget che consuma una query gatata è gatato con lei.** Non è opzionale: una query
   `enabled:false` resta `isPending` per sempre, quindi uno scheletro girerebbe all'infinito. È già
   la ragione del `v-if="canManageTeam"` sulla card Team di `EstablishmentView.vue`.
4. **Dove il vuoto sarebbe un'affermazione, si dichiara il permesso mancante.** Testo esplicito, non
   un empty-state generico.
5. **Un presidio deriva l'elenco delle query dal filesystem** (`query-permissions.spec.ts`) e
   pretende che ognuna dichiari un permesso, più un campione comportamentale con caso di controllo
   che prova che il gate **sopprime la richiesta**, non che la stringa compaia nel file.
6. **Lo stato terminale «nessuna sezione assegnata» si dichiara, in un punto solo.**
   `resolvePermissionGuard` restituiva `true` quando nessuna destinazione è accessibile, motivandolo
   con «meglio una vista che mostra il proprio errore». **Il punto 2 rende falsa quella premessa**:
   con la query primaria gatata la vista non ha né errore né caricamento, e la Mappa renderebbe
   mare, battigia e zero ombrelloni — muta — come schermata di atterraggio dopo il login. Il ramo
   terminale porta ora a `/nessun-accesso`. È l'**unico** modo di raggiungere una vista senza il
   suo permesso primario: in ogni altro caso la guardia dirotta prima, quindi una riga qui vale per
   tutte e dodici le viste.
   ⚠️ Questo punto è nato da una **regressione introdotta dai fix stessi**, trovata dalla review
   avversariale e confermata da entrambi gli scettici. Il gate verde non la vedeva.
7. **`PERMISSION_ROLES` si sposta in `@coralyn/contracts`**, dove già vive `Permission`. Il banco di
   prova di `web-staff` ne **derivava** i permessi di ruolo secondo un commento, ma la lista dello
   staff era ricopiata a mano — e con il gating per query una divergenza avrebbe fatto esercitare a
   tutta la suite un operatore che il backend non produce. `apps/api/src/identity/permission.ts` la
   ri-esporta, come già faceva per `Permission`.

### Il confine con AUD-012

Questo ADR governa lo stato **`enabled:false`** — assenza **deliberata**, di cui si conosce la
causa e si sa dare il nome. Non governa `isError`, l'assenza **da guasto**.

⚠️ **AUD-012 è già CORRETTA** (Fase F dell'audit,
[report](../../audit/2026-07-25-audit-completo.md) riga 78): `QueryBoundary`/`ErrorState` sono in
`ui-kit` e le viste li usano. Proprio per questo il confine conta: la correzione di AUD-012 rende
l'assenza **da errore**, e non poteva prevedere un terzo stato in cui **non c'è errore**, perché la
richiesta non parte affatto. `QueryBoundary` non ha nulla da mostrare quando `error` è `null` e
`isLoading` è `false` — ed è esattamente il buco in cui questa sessione è caduta col guasto della
Mappa (vedi il punto 6 della Decision). Le due rese restano distinte perché sono due stati distinti.

## Consequences

### Positive
- **L'esempio di ADR-0063 torna a funzionare.** Revocare `pricing.manage` nasconde «Listino» e
  nient'altro: la Mappa resta usabile, senza i nomi dei pacchetti e dicendolo.
- **La dipendenza è esplicita e verificata a macchina**, non affidata alla memoria di chi aggiunge
  una query.
- **Meno richieste**, non più: un operatore ristretto non paga più 403 a ogni caricamento —
  compreso `useEstablishmentOverview`, che l'app-shell chiama a **ogni** navigazione.
- Il banco di prova monta un **operatore reale**: dei 61 spec di `web-staff`, **39 usano `mountApp`
  e 23 di questi non impostavano alcuna sessione**, cioè montavano con `user = null` — uno stato
  che nell'app non esiste, perché ogni vista sta dietro il guard d'autenticazione. (Misurato:
  `grep -rl "mountApp(" --include=*.spec.ts` contro `grep -rl "\.user = "`.)

### Negative / Trade-off
- **Una riga di gate per query, 29 posti.** È ripetizione, e una query nuova può nascere senza
  gate — per questo il presidio parte dal filesystem invece che da una lista.
- **Il gate verifica che ci sia UN permesso, non che sia QUELLO GIUSTO.** È esattamente la barra
  che l'API si dà in `authorization-coverage.spec.ts`, e il limite è lo stesso: la correttezza
  della scelta resta alla review e alle e2e. Dichiararlo è parte della decisione.
- **`PERMISSION_ROLES` finisce nei bundle client, anche dove non serve.** `@coralyn/contracts` è
  compilato in **CommonJS** (`"type": "commonjs"`, `tsconfig` `"module": "CommonJS"`), quindi il
  bundler non può fare tree-shaking selettivo: chiunque importi *qualcosa* dai contracts si porta
  dietro il modulo intero. La tabella viaggia quindi anche in `web-customer`, che non la usa
  affatto. Nessun codice di produzione la legge — solo `test/utils.ts` e l'API — ma la riga
  «nessun bundle la importa» sarebbe stata falsa, ed è stata verificata invece che assunta.
  Il costo è accettabile: sono 19 righe di **policy già pubblica** (ADR-0057, e il repo è pubblico),
  la protezione resta il 403 del server, e la tabella non rivela nulla che non si deduca provando
  gli endpoint. Resta una superficie in più da non far divergere.
- **Il gate dipende dai permessi in `UserDTO`**, che sono uno snapshot al login/`/auth/me`. Uno
  snapshot stantio nasconde un widget di troppo o ne mostra uno che poi prende 403: non è un
  rischio nuovo — la sidebar dipendeva già dallo stesso snapshot — e la protezione resta il 403.

### Neutre / Note
- **Le tre alternative considerate durante la review sono state scartate per aritmetica**, non per
  gusto: vedi sotto.
- Il difetto gemello trovato nella stessa review — il bottone **Salva** del modale dei permessi
  fuori dal `QueryBoundary`, che su lettura fallita inviava `{"permissions":[]}` e azzerava
  l'operatore **con conferma di successo** — è dello stesso ceppo (uno stato di assenza reso come
  un dato valido) ma si chiude in due righe e non ha richiesto una decisione: gate sul dato nel
  footer **e** guardia in `submit()`, ciascuno provato da una mutazione distinta.

## Alternatives considered

- **Ogni voce di nav dichiara l'INSIEME dei permessi che la sua vista richiede (AND)** — scartata
  **per aritmetica**. `pricing.manage` compare in **6 delle 8 voci operative**: revocarlo — che è
  l'esempio di apertura di ADR-0063 — lascerebbe operative **Clienti e Report**, cioè 2 su 8 (per
  un admin resterebbe in più «Struttura», che sta in `ADMIN_NAV`: 3 voci su 9 in tutto). L'opzione
  è onesta e rende la feature inutile sul suo caso d'uso principale.

- **Le viste degradano sui sotto-dati negati** — scartata perché **è già ciò che fanno**: il
  `?? []` *è* il difetto. Ciò che mancava non è la tolleranza, è l'onestà. Ampliata al «rendere
  bene ogni 403» sarebbe la radice di AUD-012, che è un finding separato con la sua causa.

- **Dipendenze dichiarate fra permessi, imposte dalla schermata di amministrazione** — scartata due
  volte. Ha la stessa aritmetica dell'opzione 1 (la chiusura transitiva rende `pricing.manage`
  praticamente non revocabile), e introduce un modello di accoppiamento che **esiste solo nel
  frontend**: il server accetterebbe configurazioni che la UI rifiuta. È esattamente la divergenza
  fra due letture di «cosa fa lo staff» che il brief di D-063 segnalava per primo.

- **Un banco di prova che monta ancora senza sessione, aggiustando i 123 test caduti** — scartata:
  i test non erano sbagliati, lo era il montaggio. `user = null` nega ogni permesso, quindi tre
  test dichiarati «staff» passavano **per la ragione sbagliata** — asserivano l'assenza di un
  bottone sotto una sessione che nega *tutto*. Resi espliciti, dicono ciò che promettono.

## Rubric check

1. **Professionalità** — la dipendenza fra vista ed endpoint smette di essere implicita; il
   presidio parte dal filesystem, quindi non invecchia; ciò che il presidio **non** copre è
   dichiarato invece che sottinteso.
2. **Convenzioni** — `enabled` + `hasPermission` è il meccanismo che il repo già usava, non uno
   nuovo; il `v-if` sul widget è l'idioma della card Team; il presidio è modellato su
   `authorization-coverage.spec.ts`.
3. **Modularità** — il permesso sta sulla query che lo richiede, cioè accanto all'endpoint che lo
   dichiara; la nav non deve sapere cosa compone una vista.
4. **Zero debito** — nessuna voce differita aperta. AUD-012 non viene toccata **né allargata**: il
   confine fra assenza-da-permesso e assenza-da-guasto è scritto sopra.
