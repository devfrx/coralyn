# D-063 — Permessi dello staff configurabili: spec di design

> **Spec approvata**, non un brief. Sostituisce come documento operativo il
> [brief di delega del 2026-07-25](2026-07-25-permessi-configurabili-design.md), che resta valido
> come descrizione del punto di partenza e dei gotcha, e **superato** sulle decisioni: le tre che
> lasciava aperte sono prese qui, al §2.
>
> Prerequisito: **[ADR-0057](../../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)**
> (guard fail-closed, ogni endpoint dichiara un permesso). Decisione:
> **[ADR-0063](../../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md)**.

## 1. Obiettivo

L'**admin di un lido** decide, operatore per operatore, cosa il proprio `staff` può fare — invece
di ereditare una divisione dei compiti decisa una volta per tutti i lidi in una tabella statica.

Il vocabolario e le annotazioni esistono già (ADR-0057): questa slice cambia **come il permesso
viene risolto**, non cosa gli endpoint dichiarano.

## 2. Le decisioni

### 2.1 Per operatore, non per lido

L'insieme di permessi si attacca al singolo `User`. È ciò che esprime il bisogno reale — il
bagnino nuovo non tocca il listino, il responsabile sì — e **sussume** il per-lido: configurare
tutti gli operatori allo stesso modo è un caso particolare, non una funzione mancante.

Ha già una casa: la card **Team** di [`EstablishmentView.vue`](../../../apps/web-staff/src/features/establishment/EstablishmentView.vue),
sotto `team.manage`, dove l'admin già invita, disabilita e resetta le password.

### 2.2 Solo lo `staff` è configurabile

`admin` conserva tutti i suoi permessi impliciti; `superuser` conserva il suo, che è di
piattaforma e non del lido (ADR-0015/0039).

Il motivo non è di comodità: un admin che si revocasse `team.manage` **chiuderebbe il lido fuori
dalla gestione dei permessi**, senza recupero self-service dentro il tenant. Il repo difende già
la stessa classe di problema in [`establishment-users.service.ts`](../../../apps/api/src/establishment/establishment-users.service.ts)
con «deve restare almeno un amministratore attivo». Rendere l'admin configurabile richiederebbe
di inventare l'invariante anti-lockout corrispondente — una regola in più da scrivere, testare e
spiegare, per un bisogno che nessuno ha espresso.

### 2.3 Riletti a ogni richiesta, da una tabella fuori RLS

**Non nel JWT.** Il token staff dura 8h e **non ha né refresh né revoca**: D-026 è chiusa per il
solo canale cliente ([ADR-0049](../../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)).
Permessi nel token significherebbe che revocarne uno morde **fino a 8 ore dopo** — e revocare è
esattamente il caso d'uso per cui la feature esiste. È l'unica delle tre opzioni che *dichiara*
un debito.

**Non sotto RLS.** Misurato su `coralyn_dev`, 300 campioni, orologio `process.hrtime.bigint()`:

| forma della lettura | mediana | p95 | round trip |
|---|---|---|---|
| `SELECT` indicizzata, senza transazione (fuori RLS) | **1,54 ms** | 1,84 ms | 1 |
| la stessa dentro `forTenant` (sotto RLS) | **4,92 ms** | 5,94 ms | 4 |

⚠️ **Validazione dello strumento prima di credergli**: `3×SELECT 1 / 1×SELECT 1` = **2,81**
(atteso ~3 se il costo è lineare nei round trip), e il conteggio derivato `(D−C)/A` = **2,99
round trip**. Due stime indipendenti concordano; il numero regge. La quantità che conta **non è
il delta di 3,4 ms su localhost** — è che sono **3 round trip strutturali** (`BEGIN`,
`set_config`, `COMMIT`), quindi il costo cresce **linearmente con l'RTT** del database. Alla
latenza di 8 ms che [ADR-0062](../../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)
ha misurato come punto di rottura, sono ~24 ms su *ogni* richiesta staff.

