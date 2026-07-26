# ADR-0060: il read-model dell'app-shell non porta dati personali

- **Status:** Accepted
- **Data:** 2026-07-26
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0057](0057-autorizzazione-fail-closed-permessi.md) (autorizzazione
  fail-closed a permessi: questo ADR ne chiude il debito residuo dichiarato al §Rubric),
  [ADR-0058](0058-package-data-layer-condiviso.md) (§7, «cosa la renderebbe rossa se smettesse di
  esserlo?»), [ADR-0002](0002-decision-rubric.md) (rubrica)
- **Origine:** audit 2026-07-25, finding AUD-004 — il caso PII che lo aveva motivato
- **Chiude:** [D-064](../deferred.md#d-064)

## Context

`GET /establishment/overview` restituiva `team[]`, cioè **email, ruolo e stato di disabilitazione di
tutti gli operatori del lido**, sotto il permesso `establishment.read` — che
[`permission.ts`](../../../apps/api/src/identity/permission.ts) concede ad **admin e staff**.

L'inversione fail-closed di ADR-0057 non poteva chiuderlo: restringere l'endpoint lo romperebbe,
perché l'app-shell lo chiama a **ogni caricamento** per il nome della stagione attiva
(`SidebarNav` → `useActiveSeason` → `useEstablishmentOverview`). Da qui la formulazione con cui
D-064 era stata rimandata: «separare il payload, non negare l'endpoint».

Rimisurando prima di eseguire, **due enunciati del registro erano sbagliati**, e uno cambia la
gravità:

| Il registro diceva | La misura |
|---|---|
| «il link è nascosto dal menu ma l'URL è raggiungibile» | ❌ Il bottone col nome del lido in [`SidebarNav.vue`](../../../apps/web-staff/src/app/SidebarNav.vue) fa `router.push('/establishment')` ed è **incondizionato**: lo staff ci arrivava con un click, non digitando un URL |
| «serve un endpoint distinto per `team[]`, sotto `team.manage`» | ✅ ma il posto esisteva già: [`establishment-users.controller.ts`](../../../apps/api/src/establishment/establishment-users.controller.ts) è interamente `@RequiresPermission(TeamManage)` e aveva POST/PATCH — **mancava solo il GET** |

E un terzo fatto, che ha cambiato il **perimetro**: rilette tutte le card di `EstablishmentView.vue`,
**ognuna delle superfici admin ha già `v-if="isAdmin"`** con un `Badge tone="soon"` come fallback.
La pagina è progettata per entrambi i ruoli, e l'unica cosa che perdeva PII era la card del team.

La radice non è quindi «un endpoint senza guard», che ADR-0057 ha già chiuso, ma: **un read-model
condiviso fra due consumatori con bisogni diversi, il cui permesso è inchiodato al consumatore più
debole mentre il payload cresce verso il più forte.** È la radice R5 dell'audit — «i cancelli vanno
nella configurazione» — applicata alla *forma dei dati* invece che al gate.

## Decision

**1. `team[]` esce da `EstablishmentOverviewDTO`.** L'overview resta sotto `establishment.read`,
perché è ciò che l'app-shell legge; ciò che cambia è che quel payload **non può contenere dati
personali**. La regola è scritta accanto al tipo in `@coralyn/contracts` e accanto alla rotta nel
controller, non solo qui.

**2. Il team è `GET /establishment/users`, sotto `team.manage`.** Nessun modulo, nessun servizio e
nessun controller nuovi: il permesso di classe c'era già, e con esso l'invariante che le tre rotte di
scrittura sugli utenti rispettano da sempre. Il GET era l'unica operazione mancante sulla risorsa che
quel controller possiede.

**3. La rotta `/establishment` NON viene gated ad Admin.** D-064 lo proponeva come seconda metà del
fix. È stato scartato **perché il primo punto lo rende inutile**: tolte le email, su quella pagina non
resta nulla che lo staff non possa vedere, mentre il gate gli toglierebbe una pagina che usa
legittimamente (nome del lido, stagione, fasce operative, numeri di struttura, logout) e renderebbe
morto il bottone della sidebar. **Si rende la rotta innocua invece di negarla**: è la terza via
rispetto alle due che il registro aveva formulato.

**4. Il presidio è sul payload, non sul permesso, e sta a due livelli.**
[`establishment.projection.spec.ts`](../../../apps/api/src/establishment/establishment.projection.spec.ts)
asserisce l'**elenco esatto delle chiavi** del DTO — gira nel job veloce, e obbliga chiunque aggiunga
un campo a passare da quella riga;
[`establishment.e2e-spec.ts`](../../../apps/api/test/establishment.e2e-spec.ts) asserisce che il
payload HTTP reale **non contenga `@`**, su un tenant che ha due operatori con email note, quindi
l'assenza è una misura e non un'assunzione. Il permesso è presidiato dove già si presidiava:
[`authorization-staff.e2e-spec.ts`](../../../apps/api/test/authorization-staff.e2e-spec.ts).

**5. Sul fronte, due guardie indipendenti.** La query del team è separata e `enabled` solo per
l'admin — stesso idioma di
[`useSetupStatus`](../../../apps/web-staff/src/features/onboarding/useSetupStatus.ts), che risolve lo
stesso problema per lo stesso motivo — **e** la card è `v-if="isAdmin"`. La ridondanza non è
decorativa e non è gratuita: senza `enabled` ogni staff che apre Stabilimento farebbe un 403 a ogni
visita, e senza `v-if` la card comparirebbe vuota. Sono due difetti diversi, non lo stesso due volte.

**6. L'ordinamento del team resta in JS (`localeCompare`), non in SQL.** La collation di Postgres non
ordina come il confronto locale-aware: spostarlo avrebbe cambiato in silenzio l'ordine che la UI
mostrava. Il filtro sul ruolo passa invece in `where` — meno dati escono dal database, e la query si
allinea al tipo del DTO. Il superuser era comunque già fuori per costruzione (`establishmentId` null,
[ADR-0026](0026-identita-rls-utente.md)): il filtro è difesa in profondità, e il commento accanto
lo dice per non far credere che sia lui a reggere l'isolamento.

## Alternatives considered

- **Restringere l'overview ad admin e creare un endpoint magro per lo shell** — scartata. È più
  difensiva per costruzione (l'endpoint che lo staff legge tornerebbe letteralmente due campi, e non
  potrebbe crescere), ma toglierebbe allo staff l'intera pagina `/establishment`: una regressione di
  prodotto che il finding non chiede. Il guadagno di sicurezza sull'oggi è **zero** rispetto alla
  scelta adottata; quello sul domani è reale ma pagato da una funzione viva.
- **Far leggere allo shell la stagione da `GET /seasons`** — scartata, ed è stata misurata prima di
  scartarla: `/seasons` è sotto `PricingManage`, che lo staff ha, quindi funzionerebbe. Ma la scelta
  di quale stagione è attiva è logica di dominio (`pickActiveSeason`, con la sua spec e i bordi
  inclusivi): spostarla nel frontend per non toccare un DTO significa duplicarla in ogni client.
- **Stesso URL, payload condizionale al permesso** — scartata. Un endpoint che risponde con due forme
  diverse a seconda di chi chiede non è tipizzabile in un contratto condiviso, e sposta la decisione
  di sicurezza dentro una `if` che nessun test di autorizzazione può vedere.
- **`meta.role: Admin` sulla rotta `/establishment`** — scartata: vedi Decision §3.

## Consequences

### Positive

- **Un dato personale che rientrasse nel payload dello shell fa rosso a due livelli.** Provato:
  aggiunto `contactEmail` al DTO e valorizzato nella proiezione — la via realistica, non un cast —
  **2 rossi**, uno per livello (`non espone dati personali: le chiavi sono esattamente quelle dello
  shell`, e il presidio e2e), e nessun altro test toccato.
- **Degradare il permesso della lista team fa rosso.** Un `@RequiresPermission(EstablishmentRead)` sul
  solo metodo `list()` — che scavalca il decoratore di classe — dà **2 rossi**, uno in
  `authorization-staff.e2e-spec.ts` e uno in `establishment-users.e2e-spec.ts`.
- **Il fronte è presidiato, e la mutazione ha detto qualcosa che non era ovvio.** Tolto il solo
  `v-if="isAdmin"` dalla card: **1 rosso** — ma le email **non** erano a schermo, perché la query
  restava disabilitata; il rosso arrivava dal bottone «Aggiungi utente» ricomparso. Tolte **entrambe**
  le guardie: **2 rossi**, e i `team-row` si materializzano davvero per una sessione staff. È la
  misura che giustifica il §5 della Decision.
- **Test: 1673 → 1678.** api unit 384 → **385** (59 suite invariate), web-staff 413 → **414** (57 file),
  e2e 503 → **506** (43 suite). Lint invariato a **0 errori / 87 warning**, typecheck **9 progetti**.
- **Una copertura è passata da vuota a reale.** Il vecchio test «team: solo utenti del tenant
  (superuser escluso)» seedava un superuser con `establishmentId: null`, che nessuna query
  tenant-scoped avrebbe potuto restituire: non provava ciò che diceva. La versione nuova asserisce
  l'esclusione **dell'utente di un altro lido**, nel solo test che ha quel fixture in piedi.

### Negative / Trade-off

- **Lo staff non vede più l'elenco dei colleghi.** È un cambiamento visibile, ed è il punto del
  finding: prima la card era mostrata in sola lettura con un badge «Inviti e gestione · in arrivo» al
  posto delle azioni. Se quella lista dovesse tornare a servire allo staff, la risposta non è
  riaprire l'overview ma un endpoint che restituisca **i nomi senza le email**.
- **Una richiesta HTTP in più per l'admin** che apre Stabilimento. Non per lo staff, per cui la query
  è disabilitata: nel caso più frequente il traffico **cala**, perché l'overview che lo shell carica
  a ogni navigazione non porta più la lista utenti.
- **`EstablishmentOverviewDTO` è un breaking change** su un contratto condiviso. Il costo reale è
  contenuto perché i consumatori sono due e stanno entrambi in questo repo (`useActiveSeason` e
  `EstablishmentView`), ed è il motivo per cui la slice si poteva fare ora e non fra sei mesi.

### Neutre / Note

- L'asserzione e2e «nessun `@` nel payload» è volutamente grossolana: prende le email senza sapere
  come si chiamerà il campo che le riporterebbe. Un campo legittimo che contenesse una `@` la farebbe
  scattare — ed è il comportamento voluto: la riga da aggiornare è il punto in cui qualcuno decide,
  consapevolmente, cosa può leggere ogni operatore del lido.

## Rubric check

1. **Professionalità** — la decisione non esegue la voce del registro alla lettera: due suoi enunciati
   sono stati corretti dalla misura, e la seconda metà del fix che proponeva (gate di rotta) è stata
   scartata con la ragione scritta, non dimenticata.
2. **Convenzioni** — nessun file nuovo lato API: il GET sta sul controller che possiede già la
   risorsa. Sul fronte, `enabled: () => session.role === Role.Admin` è l'idioma già in uso in
   `useSetupStatus`; la query key segue la forma `['establishment', tenantId, …]` delle altre.
3. **Modularità** — il read-model dello shell e quello della gestione team sono ora due cose distinte,
   con due permessi e due cicli di vita: la cache del team si invalida sulle mutazioni degli utenti,
   quella dell'overview no.
4. **Zero debito** — D-064 si chiude senza aprirne altre, e il debito che ADR-0057 aveva dichiarato
   residuo al proprio §Rubric non è più residuo. Ciò che resta fuori è dichiarato qui sopra: se lo
   staff dovesse rivedere i colleghi, serve un DTO senza email, non un permesso più largo.
