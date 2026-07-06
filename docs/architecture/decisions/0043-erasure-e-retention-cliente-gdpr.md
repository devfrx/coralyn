# ADR-0043: Erasure e retention del Cliente (GDPR — diritto all'oblio)

- **Status:** Accepted
- **Data:** 2026-07-06
- **ADR correlati:** [0009](0009-metodo-decisionale.md), [0023](0023-contatti-cliente-colonne-tipizzate.md), [0039](0039-rbac-role-guard.md)
- **Spec:** [2026-07-06-gdpr-customer-erasure-d024-design.md](../../superpowers/specs/2026-07-06-gdpr-customer-erasure-d024-design.md)
- **Deferred:** [D-024](../deferred.md), [D-047](../deferred.md)

> ⚠️ Design conforme allo stato dell'arte redatto da ingegneri — non è consulenza legale. Per la
> produzione, far validare da un DPO/legale.

## Context

Il dominio Cliente offriva crea/leggi/modifica ma **nessun DELETE**: mancava lo strumento per
esercitare il **diritto all'oblio** (Art. 17 GDPR). Un hard-delete indiscriminato è però
inammissibile appena un cliente ha uno storico prenotazioni, perché `Booking.customerId` è
obbligatorio e le prenotazioni sono anche **scritture contabili** soggette a obbligo di
conservazione decennale. Serviva una politica che concili il diritto del cliente a essere
dimenticato con l'obbligo del lido di conservare lo storico fiscale/operativo, senza lasciare PII
residua da nessuna parte.

Stato dei dati verificato: l'unica tabella con PII del cliente è `Customer`
(`firstName`/`lastName`/`phone?`/`email?`/`notes?`); `Booking.extras` (JsonB) non è mai scritto né
letto da alcun codice applicativo, quindi non c'è PII da bonificare lì.

## Decision

**1. Erasure condizionale.** `DELETE /api/customers/:id` (`@Roles(Role.Admin)`, coerente con
[ADR-0039](0039-rbac-role-guard.md)):
- **0 prenotazioni** → `DELETE` reale, riga rimossa.
- **con storico** (almeno una prenotazione, passata o cancellata) → **anonimizzazione in place e
  irreversibile**: `firstName='Cliente'`, `lastName='rimosso'`, `phone`/`email`/`notes` → `null`;
  riga e `id` **conservati** (le prenotazioni restano legate a un id, non a una persona).
- **blocco su relazione attiva:** se esiste almeno una prenotazione `confirmed` con
  `endDate >= oggi` (data operativa `Europe/Rome`) → **409**, l'oblio è **differito**, non negato.

