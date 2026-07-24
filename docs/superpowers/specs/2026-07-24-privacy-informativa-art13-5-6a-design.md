# Design — 5.6a: Informativa privacy Art. 13 al bagnante (multi-tenant)

> **Data:** 2026-07-24 · **Slice:** 5.6a (prima delle tre in cui è decomposto il lavoro 5.6)
> **Deferred sbloccato:** [D-024](../../architecture/deferred.md) — residuo "consenso/informativa Art. 13
> alla raccolta" (il core erasure è già chiuso, [ADR-0043](../../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)).
>
> ⚖️ **Questo documento è una bozza di lavoro tecnica, non un parere legale.** I punti marcati
> `⚖️ [DA VALIDARE CON LEGALE]` dipendono da una valutazione giuridica qualificata e vanno validati
> da un DPO/legale prima della pubblicazione. Riepilogo in §12.

## 1. Contesto e inquadramento dei ruoli (il fork che cambia tutto)

Coralyn è un **SaaS B2B multi-tenant**. Verso il **bagnante** (il cliente del lido, l'interessato del
trattamento), i ruoli GDPR sono:

| Piano | Titolare | Responsabile (processor) | Documento | App | Slice |
|---|---|---|---|---|---|
| **A. Lido → bagnante** | il **lido** (ogni tenant, diverso) | Coralyn (fornitore SW) | Informativa Art. 13 al bagnante | web-customer | **5.6a (questa)** |
| B. Coralyn → operatore | **Coralyn** | — | Privacy policy operatori + cookie/imprint | web-staff / web-platform | 5.6b (deferred) |
| C. Coralyn ↔ lido | il lido | Coralyn | DPA (Art. 28) + registro (Art. 30) | contratto / `docs/legal/` | 5.6c (deferred) |

Il titolare del trattamento verso il bagnante è **il lido**, non Coralyn: è il lido che raccoglie
nome/contatti al banco. Coralyn è il **responsabile** ex Art. 28. Confondere i due piani è l'errore più
comune nelle policy dei SaaS; questa slice tratta **solo il piano A**.

**Realtà attuale** (decisione utente 2026-07-24): il software è multi-tenant *by design*, nessun lido
reale è ancora in produzione, ma si vuole arrivare pronti con la soluzione professionale, senza debito.
Quindi l'informativa si **parametrizza per-lido** dal titolare reale — non un testo generico. Finché un
lido non compila i suoi dati societari, il blocco titolare mostra `[COMPILARE]`, ma il **meccanismo è
reale e corretto**: all'onboarding di un lido reale la sua informativa è completa senza retrofit.

**Punti di raccolta PII del bagnante** (dove l'informativa deve essere accessibile): creazione/modifica
cliente in web-staff ([CustomersView.vue](../../../apps/web-staff/src/features/customers/CustomersView.vue),
[EditCustomerModal.vue](../../../apps/web-staff/src/features/customers/EditCustomerModal.vue)). Il bagnante
tocca il sistema per la prima volta all'attivazione del canale cliente
([ActivationView.vue](../../../apps/web-customer/src/features/subscriptions/ActivationView.vue)).

## 2. Scope

**In scope (5.6a):**
- Modello dati per-lido dei dati del titolare (`EstablishmentLegalProfile`, 1:1).
- Form admin in web-staff per compilarli.
- Rotta pubblica `/privacy` in web-customer che rende l'informativa parametrizzata sul lido.
- Contenuto reale dell'informativa Art. 13 (sezioni tecniche/diritti dal codice; titolare per-lido;
  `[COMPILARE]` e `⚖️` dove serve).
- Promemoria + link all'informativa nel punto di raccolta (web-staff), **senza** cattura consenso.

**Fuori scope (tracciato in deferred.md come 5.6b / 5.6c):**
- Privacy policy degli **operatori** (Coralyn titolare) e cookie/imprint di web-staff/web-platform → 5.6b.
- **DPA** Coralyn↔lido (Art. 28) e **registro dei trattamenti** (Art. 30) → 5.6c.
- Qualsiasi **cattura di consenso**: la base giuridica dei trattamenti di questa slice è il **contratto**
  / l'**obbligo legale**, non il consenso (§5). Nessuna checkbox "acconsento".
