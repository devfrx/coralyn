# Spec — Cancellazione / anonimizzazione del Cliente (GDPR) — D-024

> Design approvato in brainstorming 2026-07-06 (ADR-0009). Slice: **solo il meccanismo di cancellazione/anonimizzazione**
> ("diritto all'oblio"). Il consenso/informativa alla creazione resta **deferito** (slice futura).
> Riferimenti: [D-024](../../architecture/deferred.md), nuovo **ADR-0043** (politica di erasure/retention).
>
> ⚠️ Design best-effort conforme, redatto da ingegneri — **non è consulenza legale**. Per la produzione far validare da un DPO/legale.

---

## 1. Obiettivo e contesto

Fornire al lido lo strumento per esercitare il **diritto all'oblio** (Art. 17 GDPR) su un cliente, **senza** distruggere lo
storico prenotazioni (scritture contabili con obbligo di conservazione). Oggi il dominio Cliente fa crea/leggi/modifica ma
**nessun DELETE**; `Booking.customerId` è obbligatorio, quindi un cliente con prenotazioni non è hard-deletabile senza
distruggere records finanziari/operativi.

**Stato attuale (verificato):**
- Modello `Customer` ([schema.prisma:32](../../../apps/api/prisma/schema.prisma)): `firstName`, `lastName`, `phone?`, `email?`, `notes?`, `bookings[]`. PII già minimizzata (nessun documento d'identità).
- `Booking` ([:168](../../../apps/api/prisma/schema.prisma)): `customerId` obbligatorio, `startDate`/`endDate` (Date), `status` (`confirmed|cancelled`), `extras Json?`.
- CRUD in `CustomersService` ([customers.service.ts](../../../apps/api/src/customers/customers.service.ts)): `list`/`getById`/`create`/`update`, tutto tenant-scoped via `forTenant` (RLS FORCE). Nessun delete.
- L'unica tabella con PII del cliente è `Customer`. `Booking.extras` (JsonB) **non è scritto/letto** da alcun codice applicativo → nessuna PII residua da bonificare lì (verificato con ricerca su `apps/api/src`).

## 2. Decisioni (risolte in brainstorming)

1. **Scope** = solo cancellazione/anonimizzazione. Consenso/informativa **deferito**.
2. **Semantica condizionale (B):** 0 prenotazioni → **DELETE reale**; con prenotazioni → **anonimizzazione in place irreversibile**.
3. **Blocco su relazione attiva (A):** se esiste una prenotazione `confirmed` con `endDate >= oggi` (data operativa Europe/Rome) → **409**, l'oblio è differito.
4. **Permessi:** **admin-only** (`@Roles(Role.Admin)`), coerente con le altre azioni sensibili (ADR-0039).

## 3. Conformità GDPR + legge italiana (fondamenti)

| Aspetto | Fondamento | Come lo soddisfiamo |
|---|---|---|
| Diritto all'oblio | Art. 17 GDPR | DELETE reale (0 prenotazioni) o anonimizzazione irreversibile (con storico). |
| Anonimizzazione *genuina* (fuori ambito GDPR) | Recital 26 GDPR | Rimozione di **tutti** gli identificatori diretti (nome→placeholder, phone/email/notes→null). Residuo = transazioni legate a un uuid casuale, **senza mappatura al nome conservata**. `Booking.extras` non usato → nessuna PII residua. |
| Base giuridica per conservare lo storico | Art. 17(3)(b) GDPR + Art. 2220 Cod. Civ. (scritture contabili 10 anni) + DPR 600/1973 | Gli importi delle prenotazioni sono scritture contabili: conservarli in forma anonima è lecito/dovuto. |
| Blocco su relazione attiva | Art. 6(1)(b) + 17(3) GDPR | Finché il contratto è in essere il dato serve alla sua esecuzione → oblio differito, non negato. |
| Accountability | Art. 5(2) GDPR | `anonymizedAt` + `anonymizedBy` (id admin, non PII del cliente) = prova minima di chi/quando. Audit completo di tenant = D-047 (deferito). |
| Minimizzazione | Art. 5(1)(c) GDPR | Già applicata (nessun documento; solo phone/email/notes). |
| Irreversibilità | Art. 17 | Nessun percorso di de-anonimizzazione; hard-delete non recuperabile. |

**Scope onesto:** questa slice consegna il *meccanismo* di erasure. La conformità end-to-end del prodotto richiede anche la
slice **consenso/informativa** (base giuridica + informativa Art. 13), già deferita. I backup si purgano sul loro ciclo di rotazione (fuori dall'app).

Queste decisioni di politica (erasure condizionale + retention anonima motivata da obbligo fiscale + differimento su relazione
attiva) sono formalizzate in **ADR-0043**.

## 4. Modello dati

Aggiunte a `Customer` (migrazione `add_customer_anonymized_fields`, dev + test):
- `anonymizedAt DateTime?` — null = cliente attivo; valorizzato = shell anonimizzato.
- `anonymizedBy String? @db.Uuid` — id dell'admin che ha eseguito l'anonimizzazione (accountability). Nessuna relation navigabile (colonna semplice).

Nessun cambiamento su `Booking`. `ALTER TABLE ADD COLUMN` nullable → migrazione non distruttiva.

## 5. Backend — comportamento

Nuovo `CustomersService.remove(id, actorUserId)` dentro `forTenant(tenantId, tx => …)`:
1. `findFirst({ where: { id } })` → **404** `NotFoundException('Cliente non trovato')` se assente (anche cross-tenant, per isolamento).
2. `count` prenotazioni del cliente:
   - **0** → `tx.customer.delete({ where: { id } })` → outcome `'deleted'`.
   - **>0** → verifica attive/future: esiste `booking` con `status='confirmed'` **e** `endDate >= todayInRome()`?
     - **sì** → **409** `ConflictException('Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.')`
     - **no** → `tx.customer.update` con `{ firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null, anonymizedAt: <now>, anonymizedBy: actorUserId }` → outcome `'anonymized'`.

`list()` filtra `where: { anonymizedAt: null }` → gli shell non compaiono nella lista attiva (restano solo referenziati dallo storico prenotazioni, dove appaiono come "Cliente rimosso").

`getById()` resta invariato (ritorna anche un cliente anonimizzato se acceduto direttamente, con `anonymizedAt` valorizzato); nessun 404 speciale.

`todayInRome()` da [common/dates.ts](../../../apps/api/src/common/dates.ts).

## 6. API + contratti

- **`DELETE /api/customers/:id`** — `@Roles(Role.Admin)`, `@CurrentUser()` per `actorUserId`. Risposta **200** `DeleteCustomerResult`.
- Controller `CustomersController` ([customers.controller.ts](../../../apps/api/src/customers/customers.controller.ts)): aggiungi il metodo `remove`.
- Contratti ([packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)):
  - `CustomerDTO` += `anonymizedAt?: string` (ISO); il projection mappa `null → undefined`.
  - nuovo `type DeleteCustomerResult = { outcome: 'deleted' | 'anonymized' }`.
- Confine di compilazione: BE + contract nello **stesso layer/commit** (gli e2e ts-jest type-checkano l'intero progetto api).

## 7. Frontend (web-staff)

`CustomerDetailView.vue` carica già `useCustomerBookings` → conosce lo storico e adatta l'azione. Azione **admin-only** (`v-if="isAdmin"`, `session.role === Role.Admin`), stile distruttivo, con `ConfirmDialog` + toast (pattern già in uso in `EstablishmentView`/`RenewalsView`):

- **0 prenotazioni** → label "Elimina cliente"; confirm "Il cliente verrà eliminato definitivamente."
- **solo passate/cancellate** → label "Anonimizza dati personali (GDPR)"; confirm "I dati personali verranno rimossi in modo **irreversibile**; lo storico prenotazioni resta in forma anonima."
- **almeno una attiva/futura** (`confirmed`, `endDate >= oggi`, calcolata lato FE dallo storico) → azione **disabilitata** + hint "Ha prenotazioni attive o future: annullale o attendi la scadenza." Il server applica comunque il **409** come difesa.

Esito:
- **200** → toast esito-aware ("Cliente eliminato" / "Dati personali anonimizzati") + `router.push('/customers')`.
- **409** → toast d'errore col messaggio del server.

`useCustomers.ts`: `useDeleteCustomer` (mutation) → invalida la query lista clienti (+ dettaglio). Handler MSW in `mocks/server.ts`.

Guardia display: se `anonymizedAt` è valorizzato (cliente aperto direttamente), mostra un banner "Dati personali rimossi" e nascondi modifica/elimina.

## 8. Test (TDD)

- **api unit** (`customers.service.spec.ts`): 404 assente; 0 prenotazioni → deleted; solo passate → anonymized (campi scrubati, `anonymizedAt`/`anonymizedBy` set); attiva/futura `confirmed` → 409; cancellata futura **non** blocca; passata `confirmed` non blocca; `list` esclude gli anonimizzati.
- **api e2e** (`customers.e2e-spec.ts` o dedicato): DELETE admin-only (staff → 403, anon → 401); esito deleted vs anonymized; 409 con attiva/futura; isolamento tenant (cliente di altro tenant → 404).
- **web-staff** (`CustomerDetailView.spec.ts`): admin vede l'azione, staff no; label adattiva ai 3 casi; confirm → DELETE → navigate + invalidazione; 409 → toast d'errore; banner su cliente anonimizzato.
- Rebuild `@coralyn/contracts` prima di typecheck/test.

**Baseline da non regredire** (ri-verificare LIVE all'avvio): ui-kit 70 · web-staff 219 · web-platform 16 · api unit 190 · api e2e 226 · typecheck pulito.

## 9. Layer di implementazione (un commit ciascuno, subagent-driven, TDD)

1. **BE + contracts + ADR-0043** (confine di compilazione insieme): migrazione `add_customer_anonymized_fields` (dev+test) · `CustomersService.remove` + filtro `list` · `CustomersController` DELETE admin-only · `CustomerDTO.anonymizedAt` + `DeleteCustomerResult` · unit + e2e · **ADR-0043** (politica erasure/retention) · chiusura **D-024** in `deferred.md` (core fatto, consenso residuo).
2. **FE**: `useDeleteCustomer` · azione admin-only in `CustomerDetailView` (label adattiva, confirm, 409, banner anonimizzato) · handler MSW · spec.

## 10. Fuori scope (deferito)

- **Consenso/informativa** alla creazione cliente (base giuridica + Art. 13) — slice futura.
- **Audit di tenant** completo delle azioni admin (chi/quando/perché su tutte le mutazioni) — **D-047**. Qui copriamo il minimo con `anonymizedAt`/`anonymizedBy`.
- De-anonimizzazione / recupero — impossibile per design (è il punto dell'oblio).