`list()` esclude i clienti anonimizzati (`where: anonymizedAt: null`); `getById()` resta invariato
(un cliente anonimizzato resta accessibile per id, con lo storico che lo mostra come "Cliente
rimosso").

**2. Accountability.** Due colonne nullable su `Customer` (migrazione
`add_customer_anonymized_fields`, non distruttiva): `anonymizedAt` (timestamp) e `anonymizedBy`
(id dell'admin che ha eseguito l'operazione — non è PII del cliente). Nessun percorso di
de-anonimizzazione: è irreversibile per design, è il punto dell'oblio.

**3. Base giuridica della retention anonima.** Le prenotazioni sono scritture contabili
([Art. 2220 Cod. Civ.](https://www.gazzettaufficiale.it/), conservazione 10 anni, + DPR
600/1973): conservarle in forma **anonima** dopo l'erasure del cliente è lecito ed **è dovuto**
(Art. 17(3)(b) GDPR: la cancellazione non si applica nella misura in cui il trattamento sia
necessario per adempiere un obbligo legale). Lo storico sopravvive quindi come dato contabile
legittimo, non come PII residua.

**4. Anonimizzazione genuina.** Ex Recital 26 GDPR, un dato è fuori ambito GDPR solo se
l'anonimizzazione è **genuina e irreversibile**: rimozione di **tutti** gli identificatori
diretti (nome sostituito da placeholder, telefono/email/note azzerati), **nessuna mappatura al
nome conservata da nessuna parte**, e nessun canale residuo di re-identificazione — verificato che
`Booking.extras` non porta mai PII. Il residuo è una transazione legata a un uuid casuale, non a
una persona.

**5. Blocco su relazione attiva.** Finché una prenotazione `confirmed` futura è in essere, il dato
del cliente serve all'esecuzione del contratto (Art. 6(1)(b) GDPR) e l'oblio è correttamente
**differito**, non negato, ex Art. 17(3) — l'operatore deve annullare la prenotazione o attendere
la scadenza prima di poter procedere.

## Alternatives considered

- **Soft-delete generico (flag `deletedAt` senza scrub dei campi)** — non soddisfa Art. 17: i dati
  personali resterebbero leggibili in chiaro nel DB, un semplice nascondimento dalla UI non è
  erasure. Scartata.
- **Hard-delete sempre, con `Booking.customerId` reso nullable** — distrugge la tracciabilità
  minima dello storico contabile (chi ha prenotato cosa, anche in forma anonima) e complica ogni
  query di reportistica che oggi assume `customerId` non-null. L'anonimizzazione in place ottiene
  lo stesso risultato di privacy senza rompere lo schema né il reporting. Scartata.
- **Consentire l'erasure anche con prenotazione attiva/futura, con cancellazione a cascata** —
  romperebbe l'esecuzione di un contratto in corso (Art. 6(1)(b)) e creerebbe un buco operativo
  (una prenotazione confermata senza titolare). Il differimento con 409 è la scelta corretta.
  Scartata.
- **Consenso/informativa (Art. 13) nella stessa slice** — è un problema distinto (base giuridica
  alla *raccolta*, non alla *cancellazione*) con un proprio design (form di consenso, testo
  informativa, versionamento). Tenerlo fuori scope evita di allargare questa slice a un dominio
  separato; resta **deferito** in [D-024](../deferred.md). Scartata per questa slice.

## Consequences

### Positive

- Il lido può esercitare il diritto all'oblio **senza** perdere lo storico contabile/operativo:
  le due esigenze (privacy del cliente, obbligo fiscale) coesistono senza conflitto.
- **Zero PII residua** dopo l'anonimizzazione, verificato codebase-wide (`Booking.extras` non
  scritto/letto da alcun path applicativo).
- **Accountability minima** (`anonymizedAt`/`anonymizedBy`) senza dover attendere l'audit di
  tenant completo ([D-047](../deferred.md)).
- Il blocco 409 su relazione attiva evita lo stato inconsistente di una prenotazione confermata
  futura senza cliente titolare.

### Negative / Trade-off

- Lo storico prenotazioni di un cliente cancellato sopravvive per sempre come "Cliente rimosso":
  accettato, è esattamente l'esito previsto dalla retention contabile, non un difetto.
- Il **consenso/informativa** (Art. 13 GDPR) alla creazione del cliente resta deferito: questa
  slice copre solo il meccanismo di cancellazione, non la base giuridica di raccolta a monte.
  Tracciato in [D-024](../deferred.md), non silenzioso.
- L'**audit completo** di tutte le azioni admin-in-tenant (non solo erasure) resta deferito a
  [D-047](../deferred.md); qui si copre solo il minimo di accountability sull'erasure stessa.
- Nessun percorso di recupero: un errore operativo (anonimizzare il cliente sbagliato) è
  irreversibile per design — mitigato dal fatto che l'azione è admin-only e richiede conferma
  esplicita in UI.

## Rubric check

1. **Professionalità** — erasure condizionale con anonimizzazione irreversibile è il pattern
   standard per conciliare Art. 17 GDPR con obblighi di conservazione contabile; non è
   over-engineering né sotto-tutela.
2. **Convenzioni** — riusa `@Roles(Role.Admin)`/`RolesGuard` già stabilito
   ([ADR-0039](0039-rbac-role-guard.md)), il pattern tenant-scoped `forTenant` esistente in
   `CustomersService`, e `todayInRome()` per la data operativa ([ADR-0031](0031-fuso-orario-e-date-operative.md)).
3. **Modularità** — due colonne nullable additive su `Customer`, nessun cambiamento su `Booking`;
   la logica di erasure vive in un solo metodo (`CustomersService.remove`), il confine
   BE/contracts è nello stesso commit.
4. **Zero debito** — il meccanismo di erasure è **realizzato**, non un placeholder: DELETE reale,
   anonimizzazione irreversibile, blocco 409, admin-only, accountability minima. I residui
   (consenso/informativa, audit di tenant completo) sono esplicitamente tracciati in
   [deferred.md](../deferred.md) ([D-024](../deferred.md), [D-047](../deferred.md)), non silenziosi.