- Cookie banner / CMP: non serve (§7 — solo strumenti tecnicamente necessari).

## 3. Base giuridica: perché informativa e non consenso

Art. 13 è un **obbligo di informare**, non di raccogliere consenso. Per i dati del bagnante gestiti qui
(nome/contatti per gestire prenotazioni/abbonamenti/noleggi) la base è tipicamente l'**esecuzione del
contratto** (Art. 6(1)(b)) e, per la conservazione contabile, l'**obbligo legale** (Art. 6(1)(c) +
Art. 2220 Cod. Civ., 10 anni). Introdurre una checkbox di consenso implicherebbe che la base sia il
consenso — di norma giuridicamente scorretto qui e fonte di responsabilità (un consenso "necessario per
il servizio" non è libero). Quindi: **si informa, non si chiede consenso.**

## 4. Modello dati — `EstablishmentLegalProfile` (1:1, RLS ENABLE+FORCE)

Entità dedicata 1:1 con `Establishment` (scelta 2026-07-24: raggruppa la concern legale, tiene
`Establishment` focalizzato sull'identità operativa, ha `updatedAt` naturale, estendibile in 5.6b/c senza
gonfiare la radice del tenant). `Establishment` oggi ha **solo** `name`: nessun dato societario esiste.

Campi (tutti **nullable** finché il lido non compila → fallback `[COMPILARE]` nel render):

| Campo | Tipo | Note |
|---|---|---|
| `establishmentId` | uuid, `@unique` FK | 1:1; `onDelete: Cascade` (il profilo legale non sopravvive al lido) |
| `legalName` | String? | Denominazione / ragione sociale del titolare |
| `registeredAddress` | String? | Sede legale (indirizzo completo) |
| `vatOrTaxId` | String? | P.IVA / Codice Fiscale |
| `contactEmail` | String? | Email di contatto del titolare |
| `pec` | String? | PEC |
| `legalRepresentative` | String? | Nome del legale rappresentante |
| `dataRightsContact` | String? | Email per l'esercizio dei diritti (può coincidere con `contactEmail`) |
| `dpoNominated` | Boolean `@default(false)` | DPO nominato? |
| `dpoContact` | String? | Contatti DPO (se nominato) — `⚖️` la necessità del DPO è giudizio legale |
| `updatedAt` | DateTime `@updatedAt` | Ultima modifica dei dati del titolare |

- **RLS**: `ENABLE ROW LEVEL SECURITY` + `FORCE` + policy `tenant_isolation` su `establishmentId`, coerente
  con le altre child tenant-scoped (`BookingCoverage`, `AbsenceRelease`, ecc.).
- **Migration** `add_establishment_legal_profile`, **additiva**, generata con `--create-only` e **letta**
  prima di applicare (gotcha noto: indici parziali/`NULLS NOT DISTINCT` invisibili al DSL — qui non
  applicabile, ma la disciplina resta). Dopo `migrate dev` su `coralyn_dev`, **`migrate deploy` anche su
  `coralyn_test`** o le e2e falliscono in modo fuorviante.
- Nessun campo è PII di una persona fisica *interessata*: sono dati societari del titolare (l'eventuale
  nome del legale rappresentante/DPO è dato di contatto professionale). Rilevante per §6 (endpoint
  pubblico).

## 5. API

Tutti sotto `apps/api`, contratti in `packages/contracts`.

**Staff (tenant-scoped, `forTenant`, admin-only `@Roles(Role.Admin)`):**
- `GET /establishment/legal-profile` → `EstablishmentLegalProfileDTO` (il profilo del proprio lido, o un
  DTO a campi vuoti se non ancora creato).
- `PUT /establishment/legal-profile` (upsert) → valida i campi (email/PEC ben formate se presenti; tutti
  opzionali), crea o aggiorna il profilo del tenant corrente.

**Lettura del titolare per il render dell'informativa** — un solo `PublicTitolareDTO` (solo campi del
titolare + `establishmentName` + `dpoNominated`/`dpoContact`; **nessuna PII di interessati**, sono dati
societari pubblici per natura), campi mancanti come `null` (il FE mostra `[COMPILARE]`). Un solo metodo di
service condiviso `getTitolare(establishmentId)` (dentro `forTenant`, RLS mantenuta), esposto da **due**
controller:
- `GET /public/informativa/:establishmentId` → pubblico (nuovo modulo `informativa`, **fuori dal
  `CustomerJwtGuard`**). Usato dal **deep-link operatore** (`?e=<id>`, web-staff *ha* `establishmentId`
  nella sua `UserDTO`). **RLS mantenuta**: l'id è noto dall'URL → l'endpoint imposta il contesto tenant
  (`forTenant(establishmentId)`) e legge dentro RLS FORCE — nessuna deroga. UUID non praticamente
  enumerabile, nessun dato sensibile esposto → accettato.