La ragione decisiva non è però il millisecondo: mettere la lettura sotto RLS significa **aprire
una transazione su ogni richiesta autenticata, prima che la richiesta faccia il suo lavoro**, e
tenere occupata una connessione del pool per il tempo di autorizzare. Cioè pre-decidere
[D-067](../../architecture/deferred.md#d-067) — budget di transazione e di pool — che è una
decisione separata, da prendere insieme a `connection_limit` e con la sua misura.

### 2.4 Il buco lasciato da RLS si chiude nel database

Rinunciare a RLS su questa tabella lascia scoperto **un solo** rischio concreto: una riga di
override che rivendica un `establishmentId` diverso da quello dell'operatore. Non lo si mitiga
con la disciplina applicativa — lo si rende **non rappresentabile**:

```sql
CREATE UNIQUE INDEX "User_id_establishmentId_key" ON "User"("id", "establishmentId");
ALTER TABLE "StaffPermissionOverride" ADD CONSTRAINT "StaffPermissionOverride_user_tenant_fkey"
  FOREIGN KEY ("userId", "establishmentId") REFERENCES "User"("id", "establishmentId")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

È l'idioma della migration [`structural_invariants`](../../../apps/api/prisma/migrations/20260725145248_structural_invariants/migration.sql)
— radice R3 dell'audit: «l'invariante vive nel codice applicativo perché il posto dove
dichiararla una volta sola è vuoto» — applicato precisamente al punto in cui si rinuncia alla
rete di RLS. Costo: **zero round trip**, è un vincolo di scrittura.

⚠️ La FK composita non può mai matchare un `superuser` (`establishmentId` è `NULL` per lui, e in
SQL `NULL` non uguaglia nulla): il superuser è quindi **strutturalmente incapace** di avere
permessi tenant-scoped, che è ciò che ADR-0039 dichiara a parole.

⚠️ L'esenzione da RLS **va dichiarata**, non subita: [`rls-isolation.e2e-spec.ts`](../../../apps/api/test/rls-isolation.e2e-spec.ts)
deriva le tabelle dal catalogo di Postgres e fallisce **nominando** ogni tabella che non sia né
sotto policy né nella mappa `SENZA_RLS` — «questa lista **è** la specifica». La voce nuova va
aggiunta con il suo perché, accanto a quella di `User`, che ha la stessa forma.

## 3. Modello dati

```prisma
/// Delta sul default di fabbrica PERMISSION_ROLES, per singolo operatore (ADR-0063).
/// Assenza di riga = default di fabbrica: un lido che non configura nulla non si accorge
/// della slice. Fuori da RLS come `User`, di cui è un attributo: vedi §2.3/§2.4.
model StaffPermissionOverride {
  userId          String   @db.Uuid
  establishmentId String   @db.Uuid
  permission      String   // valore stringa stabile dell'enum Permission
  granted         Boolean
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, permission])
  @@index([establishmentId])
}
```

**Delta, non snapshot.** L'alternativa — materializzare tutti i permessi alla prima
configurazione — è stata scartata: un permesso **nuovo** aggiunto in futuro all'enum nascerebbe
negato per ogni operatore già configurato, e l'admin dovrebbe riaprire ogni scheda per
concederlo. Col delta, il permesso nuovo segue `PERMISSION_ROLES`, che è ciò che ADR-0057
dichiara essere il default di fabbrica.

⚠️ **La FK composita non è esprimibile nel DSL Prisma** insieme alla relazione semplice `user`:
vive nella migration ed è commentata nello schema, esattamente come gli indici parziali di
`structural_invariants` e di `Umbrella_establishmentId_label_active_key`.

## 4. Risoluzione

`PERMISSION_ROLES` e `roleHasPermission` **restano** e diventano il ramo di fabbrica.

```
PermissionsGuard.canActivate:
  @Public()                → passa
  nessun permesso richiesto → 403        (fail-closed, invariato)
  role ≠ staff             → roleHasPermission(role, required)     ← ZERO letture
  role = staff             → override(userId, required) ?? roleHasPermission(...)
