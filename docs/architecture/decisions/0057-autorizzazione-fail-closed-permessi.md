# ADR-0057: Autorizzazione fail-closed, dichiarata per permesso

- **Status:** Accepted
- **Data:** 2026-07-25
- **Decisori:** Team di progetto
- **Emenda:** [ADR-0039](0039-rbac-role-guard.md) (`@Roles`/`RolesGuard`, allow-by-default)
- **ADR correlati:** [ADR-0024](0024-strategia-auth.md) (JwtAuthGuard globale),
  [ADR-0015](0015-osservabilita-e-console-superuser.md) (superuser di piattaforma),
  [ADR-0056](0056-package-legale-condiviso.md) (profilo legale del lido)
- **Origine:** audit 2026-07-25, finding AUD-004 / radice R-B
- **Apre:** [D-063](../deferred.md) — permessi configurabili dall'admin del lido

## Context

[ADR-0039](0039-rbac-role-guard.md) introdusse `@Roles` + `RolesGuard` con una scelta esplicita:
**«se i ruoli richiesti sono assenti, passa»**, elencata fra le conseguenze positive come «zero
impatto sugli endpoint esistenti». Era corretta per il suo scopo — introdurre un primitivo di
autorizzazione senza toccare le rotte già scritte.

Quattro mesi dopo, la conseguenza misurata è che **la copertura dell'autorizzazione è funzione
della storia dei commit, non del rischio**. L'audit del 2026-07-25 ha contato **~60 endpoint su 15
controller** senza alcuna dichiarazione, tutti raggiungibili da un token `staff`. La prova più
netta sta dentro un solo file: in `establishment.controller.ts` l'unico endpoint che espone dati
personali — `GET overview`, che restituisce l'elenco delle email di tutti gli operatori del lido —
era **l'unico dei tre senza guardia**, mentre gli altri due erano protetti.

Due fatti hanno spostato la decisione da «prima o poi» a «adesso»:

1. **Il login staff è su Internet** dalla slice deploy del 17/07. La superficie che rendeva
   tollerabile un default permissivo non esiste più.
2. **La direzione del prodotto è nota**: l'admin di un lido dovrà poter decidere cosa il proprio
   staff può fare (modificare il listino, aprire campagne, ecc.). Qualunque forma prenda, quel
   sistema ha bisogno che **ogni endpoint dichiari cosa richiede** — lavoro che va fatto una volta.

Il passo intermedio suggerito dal report — mettere `@Roles(Role.Admin)` di classe sui controller
scoperti — è stato **verificato e scartato**: si veda *Alternatives considered*.

## Decision

**Il guard nega in assenza di dichiarazione, e la dichiarazione è un permesso, non un ruolo.**

1. `RolesGuard` e `@Roles` sono **sostituiti** da `PermissionsGuard` e `@RequiresPermission`.
   Non convivono: due meccanismi di autorizzazione sono un modo di avere due politiche.
2. Una rotta senza `@RequiresPermission` riceve **403**. Le rotte `@Public()` sono esenti — non
   hanno un'identità su cui valutare un permesso, e il canale cliente ha la propria
   autenticazione (`CustomerJwtGuard`).
3. Il vocabolario è l'enum `Permission` (`apps/api/src/identity/permission.ts`), con la
   granularità delle **sezioni della UI** — ciò che un admin vedrà un giorno come interruttori.
   `legal-profile.manage` è separato da `establishment.manage` di proposito: alimenta un documento
   di legge (ADR-0055/0056), e concederlo non deve essere l'effetto collaterale di altro.
4. La corrispondenza permesso → ruoli è una **tabella statica** (`PERMISSION_ROLES`) che riproduce
   **esattamente** la copertura precedente all'inversione. L'inversione chiude il buco strutturale
   **senza cambiare cosa un operatore può fare**.
5. Il **superuser** non detiene alcun permesso tenant-scoped: non ha un ruolo dentro il lido, cosa
   che ADR-0039 già dichiarava.
6. La copertura è verificata da `authorization-coverage.spec.ts`, che enumera gli handler
   **partendo dal filesystem** e fallisce se uno non dichiara né un permesso né `@Public`.

## Consequences

### Positive
- Una rotta nuova nasce **protetta**: dimenticare la dichiarazione produce un 403, non un varco.
- La dichiarazione è **leggibile**: `@RequiresPermission(Permission.CustomersErase)` dice cosa
  l'endpoint fa, non chi lo usa oggi.