- `GET /customer/me/informativa` → **autenticato** (`CustomerJwtGuard`), tenant dal JWT
  (`customer.establishmentId`, ADR-0026). Usato dal **bagnante autenticato** — necessario perché
  `CustomerMeDTO` **non** espone `establishmentId` al FE (solo `establishmentName`). Passa
  `customer.establishmentId` allo stesso `getTitolare`.

## 6. web-staff — form titolare + touchpoint di raccolta + anteprima

**Form "Dati per l'informativa privacy"** (admin-only) in
[EstablishmentView.vue](../../../apps/web-staff/src/features/establishment/EstablishmentView.vue): un
pannello che compila `EstablishmentLegalProfile` via `PUT`, con nota esplicativa: *"Questi dati compaiono
nell'informativa privacy mostrata ai tuoi clienti."* Hook TanStack Query (`useLegalProfile` +
mutation). Riusa `Field`/`Input`/`Select` esistenti; niente nuovi primitivi ui-kit.

**Touchpoint di raccolta (Art. 13 "al momento della raccolta")** — decisione 2026-07-24: **link/promemoria,
niente flag**. Nel form di creazione/modifica cliente
([CustomersView.vue](../../../apps/web-staff/src/features/customers/CustomersView.vue) /
[EditCustomerModal.vue](../../../apps/web-staff/src/features/customers/EditCustomerModal.vue)) una riga:
*"Informa il cliente e forniscigli l'informativa privacy"* + link "Apri anteprima". **Nessun consenso/flag
memorizzato**: la base è il contratto e salvare "informato" implicherebbe consenso (`⚖️`; l'eventuale log
di accountability Art. 5(2) è una scelta legale, tracciata come possibile follow-up, non fatta ora).

**Anteprima operatore** — decisione 2026-07-24: **deep-link (Opzione 1)**. Un pulsante apre in nuova scheda
la pagina `/privacy` **pubblicata da web-customer** per quel lido: `${WEB_CUSTOMER_BASE_URL}/privacy?e=<establishmentId>`,
con `WEB_CUSTOMER_BASE_URL` da variabile d'ambiente Vite (`import.meta.env.VITE_WEB_CUSTOMER_URL`). **Il
testo legale vive in un solo posto** (web-customer); l'operatore vede esattamente ciò che vedrà il cliente.
Nessun package condiviso ora (l'estrazione a `@coralyn/legal` è prematura con un solo consumatore reale →
valutata in 5.6b, quando gli operatori avranno la *loro* informativa).

## 7. web-customer — informativa accessibile all'interessato

**Rotta pubblica `/privacy`** (`meta.public: true`), `PrivacyView.vue`. Risoluzione del contesto lido, in
ordine di priorità:
- **`?e=<establishmentId>`** presente → `GET /public/informativa/:id` (deep-link operatore da web-staff).
- altrimenti **autenticato** → `GET /customer/me/informativa` (tenant dal JWT; il FE non ha l'id).
- altrimenti (primo contatto, nessun contesto) → **solo sezioni fisse** con blocco titolare generico
  ("lo stabilimento presso cui ti sei registrato") — l'informativa parametrizzata compare post-attivazione
  e, al momento della raccolta, lato operatore via deep-link. Nessuna risoluzione `?token=` (evita un
  endpoint pubblico di risoluzione token; il primo contatto non è il momento di raccolta, che è
  operator-side).

**Contenuto** (§8): sezioni fisse renderizzate sempre; il **blocco titolare** interpolato dai dati del
titolare, con `[COMPILARE]` sui campi `null`.

**Link all'informativa** (niente footer globale in `CustomerShell`: le viste usano `min-h-dvh` centrato →
un footer globale finirebbe sotto la piega; placement per-vista):
- In `ActivationView` (primo contatto), sotto il form: "Informativa privacy" → `/privacy`.
- In `MySubscriptionsView` (post-auth), footer di sezione: "Informativa privacy" → `/privacy`
  (risolve via endpoint autenticato).

