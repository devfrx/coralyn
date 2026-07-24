# ADR-0055: Informativa Art. 13 al bagnante e ruoli titolare/responsabile multi-tenant

- **Status:** Accepted
- **Data:** 2026-07-24
- **ADR correlati:** [0009](0009-metodo-decisionale.md), [0026](0026-identita-rls-utente.md), [0028](0028-provisioning-tenant.md), [0043](0043-erasure-e-retention-cliente-gdpr.md)
- **Spec:** [2026-07-24-privacy-informativa-art13-5-6a-design.md](../../superpowers/specs/2026-07-24-privacy-informativa-art13-5-6a-design.md)
- **Deferred:** [D-024](../deferred.md)

> ⚠️ Design conforme allo stato dell'arte redatto da ingegneri — non è consulenza legale. Per la
> produzione, far validare da un DPO/legale.

## Context

Coralyn è un **SaaS B2B multi-tenant**: ogni lido è un tenant, il bagnante è il cliente del lido.
Il core dell'erasure/retention del `Customer` è già chiuso ([ADR-0043](0043-erasure-e-retention-cliente-gdpr.md)),
ma mancava lo strumento a monte, l'**informativa Art. 13** dovuta al bagnante al momento della
raccolta dei suoi dati (nome/contatti al banco). ADR-0043 aveva deliberatamente lasciato questo
residuo fuori scope, tracciato in [D-024](../deferred.md).

Il punto che cambia tutto è il **fork dei ruoli GDPR**: verso il bagnante, il **titolare del
trattamento è il lido**, non Coralyn — è il lido che raccoglie i dati al banco per gestire
prenotazioni/abbonamenti/noleggi. Coralyn è il **responsabile** ex Art. 28, in quanto fornitore
software. Confondere i due piani (far comparire "Coralyn" come titolare nell'informativa al
bagnante) sarebbe l'errore più comune nelle policy dei SaaS multi-tenant, e giuridicamente
scorretto. Simmetricamente, verso l'**operatore** (utente di `web-staff`/`web-platform`) il
titolare è **Coralyn** stessa: un piano distinto, con contenuto e superficie diverse. E verso il
rapporto **Coralyn↔lido**, serve un DPA (Art. 28) che formalizzi la qualificazione.

Tre piani, quindi, non uno:

| Piano | Titolare | Responsabile | Documento | App | Slice |
|---|---|---|---|---|---|
| **A. Lido → bagnante** | il **lido** (per-tenant) | Coralyn | Informativa Art. 13 al bagnante | web-customer | **questo ADR (5.6a)** |
| B. Coralyn → operatore | **Coralyn** | — | Privacy policy operatori + cookie/imprint | web-staff / web-platform | 5.6b (deferred) |
| C. Coralyn ↔ lido | il lido | Coralyn | DPA (Art. 28) + registro (Art. 30) | contratto / `docs/legal/` | 5.6c (deferred) |

Realtà attuale (decisione utente 2026-07-24): il software è multi-tenant *by design*, nessun lido
reale è ancora in produzione, ma si vuole arrivare pronti con la soluzione professionale, senza
debito silenzioso. L'informativa al bagnante deve quindi essere **parametrizzata per-lido dal
titolare reale**, non un testo generico con Coralyn spacciata per titolare.

## Decision

**1. Titolare = lido, responsabile = Coralyn, nessuna ambiguità nel codice.** L'informativa Art. 13
mostrata al bagnante interpola i dati societari del **lido** (titolare), mai quelli di Coralyn.
Coralyn compare solo nella sezione "destinatari/responsabile" del testo.

**2. Informativa parametrizzata per-tenant via `EstablishmentLegalProfile` (1:1, RLS).** Nuova
entità dedicata, 1:1 con `Establishment`, con RLS `ENABLE`+`FORCE` e policy `tenant_isolation` come
le altre child tenant-scoped. Tutti i campi sono **nullable**: finché un lido non compila i propri
dati societari, il blocco titolare mostra `[COMPILARE]` nel render, ma il **meccanismo è reale e
corretto** fin da subito — all'onboarding di un lido reale la sua informativa è completa senza
retrofit. Nessuna colonna aggiunta a `Establishment` (che oggi ha solo `name`): la concern legale
resta in un'entità propria, estendibile in 5.6b/5.6c senza gonfiare la radice del tenant.

**3. Base giuridica = contratto/obbligo legale, non consenso. Nessuna checkbox "acconsento".** Art.
13 è un obbligo di **informare**, non di raccogliere consenso. Per i dati gestiti qui (nome/contatti
per prenotazioni/abbonamenti/noleggi) la base è tipicamente l'esecuzione del contratto (Art.
6(1)(b)) e, per la conservazione contabile, l'obbligo legale (Art. 6(1)(c) + Art. 2220 Cod. Civ.).
Introdurre un flag di consenso implicherebbe che la base sia il consenso, giuridicamente scorretto
qui (un consenso "necessario per il servizio" non è libero) e fonte di responsabilità. Il touchpoint
di raccolta in `web-staff` (form cliente) mostra quindi solo un **promemoria + link
all'anteprima**, **senza** persistere alcun flag "informato": salvarlo implicherebbe consenso.