- Il lavoro di annotazione è **speso una volta sola**: quando i permessi diventeranno configurabili
  per tenant (D-063), cambia la *risoluzione*, non le annotazioni.
  ⚠️ **«~60» è il conteggio delle ROTTE scoperte all'audit, non delle annotazioni.** Le due cose
  non coincidono, perché un `@RequiresPermission` di classe copre tutti gli handler del
  controller: misurati oggi sul repo, **37 decoratori** nei `*.controller.ts` (21 di classe, 16
  di metodo) coprono **119 handler**. Il referente giusto della frase sono le rotte.
- Il test di copertura sposta l'errore da runtime a CI, e non invecchia: il set di controller è il
  filesystem, non una lista scritta a mano.

### Negative / Trade-off
- **Tre asserzioni e2e cambiano**: il superuser su rotte tenant-scoped passa da `400` (tenant
  assente) a `403` (permesso non detenuto). Il 400 era un effetto del default permissivo — la
  richiesta arrivava fino al `TenantContext` — non una decisione. Il 403 è la risposta corretta e
  arriva prima.
- **Un permesso in più da mantenere** ogni volta che nasce un'area funzionale. È il costo che
  rende possibile la configurabilità; senza, il costo si sposterebbe sul futuro.
- La tabella `PERMISSION_ROLES` è un secondo posto in cui guardare per rispondere a «chi può fare
  cosa». In cambio è **l'unico** posto: prima la risposta andava ricostruita leggendo 25 controller.

### Neutre / Note
- `Permission` vive in `apps/api/`, non in `@coralyn/contracts`: oggi nessun frontend lo consuma
  (il gating FE è ancora sul ruolo). Spostarlo nei contracts è parte di D-063, quando servirà.
- Il guard resta il **secondo** `APP_GUARD` dopo `JwtAuthGuard`: l'ordine garantisce `req.user`.

## Alternatives considered

- **Lasciare il default permissivo e annotare solo gli endpoint a rischio** — scartata: è ciò che
  si è fatto finora, e il risultato è che la copertura segue la storia dei commit. Non chiude la
  radice: il prossimo endpoint nasce comunque scoperto.

- **Invertire il default mantenendo `@Roles`** — scartata perché la destinazione è nota. Le stesse
  ~60 rotte andrebbero toccate una seconda volta per passare ai permessi, e la seconda passata è
  proprio quella in cui una svista diventa un buco di autorizzazione.

- **Il passo intermedio del report: `@Roles(Role.Admin)` di classe sui 9 controller scoperti**,
  descritto come «a costo zero» — **scartata perché la verifica lo ha smentito**. Quei controller
  servono `/pricing`, `/rentals`, `/rentals/catalogo` e `/renewals`, che `SidebarNav.vue` mostra a
  **ogni** ruolo; e `GET /establishment/overview` è chiamata dall'app-shell a ogni caricamento, via
  `useActiveSeason`. Il passo avrebbe rotto Listino, Listino noleggi, Rinnovi e il banco Noleggi per
  lo staff. Peggio: **la suite sarebbe rimasta verde**, perché nessuno dei 9 file e2e di quei
  controller crea un utente `staff` — fanno tutti login come `admin`. Il buco di copertura era
  esattamente sul ruolo che il cambiamento avrebbe colpito.

- **Permessi configurabili per tenant subito** (dati + UI + risoluzione da DB) — rimandata a
  [D-063](../deferred.md): è una slice di dominio con modello dati, migration, schermata di
  amministrazione e una scelta architetturale vera (permessi nel token, quindi stantii fino a
  scadenza, oppure riletti a ogni richiesta). Questo ADR ne è il **prerequisito**, non un'anticipazione.

## Rubric check

1. **Professionalità** — fail-closed è il default atteso da qualunque revisore su un'API esposta;
   la migrazione è verificata da un test meccanico e da un e2e che esercita il ruolo prima scoperto.
2. **Convenzioni** — stessa forma dei guard esistenti (metadato + `Reflector` + `APP_GUARD`),
   identificatori in inglese ([ADR-0030](0030-codice-e-db-in-inglese.md)), commenti in italiano.
3. **Modularità** — un solo meccanismo di autorizzazione; il vocabolario (`permission.ts`), il
   decoratore e il guard sono file distinti con una responsabilità ciascuno.
4. **Zero debito** — il debito residuo è tracciato: [D-063](../deferred.md) per la
   configurabilità e [D-064](../deferred.md#d-064) per la separazione di `team[]` dalla overview, che
   resta leggibile dallo staff perché l'app-shell ne dipende. ✅ **D-064 è chiusa dal 2026-07-26**
   ([ADR-0060](0060-read-model-shell-senza-pii.md)): l'overview resta leggibile dallo staff — quella
   parte della frase è ancora vera — ma non porta più dati personali, e il team ha un endpoint suo
   sotto `team.manage`. Resta aperta la sola D-063.
