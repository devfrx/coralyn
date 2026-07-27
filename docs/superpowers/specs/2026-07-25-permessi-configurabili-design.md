# D-063 — Permessi dello staff configurabili dall'admin del lido

> **Brief di delega**, non una spec approvata. Descrive il punto di partenza reale (dopo la Fase C
> dell'audit 2026-07-25), i vincoli verificati, le decisioni ancora aperte e come verificare il
> lavoro. Chi prende questa slice scrive prima la spec di design e l'ADR, poi implementa.
>
> Il prerequisito è **[ADR-0057](../../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)**.
> ⚠️ **Aggiornato il 2026-07-27:** questa riga diceva «sul branch `chore/audit-2026-07-25-fase-c` —
> non ancora su `main`». **È su `main` dal 2026-07-26** (commit `4c19d6f`): il prerequisito è
> soddisfatto e non c'è nessun branch da recuperare.

## 1. L'obiettivo, in una riga

L'**admin di un lido** decide cosa il proprio `staff` può fare — modificare il listino, aprire
campagne di rinnovo, gestire il catalogo noleggi, e così via — invece di ereditare una divisione
di ruoli decisa una volta per tutti i lidi.

## 2. Da dove si parte (stato reale dopo la Fase C)

Il vocabolario esiste già e **ogni endpoint lo dichiara**. Non c'è lavoro di annotazione da fare.

| Pezzo | Dove | Cosa fa oggi |
|---|---|---|
| `Permission` (enum, 19 voci) | `apps/api/src/identity/permission.ts` | il vocabolario; i valori stringa (`pricing.manage`, …) sono **stabili** perché finiranno in configurazione |
| `PERMISSION_ROLES` | stesso file | tabella **statica** permesso → ruoli: è il punto che questa slice sostituisce |
| `@RequiresPermission(...)` | `identity/permission.decorator.ts` | metadato su classe o metodo; il metodo vince sulla classe |
| `PermissionsGuard` | `identity/permissions.guard.ts` | **fail-closed**; esenta `@Public()`; legge `req.user.role` |
| `authorization-coverage.spec.ts` | `identity/` | enumera gli handler **dal filesystem** e fallisce se uno non dichiara nulla |
| `authorization-staff.e2e-spec.ts` | `apps/api/test/` | esercita il ruolo `staff` sulle superfici concesse e su quelle negate |

**Il punto di innesto è uno solo**: `roleHasPermission(role, permission)` in `permission.ts`, oggi
una lettura di tabella. Diventa una risoluzione che conosce il tenant (e forse l'utente).

## 3. Le decisioni da prendere

### 3.1 Per-lido o per-operatore?

- **Per lido** — un insieme di permessi vale per tutti gli `staff` di quel lido. Modello minimo:
  una colonna/tabella agganciata a `Establishment`. Una sola schermata, nessuna gestione
  individuale.
- **Per operatore** — ogni `User` ha i propri. Più espressivo (il bagnino nuovo non tocca il
  listino, il responsabile sì) e più vicino a come l'utente ha descritto il bisogno, ma richiede
  la gestione nella scheda del singolo operatore.

Non è una scelta neutra sul dominio: la seconda rende `role` quasi ridondante per lo `staff`, e
va deciso se `admin` resta un ruolo con tutti i permessi impliciti o diventa esso stesso un
insieme di permessi. **Raccomandazione**: partire per-operatore con default ereditato dal ruolo —
è additivo rispetto a `PERMISSION_ROLES`, che resta il **default di fabbrica**.

### 3.2 Nel token o riletti a ogni richiesta?

| | Nel JWT al login | Riletti dal DB per richiesta |
|---|---|---|
| Effetto di una modifica | fino a **8h** di ritardo (durata del token) | immediato |
| Costo | zero query aggiuntive | una query per richiesta (cacheabile per tenant/utente) |
| Precedente nel repo | è esattamente il limite noto di **D-026** (revoca) | nessuno |

Se si sceglie il token, la slice **eredita D-026**: disabilitare un permesso e disabilitare un
operatore diventano lo stesso problema, e vanno risolti insieme o dichiarati insieme.

### 3.3 Dove vive `Permission`

Oggi in `apps/api/`. Il gating del frontend è ancora sul ruolo
(`session.role === Role.Admin` in `MapView.vue`, `CustomerDetailView.vue`, `SidebarNav.vue`, e
`meta.role` nel router). Quando la UI dovrà nascondere ciò che il permesso nega, `Permission` va
spostato in `@coralyn/contracts` e il gating riscritto. **È un cambio di contratto FE/BE**: va nella
spec, non improvvisato.

## 4. Principi da rispettare (non negoziabili)

1. **Fail-closed resta fail-closed.** Qualunque risoluzione: permesso assente o non risolvibile ⇒
   negato. Un errore della lettura non deve mai degradare in «concedi».
2. **`PERMISSION_ROLES` non sparisce**: diventa il default di fabbrica applicato a un lido che non
   ha configurato nulla. Un lido esistente non deve accorgersi della slice.
3. **La guardia si ancora alla risorsa, non all'ambiente** (lezione R4 dell'audit): il permesso si
   valuta sul tenant della richiesta, mai su un flag di contesto.
4. **Niente due meccanismi.** Se serve un concetto nuovo (gruppi, profili), sostituisce il
   precedente — non gli si affianca. È l'errore che ADR-0057 ha appena corretto.
5. **La UI che nasconde non è la UI che protegge.** Oggi `/establishment` è raggiungibile da URL
   pur non essendo nel menu dello staff: la protezione sta nel backend, il menu è cortesia.
6. **`compliance-docs` se si tocca `legal-profile.manage`**: è la superficie che alimenta
   l'informativa del bagnante.

## 5. Gotcha verificati (costano una giornata se scoperti tardi)

- **Le e2e dei controller di dominio fanno login come `admin`.** Nessuno dei file
  `seasons/rates/packages/equipment-types/time-slots/renewal-campaigns/rental-items/rental-tariffs/rentals`
  crea un utente `staff`. Una stretta involontaria dei permessi **non farebbe fallire la suite**:
  l'unico presidio è `authorization-staff.e2e-spec.ts`, che va **esteso** a ogni permesso nuovo.
- **`GET /establishment/overview` è chiamata dall'app-shell a ogni caricamento** (`SidebarNav.vue`
  → `useActiveSeason` → `useEstablishmentOverview`). Renderla admin-only sloggia visivamente lo
  staff dal nome della stagione. ⚠️ Da qui la regola di [ADR-0060](../../architecture/decisions/0060-read-model-shell-senza-pii.md):
  quel payload ha il permesso del consumatore più debole, quindi **non può portare dati personali**
  — presidiato dalle chiavi esatte del DTO e da «nessun `@` nella risposta».