**Cookie/tracker**: verificato 2026-07-24 — **nessun SDK analytics/tracking** nelle tre app, nessuno script
esterno negli `index.html`, **nessun cookie**; solo `localStorage` per i token di sessione = **strumento
tecnicamente necessario**, esente da consenso (ePrivacy, strictly-necessary). → **nessun banner/CMP**, solo
una sezione "Cookie e strumenti tecnici" nell'informativa che lo dichiara. `⚖️` l'esenzione va confermata
in sede di validazione, ma il presupposto di fatto (nessuna profilazione) è verificato nel codice.

## 8. Contenuto dell'informativa Art. 13 — reale, non fuffa

Il testo fisso vive come **contenuto versionato in git** in web-customer (una costante
`INFORMATIVA_VERSION` + data in testa, come le altre copy dell'app — **non** nel DB: la policy è codice,
il DB porta solo il titolare per-lido). Sezioni e provenienza:

| Sezione | Fonte | Stato |
|---|---|---|
| **Titolare del trattamento** | `EstablishmentLegalProfile` del lido | per-lido, `[COMPILARE]` se vuoto |
| **DPO** | `dpoNominated`/`dpoContact` | per-lido; `⚖️` la necessità |
| **Categorie di dati** | modello `Customer` (nome, cognome, telefono?, email?, note?) + dati di prenotazione/abbonamento/noleggio + PIN/token del canale cliente | reale dal codice |
| **Finalità + base giuridica _per finalità_** | gestione contrattuale → Art. 6(1)(b); note operative → legittimo interesse Art. 6(1)(f) `⚖️`; conservazione contabile → Art. 6(1)(c) + Art. 2220 c.c.; canale assenze comunicate → esecuzione contratto | reale; `⚖️` sulla base delle note |
| **Destinatari / responsabile** | Coralyn (fornitore SaaS) ex Art. 28; hosting/sub-responsabili | Coralyn reale; hosting `[COMPILARE]` |
| **Misure di sicurezza (Art. 32)** | dal codice: RLS multi-tenant, hashing argon2, JWT, token opachi solo-hash del canale cliente, isolamento per-tenant, erasure/anonimizzazione irreversibile (ADR-0043) | reale dal codice |
| **Diritti dell'interessato (Art. 15-22)** | accesso, rettifica, **cancellazione — già implementata (ADR-0043)**, limitazione, portabilità, opposizione; **revoca consenso** N/A (base ≠ consenso); reclamo al **Garante per la protezione dei dati personali** | reale |
| **Conservazione** | 10 anni per i dati contabili (Art. 2220 c.c.); anonimizzazione irreversibile all'erasure (ADR-0043) | reale |
| **Trasferimenti extra-UE** | dipende dall'hosting reale | `[COMPILARE]` + `⚖️` |
| **Processi decisionali automatizzati / profilazione** | nessuna (verificato: nessun analytics/tracking) | reale |
| **Cookie e strumenti tecnici** | solo `localStorage` tecnico, nessun cookie di profilazione | reale |
| **Conferimento obbligatorio?** | i dati di contatto sono necessari alla gestione del rapporto; il rifiuto impedisce l'erogazione del servizio | reale |

Requisiti di forma (Art. 12): linguaggio chiaro e piano, niente legalese decorativo, accessibile e
gratuito. Header con **versione + data ultimo aggiornamento**. Blocco finale con la raccomandazione di
revisione legale e il riepilogo dei `⚖️`.

## 9. Testing

- **api**: unit sul service legal-profile (upsert, tenant-scope, validazione email/PEC); e2e su
  `GET`/`PUT /establishment/legal-profile` (admin-only → 403 per staff; isolamento tenant) e su
  `GET /public/informativa/:id` (pubblico; campi mancanti → null; nessuna PII). e2e sequenziali
  (`maxWorkers: 1`), "oggi" congelato 2026-07-15 (irrilevante qui, nessuna logica temporale).