**4. Testo dell'informativa come codice versionato, titolare come dato.** Il testo fisso
(sezioni tecniche, diritti, misure di sicurezza, cookie) vive come **costante versionata in git** in
`web-customer` (`INFORMATIVA_VERSION` + data), non nel DB: la policy è codice, il DB porta solo i
dati per-lido del titolare. Coerente con [ADR-0009](0009-metodo-decisionale.md) (design docs vivono
col codice, non a parte).

**5. Lettura del titolare: endpoint pubblico dentro RLS (id dall'URL) + endpoint customer via JWT.**
Un solo metodo di service condiviso `LegalProfileService.getTitolare(establishmentId)` (dentro
`forTenant`, RLS mantenuta), esposto da due controller:
- `GET /public/informativa/:establishmentId` — **pubblico** (nuovo modulo `informativa`, fuori dal
  `CustomerJwtGuard`). L'id arriva dall'URL (deep-link operatore, §6), l'endpoint imposta comunque
  il contesto tenant e legge **dentro** RLS `FORCE`: nessuna deroga, nessuna query cross-tenant.
  L'UUID non è praticamente enumerabile e il DTO non espone PII di interessati (sono dati societari
  del titolare, pubblici per natura) — rischio accettato.
- `GET /customer/me/informativa` — **autenticato** (`CustomerJwtGuard`, [ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md)),
  tenant dal claim JWT (`customer.establishmentId`), non da un parametro client-controllato.
  Necessario perché `CustomerMeDTO` non espone `establishmentId` al FE.

