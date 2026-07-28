# ADR-0063: I permessi dello staff sono configurabili per operatore, e risolti a ogni richiesta

- **Status:** Accepted
- **Data:** 2026-07-27
- **Decisori:** Team di progetto
- **Estende:** [ADR-0057](0057-autorizzazione-fail-closed-permessi.md) (guard fail-closed, un
  permesso per endpoint)
- **ADR correlati:** [ADR-0010](0010-isolamento-multi-tenant.md) (RLS come rete di sicurezza),
  [ADR-0039](0039-rbac-role-guard.md) (il superuser non ha ruolo dentro il lido),
  [ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md) (tabelle d'autenticazione fuori
  da RLS), [ADR-0062](0062-generate-ombrelloni-scrittura-batch.md) (i round trip sono la
  grandezza che rompe)
- **Chiude:** [D-063](../deferred.md#d-063)
- **Esteso da:** [ADR-0064](0064-permessi-vicini-gate-per-query.md) — il gating per voce di nav non
  regge la composizione: una vista consuma endpoint di permessi diversi. Le quattro decisioni qui
  restano valide; cambia **dove** si governa la dipendenza vicina.
- **Spec:** [2026-07-27-permessi-configurabili-d063-design.md](../../superpowers/specs/2026-07-27-permessi-configurabili-d063-design.md)

## Context

[ADR-0057](0057-autorizzazione-fail-closed-permessi.md) ha reso il guard fail-closed e ha fatto
dichiarare a **ogni** endpoint il permesso che richiede, lasciando la corrispondenza permesso →
ruoli in una tabella statica, `PERMISSION_ROLES`, **uguale per tutti i lidi**. Quell'ADR
dichiarava esplicitamente che la tabella sarebbe diventata «il default di fabbrica» quando i
permessi fossero diventati configurabili, e che il lavoro di annotazione era speso una volta
sola proprio per questo.

Il bisogno è di dominio: l'admin di un lido deve poter decidere che il bagnino nuovo non tocca il
listino e il responsabile sì. Oggi ogni richiesta di personalizzazione è una modifica al codice.

Restavano aperte tre decisioni, e nessuna è neutra sul resto del sistema: la **granularità**
(lido o operatore), la **risoluzione** (permessi nel token, quindi stantii fino a scadenza,
oppure riletti), e **dove vive il vocabolario** `Permission`.

## Decision

**I permessi si configurano per operatore, si risolvono a ogni richiesta, e la tabella che li
ospita sta fuori da RLS con l'invariante di tenant imposta dal database.**

1. **Per operatore.** Una tabella `StaffPermissionOverride` chiavata su `(userId, permission)`
   contiene un **delta** sul default di fabbrica. **Assenza di riga = `PERMISSION_ROLES`**: un
   lido che non configura nulla non si accorge della slice.
2. **Solo lo `staff` è configurabile.** `admin` conserva i permessi impliciti del ruolo. Un admin
   che si revocasse `team.manage` chiuderebbe il lido fuori dalla gestione dei permessi, e non
   esiste recupero self-service dentro il tenant.
3. **Risoluzione a ogni richiesta**, e **solo per lo `staff`**: `admin` e `superuser` risolvono
   dalla tabella statica senza leggere il database. La lettura è **una** query per richiesta, che
   restituisce l'intero insieme di override dell'operatore.
4. **Fail-closed resta fail-closed, e non mente sulla causa.** Se la lettura fallisce, la
   richiesta **fallisce** (500) invece di proseguire col default di fabbrica. Un guasto del
   database non degrada mai in «concedi», e nemmeno in un 403 che attribuirebbe all'utente una
   mancanza che non ha.
5. **La tabella sta fuori da RLS**, dichiarata come tale in `rls-isolation.e2e-spec.ts` accanto a
   `User`, di cui è un attributo. In cambio, l'unico rischio che RLS avrebbe coperto qui — una
   riga che rivendica un tenant diverso da quello dell'operatore — è reso **non rappresentabile**
   da un `UNIQUE(id, establishmentId)` su `User` e da una **FK composita**
   `(userId, establishmentId) → User(id, establishmentId)`.
6. **`Permission` si sposta in `@coralyn/contracts`**, e `UserDTO` porta l'insieme **effettivo**
   dei permessi. Il gating **di `web-staff`** passa dal ruolo al permesso: un solo meccanismo.
   ⚠️ Non «del frontend»: `web-platform` resta sul ruolo, perché è la console del distributore e
   il suo unico permesso è `platform.administer`, che non è configurabile.
7. **Nessun permesso nuovo**: la configurazione sta sotto `team.manage`, che già consente di
   creare un `admin` — strettamente più potente che concedere un permesso. Restano non
   configurabili `platform.administer` (cross-tenant, ADR-0015) e `session.read` (revocarlo
   disabilita l'account, e per quello c'è `User.disabledAt`).

## Consequences

### Positive
- L'admin di un lido personalizza la divisione dei compiti **senza una modifica al codice**, che
  era il costo dichiarato da ADR-0057.
- **Una revoca morde subito.** È la proprietà per cui la feature esiste, e l'unica delle tre
  opzioni di risoluzione che la garantisce.
- Il default di fabbrica **non sparisce**: resta la risposta per ogni lido che non configura, e
  per ogni permesso aggiunto in futuro all'enum.
- La riga cross-tenant è impossibile **nel database**, non improbabile per disciplina: è più
  forte della garanzia che RLS avrebbe dato all'applicazione, perché non dipende dal fatto che
  la query passi da `forTenant`.
- Il superuser diventa **strutturalmente** incapace di detenere permessi tenant-scoped: la FK
  composita non può matchare una riga con `establishmentId` nullo. ADR-0039 lo diceva a parole.

### Negative / Trade-off
- **Una query in più per ogni richiesta `staff`**: 1,54 ms mediani misurati, un round trip. È il
  prezzo dell'effetto immediato, e si paga solo sul ruolo configurabile.
- **Una tabella tenant-scoped senza RLS.** È un'eccezione, e va letta come tale: motivata,
  dichiarata nel presidio che deriva le tabelle dal catalogo, e compensata al §5 della Decision.
  Chi aggiungerà una query su questa tabella **non è protetto da RLS** e deve filtrare da sé —
  come già accade per `User`.
- **`PermissionsGuard` diventa asincrono** e acquisisce una dipendenza da Prisma. Era un oggetto
  puro, verificabile senza I/O; ora i suoi unit test hanno un fake da mantenere.
- Il vocabolario `Permission` diventa **pubblico verso il frontend**: rinominare un valore ora
  rompe due app e non solo l'API. I valori stringa erano già dichiarati stabili da ADR-0057.

### Neutre / Note
- Il modello a **delta** e non a snapshot è ciò che fa ereditare ai lidi già configurati i
  permessi introdotti in futuro. Uno snapshot li avrebbe negati in silenzio.
- **Uno `staff` a cui è stato concesso `team.manage` può revocarselo**, e non c'è una guardia che
  lo impedisca — a differenza di `setDisabled`, che rifiuta il self-disable. La differenza è la
  recuperabilità: disabilitarsi può azzerare gli admin attivi, mentre qui l'admin del lido conserva
  sempre `team.manage` per costruzione (§2.2) e può ripristinare. È un caso noto e reversibile, non
  una svista; aggiungere la regola sarebbe stato codice per un rischio che non esiste.
- L'**audit log dei cambi di permesso** resta fuori scope, come nel brief. Il `PlatformAuditLog`
  esiste ma è di piattaforma, non del tenant: darebbe una traccia nel posto sbagliato.

## Alternatives considered

- **Permessi nel JWT, risolti al login** — scartata. Il token staff dura 8h e **non ha né refresh
  né revoca**: D-026 è chiusa per il solo canale cliente
  ([ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md)). Una revoca avrebbe morso fino a
  8 ore dopo, cioè proprio nel caso d'uso per cui la feature esiste. È l'unica opzione che
  *dichiara* un debito invece di chiuderlo.

- **Tabella sotto RLS, letta con `forTenant`** — scartata **dopo misura**. Costa 4 round trip
  contro 1: 4,92 ms contro 1,54 ms mediani su `coralyn_dev` (300 campioni, `hrtime`; strumento
  validato con `3×SELECT 1 / 1×SELECT 1` = 2,81 e conteggio derivato dei round trip = 2,99).
  ⚠️ **Questi quattro valori non sono riproducibili da questo repository**: l'harness non è
  committato, quindi vanno letti come «misurati una volta, su una macchina» — la conclusione che
  regge è il **rapporto di round trip** (4 contro 1), che è strutturale, non i millisecondi. La
  quantità che decide non è il delta locale ma i **3 round trip strutturali** (`BEGIN`,
  `set_config`, `COMMIT`), che crescono con l'RTT: alla latenza di 8 ms che
  [ADR-0062](0062-generate-ombrelloni-scrittura-batch.md) ha misurato **come punto di rottura**
  sono ~24 ms per richiesta — non è una latenza osservata qui, è la soglia oltre la quale quella
  misura diceva che il costo per round trip diventa dominante. E,
  soprattutto, avrebbe aperto **una transazione su ogni richiesta autenticata prima del lavoro
  vero**, occupando una connessione del pool per autorizzare — cioè pre-deciso
  [D-067](../deferred.md#d-067), che è una decisione separata con la sua misura.

- **Configurazione per lido** invece che per operatore — scartata: non esprime la divisione dei
  compiti *dentro* lo staff, che è il bisogno; ed è il caso particolare del per-operatore
  (configurare tutti allo stesso modo), quindi non toglie nulla.

- **Colonna JSONB o array su `User`** invece di una tabella — scartata per convenzione e per
  storia: lo schema non ha **nessun** array scalare, e le sue uniche colonne JSONB sono le due
  dichiarate morte (`Booking.extras`, P2-010) più `PlatformAuditLog.metadata`. Una tabella
  normalizzata è ciò che il repo fa.

- **Snapshot di tutti i permessi alla prima configurazione** invece del delta — scartata: un
  permesso nuovo nascerebbe negato per ogni operatore già configurato, e l'admin dovrebbe
  riaprire ogni scheda. Contraddice «`PERMISSION_ROLES` è il default di fabbrica».

- **Un permesso dedicato (`permissions.manage`)** — scartata: `team.manage` consente già di
  creare un `admin`, che è più potente. Sarebbe stata inflazione del vocabolario.

## Rubric check

1. **Professionalità** — la revoca è immediata; l'invariante di tenant è nel database; l'eccezione
   a RLS è dichiarata nel presidio che la controlla, non nascosta.
2. **Convenzioni** — tabella normalizzata (niente JSONB), identificatori in inglese
   ([ADR-0030](0030-codice-e-db-in-inglese.md)), FK composita **nello schema Prisma** (che sa
   esprimerla) e quindi protetta dal drift detection, enum condiviso nei contracts come `Role`.
3. **Modularità** — la risoluzione vive in `StaffPermissionsService` (§3 della Decision), non più
   in `permission.ts`, che resta il **default di fabbrica** e nient'altro; il guard non sa cosa sia
   un override oltre «concesso o negato»; la schermata è un componente a sé e non altre 100 righe
   in `EstablishmentView.vue`.
4. **Zero debito** — nessuna voce nuova aperta da questa decisione. L'eccezione a RLS è
   compensata (§5) e presidiata; l'audit log dei cambi di permesso era già fuori scope nel brief.