- **`SidebarNav.vue` mostra `operativeNav` a ogni ruolo**: Mappa, Prenotazioni, Noleggi, Rinnovi,
  Clienti, Listino, Listino noleggi, Report. È la mappa reale di «cosa fa lo staff oggi», e va
  aggiornata insieme ai permessi o le due letture divergono.
- **Il superuser non ha permessi tenant** (ADR-0039/0057): non aggiungerlo «per comodità» alla
  tabella, o si apre una scorciatoia cross-tenant che l'RLS non copre.
- **`@Public()` salta il `PermissionsGuard`**: il canale cliente non è governato dai permessi
  staff. Non provare a modellarlo qui.
- **Il test di copertura è alimentato dal filesystem**: un controller nuovo entra da solo, ma un
  permesso **mai usato** fa fallire la suite (regola «nessun permesso morto»). Se si aggiunge una
  voce all'enum in anticipo sull'endpoint, il test lo dice.
- **`PasswordHasher` è ri-provveduto da 4 moduli** — se la risoluzione dei permessi diventa un
  servizio iniettato, non ripetere lo stesso schema: vedi il `crypto.module.ts` `@Global` in Fase F.

## 6. Findings correlati ancora aperti

| ID | Cosa | Perché tocca questa slice |
|---|---|---|
| ~~**D-064**~~ ✅ **chiusa 2026-07-26** | `GET /establishment/overview` **restituiva** `team[]` (email di tutti gli operatori) a chi ha `establishment.read`, cioè anche allo staff | era il caso PII che ha motivato AUD-004. Chiusa da [ADR-0060](../../architecture/decisions/0060-read-model-shell-senza-pii.md): il team è `GET /establishment/users` sotto `team.manage`. **Resta rilevante per questa slice** in senso opposto — è il precedente da seguire: un permesso più fine si ottiene separando il payload, non moltiplicando i decoratori sullo stesso |
| **D-026** | nessuna revoca di un token già emesso (8h) | se i permessi viaggiano nel token, è lo stesso problema |
| **AUD-026** | il fake `forTenant: (_t, cb) => cb(tx)` scarta il `tenantId`: nessun unit test può accorgersi di un tenant sbagliato | una risoluzione per-tenant va testata con un fake che **asserisce** il tenant |
| **AUD-012** | 9 viste su 12 non consultano mai `isError` | un 403 nuovo si presenterebbe come schermata vuota, non come «non autorizzato» |
| **P3-R1** | il gating FE è sparso su ruolo in 4 punti | vanno unificati prima di aggiungerci i permessi, o diventano 8 |

## 7. Come si verifica

- `authorization-coverage.spec.ts` deve restare verde **senza modifiche**: se la slice lo rompe,
  ha cambiato il vocabolario invece della risoluzione.
- `authorization-staff.e2e-spec.ts` esteso: un lido con permesso concesso e uno con lo stesso
  permesso revocato, **nella stessa suite**, per provare che la configurazione discrimina davvero
  (la regola dell'audit: se il titolo dice «invece di», il fixture deve contenere l'alternativa).
- Un e2e **cross-tenant**: il lido A che revoca `pricing.manage` non deve toccare il lido B.
- Mutazione come prova: cancellare la riga che legge la configurazione deve far fallire la suite.
  Se resta verde, la configurazione non è mai realmente consultata.

## 8. Fuori scope

Deleghe fra operatori, permessi a tempo, audit log dei cambi di permesso, permessi sul canale
cliente. Ognuno è una slice a sé; nominarli qui serve solo a non farli entrare per inerzia.