- **web-staff**: spec del form legal-profile (compila/salva, admin-gate, nota); spec del touchpoint nel
  form cliente (link presente, apre l'URL atteso con l'`establishmentId`); nessun flag persistito.
- **web-customer**: spec di `PrivacyView` (rende le sezioni fisse; interpola il titolare; `[COMPILARE]`
  sui campi null; risoluzione `?e=` / `?token=` / sessione); link nello shell e in `ActivationView`.
- Suite di pacchetti diversi **una alla volta** (gotcha noto).

## 10. Migration e ambiente

- Una sola migration additiva (`--create-only`, letta). `migrate deploy` su `coralyn_test`.
- Nuova env `VITE_WEB_CUSTOMER_URL` in web-staff (documentata in `.env.example` se presente).
- Ricorda il quirk host: dopo un reinstall di node_modules rigira `prisma generate` prima del typecheck api.

## 11. Deferred da aggiornare + ADR

- **deferred.md**: aggiornare **D-024** (il residuo Art. 13 diventa "in corso / fatto per il piano A");
  aggiungere **5.6b** (privacy operatori + cookie/imprint, Coralyn titolare) e **5.6c** (DPA Art. 28 +
  registro Art. 30) come nuove voci, non silenziose.
- **ADR**: un nuovo ADR "Informativa Art. 13 al bagnante e ruoli titolare/responsabile multi-tenant"
  (numero progressivo), che ratifica: titolare = lido, responsabile = Coralyn; informativa parametrizzata
  per-tenant; base = contratto/obbligo legale (no consenso); testo come codice, titolare come dato;
  disclaimer di validazione legale. Aggiornare i design docs (ADR-0009): `data-model.md` (ER +
  `EstablishmentLegalProfile`), `flows.md` (dove il bagnante accede all'informativa), eventuale mockup
  HTML della pagina `/privacy`.

## 12. ⚖️ Riepilogo dei punti da validare con un legale/DPO

1. **Base giuridica per finalità**, in particolare il **legittimo interesse** sulle *note* operative
   (specificare l'interesse) e la qualificazione delle altre finalità.
2. **Necessità di un DPO** e di una **DPIA** per il trattamento.
3. **Trasferimenti extra-UE**: dipendono dall'hosting reale (`[COMPILARE]`) e dalle relative garanzie
   (adeguatezza/SCC).
4. **Qualificazione titolare/responsabile** (lido titolare, Coralyn responsabile) — da confermare e da
   formalizzare nel **DPA** (5.6c).
5. **Esenzione da consenso** per `localStorage` tecnico (strictly-necessary ePrivacy).
6. Testi delle **finalità/conservazione/diritti**: struttura e riferimenti normativi verificati, ma la
   redazione finale va rivista da un professionista.

**Questo documento è pronto alla revisione legale, non alla pubblicazione.** La normativa nazionale
(recepimento ePrivacy, linee guida del Garante, obblighi accessori) va **riverificata alla data di
pubblicazione**: qui la data di lancio è l'Italia (mercato iniziale, fuso `Europe/Rome`, ADR-0031).

## 13. Anchor

- Erasure/retention già chiuso: [ADR-0043](../../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md).
- Modello dati: [schema.prisma](../../../apps/api/prisma/schema.prisma) (`Establishment`, `Customer`).
- Raccolta PII: [CustomersView.vue](../../../apps/web-staff/src/features/customers/CustomersView.vue),
  [EditCustomerModal.vue](../../../apps/web-staff/src/features/customers/EditCustomerModal.vue).
- Impostazioni lido: [EstablishmentView.vue](../../../apps/web-staff/src/features/establishment/EstablishmentView.vue).
- Canale cliente / risoluzione token→lido:
  [customer-token.service.ts](../../../apps/api/src/customer-auth/customer-token.service.ts),
  [customer-auth.controller.ts](../../../apps/api/src/customer-auth/customer-auth.controller.ts),
  [ActivationView.vue](../../../apps/web-customer/src/features/subscriptions/ActivationView.vue),
  [CustomerShell.vue](../../../apps/web-customer/src/app/CustomerShell.vue).
- Deferred: [D-024](../../architecture/deferred.md).
</content>
</invoke>