```

- **Solo le richieste `staff` leggono.** `admin` e `superuser` risolvono dalla tabella statica:
  la lettura non è su «ogni richiesta», è su «ogni richiesta di un operatore configurabile».
- La lettura è **una** `findMany({ where: { userId } })` — l'intero insieme di override
  dell'utente in un round trip, non uno per permesso.
- ⚠️ **Se la lettura fallisce, la richiesta fallisce.** Non prosegue col default di fabbrica.
  Fail-closed vuol dire «non procedere»; rispondere 403 a un guasto del database sarebbe mentire
  sulla causa, quindi l'errore si propaga come 500.

Il guard diventa `async`. È il secondo `APP_GUARD` dopo `JwtAuthGuard`, che resta sincrono: il
contratto «`req.user` è popolato quando questo guard parte» non cambia.

⚠️ **`PermissionsGuard` non può iniettare `TenantContext`** (request-scoped: renderebbe
request-scoped anche il guard, e con lui la catena). Legge `req.user`, che porta già `id`, `role`
e `establishmentId` dal token verificato — la stessa sorgente che `JwtAuthGuard` usa per
`req.tenantId`.

## 5. Amministrazione

**Nessun permesso nuovo.** `team.manage` copre già il caso: chi lo detiene può creare un utente
`admin` ([`establishment-users.service.ts`](../../../apps/api/src/establishment/establishment-users.service.ts)),
che è strettamente più potente che concedere un permesso. Aggiungerne uno sarebbe inflazione del
vocabolario, e la regola «nessun permesso morto» di
[`authorization-coverage.spec.ts`](../../../apps/api/src/identity/authorization-coverage.spec.ts)
non è ciò che lo impedisce — è il buon senso.

Due endpoint su `EstablishmentUsersController` (permesso `team.manage` già di classe):

| | |
|---|---|
| `GET /establishment/users/:id/permissions` | l'insieme **effettivo** dell'operatore |
| `PUT /establishment/users/:id/permissions` | sostituisce l'insieme effettivo desiderato |

Il `PUT` prende **l'insieme completo** che l'admin vuole, non un delta: è idempotente e rispecchia
lo stato degli interruttori. Il server calcola la differenza rispetto a `PERMISSION_ROLES` e
persiste **solo** ciò che se ne discosta — il modello a delta resta un dettaglio interno.

Errori, coerenti con quelli già in uso nel service:

- target inesistente **o di un altro lido** → `404` (stesso `findFirst({ id, establishmentId })`
  già usato da `resetPassword` e `setDisabled`);
- target con ruolo `admin` → `422` (§2.2);
- permesso ignoto o non configurabile nel body → `400` (ValidationPipe).

### 5.1 I permessi non configurabili

Due dei 19, e per ragioni diverse:

| Permesso | Perché non è dell'admin |
|---|---|
| `platform.administer` | cross-tenant, del solo distributore (ADR-0015). Non è del lido da concedere |
| `session.read` | è il permesso di leggere la **propria** sessione. Revocarlo non esprime una divisione dei compiti: disabilita l'account — e per quello esiste già `User.disabledAt` (D-025) |

Restano **17 configurabili**. `establishment.read` è fra questi: revocarlo fa sparire il nome
della stagione dalla sidebar (`v-if="seasonName"`), che è una **degradazione garbata e
verificata**, non una rottura — e resta una scelta legittima dell'admin.

### 5.2 Schermata

Un componente proprio accanto alla card Team, sul modello di
[`LegalProfileModal.vue`](../../../apps/web-staff/src/features/establishment/LegalProfileModal.vue):
`EstablishmentView.vue` è già a 286 righe e 17 interruttori raggruppati non ci stanno senza
mescolare responsabilità. L'azione compare **solo sulle righe con ruolo `staff`**.

## 6. Contratto FE/BE

`Permission` si sposta in **`@coralyn/contracts`**. Non è una scelta: la schermata deve enumerare
i permessi per renderne gli interruttori, e l'enum è il vocabolario. ADR-0057 lo prevedeva
(«spostarlo nei contracts è parte di D-063, quando servirà»).

- `apps/api/src/identity/permission.ts` conserva `PERMISSION_ROLES`, `roleHasPermission` e le
  costanti di §5.1, e **importa** `Permission` dai contracts — come già fa con `Role`.
- `UserDTO` guadagna `permissions: Permission[]`, l'insieme effettivo. Così `login` e `rehydrate`
  li hanno **senza una chiamata in più**, ed è il solo punto da cui il FE li legge.
- Lo store `session` espone `hasPermission(p)`.

⚠️ Il cambio d'import in `authorization-coverage.spec.ts` è una riga di `import`: le **asserzioni**
restano intatte, che è ciò che il brief §7 chiede («se la slice lo rompe, ha cambiato il
vocabolario invece della risoluzione»).

## 7. Gating del frontend

⚠️ **Tre conteggi diversi, e vanno tenuti distinti** — è la ragione per cui il brief diceva «4»
senza sbagliare e senza descrivere il lavoro:

| scope del conteggio | quanti |
|---|---|
| derivazioni di `isAdmin` da `session.role` | **4** |
| punti in cui il **ruolo decide** qualcosa | **10** |
| file di produzione che **toccano** `isAdmin` | **14** |

I 10 file oltre le 4 derivazioni non leggono la sessione: **ricevono `isAdmin` come prop**
(`CustomerAccessCard`, `CustomerSubscriptionsCard`, `InspectorPanels`, `StructureScene`,
`StructureRow` e i 5 pannelli). Non contengono una decisione, ma **portano un nome che diventerà
falso**: il booleano non dirà più «è un admin» ma «può gestire la struttura». Vanno rinominati,
ed è lavoro meccanico ma reale.

Restano su ruolo **di proposito**: 2 etichette cosmetiche (dicono *chi sei*, non *cosa puoi*) e i
2 rifiuti del superuser in [`stores/session.ts`](../../../apps/web-staff/src/stores/session.ts)
(dicono *questa app non è per te*, D-045).

I 10 punti che decidono:

| File | Punti | Diventa |
|---|---|---|
| [`SidebarNav.vue`](../../../apps/web-staff/src/app/SidebarNav.vue) | 1 | ogni voce di `operativeNav`/`adminNav` porta il proprio permesso e compare solo se detenuto |
| [`router/index.ts`](../../../apps/web-staff/src/router/index.ts) | 3 | `meta.role` → `meta.permission`; la guardia confronta col permesso |
| [`CustomerDetailView.vue`](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue) | 1 | `bookings.administer` / `customers.erase` secondo l'azione |
| [`EstablishmentView.vue`](../../../apps/web-staff/src/features/establishment/EstablishmentView.vue) | 1 | `team.manage` (card Team), `establishment.manage` (rinomina) |
| [`EstablishmentStructureView.vue`](../../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) | 1 | `structure.manage` |
| [`MapView.vue`](../../../apps/web-staff/src/features/map/MapView.vue) | 1 | `structure.manage` |
| [`useEstablishment.ts`](../../../apps/web-staff/src/features/establishment/useEstablishment.ts) | 1 | `enabled` su `team.manage` |
| [`useSetupStatus.ts`](../../../apps/web-staff/src/features/onboarding/useSetupStatus.ts) | 1 | `enabled` su `establishment.manage` |

⚠️ **La sidebar mostra oggi `operativeNav` a ogni ruolo** (8 voci). È la mappa reale di «cosa fa
lo staff», ed è il punto che rende la slice visibile: senza, un operatore a cui è stato tolto il
Listino continua a vederne la voce.

## 8. Verifica

- **`authorization-coverage.spec.ts` verde senza modifiche alle asserzioni** (solo l'import).
- **`permissions.guard.spec.ts`** esteso: stesso `(role, permission)` con override assente,
  `granted:true` e `granted:false` — e il caso «la lettura fallisce ⇒ la richiesta fallisce, non
  degrada in concesso».
- **`authorization-staff.e2e-spec.ts` esteso**: un lido con `pricing.manage` **concesso** e uno
  con lo stesso permesso **revocato**, nella **stessa suite**. La regola dell'audit: se il titolo
  dice «invece di», il fixture deve contenere l'alternativa.
- **Un e2e cross-tenant**: il lido A che revoca `pricing.manage` non tocca il lido B.
- **Un e2e sulla FK composita**: l'`INSERT` di un override con l'`establishmentId` di un altro
  lido è **respinto dal database**, non dal service.
- **`rls-isolation.e2e-spec.ts`**: la tabella nuova entra in `SENZA_RLS` con il suo perché;
  `conRls` resta a **22**.
- **Mutazione come prova, nei due versi, contando *quanti* e *quali* test cadono.** ⚠️ Vale anche
  per i presìdi scritti qui: cancellare la riga che consulta gli override deve far cadere test
  nominati — se resta verde, la configurazione non è mai realmente consultata. ⚠️ Una mutazione
  che non compila non prova nulla: `Tests: 0 total` significa aver testato il compilatore.

## 9. Fuori scope

Ereditato dal brief §8 e confermato: deleghe fra operatori, permessi a tempo, **audit log dei
cambi di permesso**, permessi sul canale cliente.

Aggiunto qui: **la resa dei 403 nelle viste che non consultano `isError`** (AUD-012, 9 viste su
12). È un finding suo, con la sua radice; il router negherà le rotte prima che ci si arrivi, e il
403 resta la protezione vera (principio «la UI che nasconde non è la UI che protegge»).

## 10. Correzioni ai documenti

Due affermazioni del [brief](2026-07-25-permessi-configurabili-design.md) sono risultate false
alla verifica, e vanno corrette **nel testo**, non annotate sotto:

1. §6 attribuisce a **P3-R1** «il gating FE è sparso su ruolo in 4 punti». **L'ID è sbagliato**:
   il finding vero ([P3-web-staff.md](../../audit/findings/P3-web-staff.md)) riguarda le
   astrazioni condivise nate troppo strette, e nessun finding dell'audit parla del gating su
   ruolo — la riga non ha una fonte.
   ⚠️ **Il «4» invece regge**, ed è la parte che una prima lettura di questa spec aveva dato per
   sbagliata: sono esattamente 4 le derivazioni di `isAdmin` da `session.role`. Ciò che manca
   alla riga è lo **scope del conteggio** (§7): il numero è giusto e sottostima il lavoro di
   3,5 volte.
2. §4 principio 5 dice che `/establishment` «non è nel menu dello staff». Il bottone del lido in
   `SidebarNav.vue` è **incondizionato** e ci porta, e la rotta non ha `meta.role`. Il principio
   resta valido; l'esempio no.