Nessun terzo endpoint di risoluzione `?token=`: il primo contatto (prima dell'attivazione) mostra
solo le sezioni fisse con un blocco titolare generico, perché il momento di raccolta effettivo è
lato operatore (punto 6), non il primo contatto anonimo.

**6. Anteprima operatore via deep-link, nessuna duplicazione del testo legale.** In `web-staff`, il
promemoria nel form cliente apre in una nuova scheda `${VITE_WEB_CUSTOMER_URL}/privacy?e=<establishmentId>`,
cioè la **stessa** pagina `/privacy` pubblicata da `web-customer` per quel lido, letta via l'endpoint
pubblico del punto 5. Il testo legale vive in un solo posto; l'operatore vede esattamente ciò che
vedrà il cliente. `establishmentId` è già disponibile nella `UserDTO` di sessione staff, nessuna
query aggiuntiva per costruire il link.

**7. Dati societari mancanti = `[COMPILARE]` esplicito, non un fallback silenzioso.** Un lido che non
ha ancora compilato il proprio `EstablishmentLegalProfile` produce un'informativa con blocchi
`[COMPILARE]` visibili, non un testo generico che finge completezza. È un placeholder di contenuto
**voluto**, non debito di piano.

**8. Disclaimer di validazione legale/DPO.** Sia il testo dell'informativa (in `web-customer`) sia
questo ADR portano un disclaimer esplicito: il design è tecnicamente corretto ma i punti marcati
`⚖️` (legittimo interesse sulle note operative, necessità del DPO/DPIA, trasferimenti extra-UE,
qualificazione titolare/responsabile da formalizzare nel DPA di 5.6c) richiedono validazione da un
professionista prima della pubblicazione a un lido reale.

## Alternatives considered

- **Consenso versionato (checkbox "acconsento" + storico versioni firmate)** — scartata: la base
  giuridica qui non è il consenso ma il contratto/obbligo legale (punto 3); introdurre una checkbox
  implicherebbe erroneamente che lo sia, e un consenso "necessario per erogare il servizio" non è
  libero ex Art. 4(11)/Recital 42 GDPR. Avrebbe anche richiesto uno storico versioni e una UI di
  revoca senza alcun effetto reale (il trattamento continuerebbe comunque, essendo contrattuale).
- **Colonne dei dati del titolare direttamente su `Establishment`** — scartata: `Establishment`
  oggi è focalizzato sull'identità operativa del tenant (`name`, `config`); i dati societari sono una
  concern legale a sé, con un proprio ciclo di vita (`updatedAt` naturale) ed estendibile in 5.6b/5.6c
  senza gonfiare la tabella radice del tenant, coerente con come le altre concern satellite (RBAC,
  auth cliente) vivono in entità dedicate.
- **Package legale condiviso (`@coralyn/legal`) per il testo dell'informativa** — rimandata a 5.6b:
  con un solo consumatore reale (`web-customer`) l'estrazione a package è prematura; quando gli
  operatori avranno la *loro* informativa (Coralyn titolare, 5.6b) e il testo condiviso avrà senso
  tra due app, si rivaluta l'estrazione. Il deep-link (punto 6) risolve già la duplicazione tra
  operatore e bagnante senza bisogno del package.
- **Endpoint pubblico di risoluzione token (`GET /public/informativa/by-token?token=...`)** —
  scartata: avrebbe introdotto un endpoint pubblico aggiuntivo per un caso, il primo contatto
  anonimo, che non è il momento di raccolta reale (quello è lato operatore, punto 6, o post-attivazione
  via JWT). Le sezioni fisse col titolare generico bastano al primo contatto.

## Consequences

### Positive

- **Nessuna ambiguità titolare/responsabile nel codice o nel testo**: il piano A tratta solo
  lido↔bagnante; i piani B (Coralyn↔operatore) e C (Coralyn↔lido) restano esplicitamente deferiti
  e tracciati, non silenziosi ([D-024](../deferred.md), voci 5.6b/5.6c).
- **Il meccanismo è reale fin dal primo lido**: nessun testo placeholder generico da retrofittare;
  `[COMPILARE]` è un segnale onesto di dati mancanti, non un debito di piano.
- **Un solo posto per il testo legale**: il deep-link operatore evita la duplicazione tra
  `web-staff` e `web-customer`, senza la complessità prematura di un package condiviso.
- **RLS mantenuta anche sull'endpoint pubblico**: nessuna via di lettura cross-tenant, nonostante
  l'id arrivi dall'URL.
- **Nessuna cattura di consenso impropria**: coerente con la base giuridica reale (contratto/obbligo
  legale), evita di introdurre un artefatto giuridicamente scorretto e potenzialmente dannoso in
  caso di contenzioso.

### Negative / Trade-off

- **I piani B e C restano scoperti**: un lido reale in produzione oggi avrebbe l'informativa al
  bagnante ma non la privacy policy interna né il DPA formale. Accettato e tracciato
  ([D-024](../deferred.md) 5.6b/5.6c), non un gap silenzioso.
- **`[COMPILARE]` è visibile finché un admin non compila il profilo legale**: un lido che dimentica
  di compilarlo pubblica un'informativa incompleta. Mitigato dalla nota esplicativa nel form
  ("Questi dati compaiono nell'informativa privacy mostrata ai tuoi clienti"), non da un blocco
  hard (bloccare l'operatività del lido per un campo legale mancante sarebbe sproporzionato).
- **Il contenuto reale dell'informativa (finalità, basi giuridiche per finalità, trasferimenti
  extra-UE, necessità del DPO) porta più punti `⚖️` da validare con un legale**: il design è
  tecnicamente corretto ma non è pronto alla pubblicazione senza quella validazione — esplicitato nel
  testo stesso e in questo ADR.
- **Nessuna deroga RLS ma un endpoint autenticamente pubblico**: `GET /public/informativa/:id`
  espone, senza autenticazione, i dati societari di qualunque tenant di cui si conosca l'UUID.
  Accettato perché sono dati societari pubblici per natura (non PII di interessati) e l'UUID non è
  enumerabile, ma resta una superficie pubblica in più da tenere a mente in eventuali audit.

## Rubric check

1. **Professionalità** — separare esplicitamente i tre piani titolare/responsabile (bagnante,
   operatore, Coralyn↔lido) invece di scrivere un'unica policy generica è il pattern corretto per un
   SaaS B2B multi-tenant; non è over-engineering (il modello 1:1 è minimale) né sotto-tutela (RLS,
   base giuridica corretta, nessun consenso improprio).
2. **Convenzioni** — riusa `forTenant`/RLS `FORCE` già stabilito ([ADR-0010](0010-isolamento-multi-tenant.md)),
   `@Roles(Role.Admin)` per il form titolare ([ADR-0039](0039-rbac-role-guard.md)), `CustomerJwtGuard`
   per l'endpoint customer ([ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md)), e il
   pattern "testo versionato in git" già in uso per le altre copy applicative.
3. **Modularità** — un'entità dedicata (`EstablishmentLegalProfile`) additiva, un solo service
   condiviso (`getTitolare`) consumato da due controller sottili, nessun cambiamento a `Establishment`
   né a `Customer`; il confine BE/contracts è nello stesso commit.
4. **Zero debito** — il piano A è **realizzato**, non un placeholder: entità RLS reale, tre
   endpoint funzionanti, form admin, touchpoint di raccolta, pagina pubblica parametrizzata, deep-link
   operatore. I residui (piani B e C, i punti `⚖️` di validazione legale) sono esplicitamente
   tracciati in [deferred.md](../deferred.md) (5.6b/5.6c) e nel testo dell'informativa stesso, non
   silenziosi.
