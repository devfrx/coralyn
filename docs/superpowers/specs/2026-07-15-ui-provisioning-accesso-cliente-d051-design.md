# Design — D-051: UI operatore per il provisioning dell'accesso cliente (`web-staff`)

> **Data:** 2026-07-15 · **Modulo:** D-035 (canale cliente) — tassello operatore mancante.
> **Riferimenti:** [ADR-0049](../../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)
> (auth cliente provisioned), [ADR-0042](../../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)
> (consegna credenziali una-volta), [flows.md §9](../../design/flows.md) (macchina a stati enrollment),
> spec S3+S4 [2026-07-10](2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md) §6.1.

## 1. Problema

Il backend del provisioning accesso cliente **esiste** da D-035 S3, ma **nessuna UI in `web-staff` lo
chiama** (grep 2026-07-15: 0 riferimenti). Oggi un operatore può generare/revocare l'accesso self-service
del cliente **solo via API** (curl). Senza questa UI il canale cliente (app `web-customer`, D-035 S4) **non è
azionabile** da un operatore reale: non può consegnare link + PIN + QR al cliente dall'interfaccia.

Endpoint già presenti (admin-only, [`bookings.controller.ts`](../../../apps/api/src/bookings/bookings.controller.ts)):

- `POST /bookings/:id/customer-access` → `CustomerProvisionResponse { activationUrl, pin, expiresAt }`
  (mostrati **una volta sola**; il raw non è più recuperabile). Ruota enrollment/sessioni vive precedenti.
- `POST /bookings/:id/customer-access/revoke` → `204`.

Metodo di servizio già presente **ma non esposto**:
[`CustomerAccessService.accessStatus(customerId)`](../../../apps/api/src/customer-auth/customer-access.service.ts)
→ `CustomerAccessStatusDTO { state: 'none'|'issued'|'active'|'revoked', lastActivatedAt }`.

## 2. Decisioni di design

Chiuse in brainstorming (2026-07-15):

- **Card dedicata per-cliente** nella Scheda cliente (non azione per-abbonamento): l'accesso è
  concettualmente **per-`Customer`** — stato, revoca e rotazione chiavano tutti su `customerId`, un cliente =
  un'identità self-service. Gli endpoint prendono un `bookingId` solo come punto d'ingresso da cui risolvono
  il customer (sotto RLS).
- **QR generato client-side** dall'`activationUrl` con la dipendenza **`qrcode`** (node-qrcode) — richiesto
  dalla traccia («link + PIN + QR»). Nessun `qrPayload` dal backend: il QR codifica l'`activationUrl`.

## 3. Backend (delta additivo, nessuna migration)

**Problema di sicurezza da evitare:** `accessStatus(customerId)` **non è tenant-scoped** (query diretta su
`customerEnrollmentToken` per `customerId`, senza `forTenant`/RLS). Esporlo per `customerId` grezzo sarebbe un
**IDOR cross-tenant** (un admin del tenant A leggerebbe lo stato accesso di un cliente del tenant B — dato non
segreto, ma comunque un leak d'esistenza). Provision/revoke lo evitano risolvendo il `customerId` **dalla
booking sotto RLS**: se la booking non è nel tuo tenant → `404`.

Per simmetria **e** sicurezza, tutto resta sotto `/bookings/:id/customer-access`:

- **Nuovo** `GET /bookings/:id/customer-access` (`@Roles(Admin)`) → `CustomerAccessStatusDTO`. Risolve
  `customerId` dalla booking **tenant-scoped** (stesso pattern di provision/revoke), poi lo stato.
- **Refactor DRY interno:** estrarre `private resolveCustomerId(bookingId): Promise<string>` in
  `CustomerAccessService` (il blocco `forTenant → booking.findFirst → NotFound` è oggi duplicato in
  `provisionAccess` e `revokeAccess`; il terzo uso è il momento giusto per estrarlo — non un refactor gratuito).
  `accessStatus` diventa raggiungibile via un metodo che prima risolve il customer tenant-scoped.
- `provision`/`revoke` **invariati** come contratto.

## 4. Contracts

**Nessun nuovo tipo.** `CustomerProvisionResponse` e `CustomerAccessStatusDTO`/`CustomerAccessState` esistono
già in [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts).

## 5. Frontend (`web-staff`)

- **`CustomerAccessCard.vue`** — nuova `SectionCard` «Accesso cliente» nella Scheda cliente, accanto a
  Abbonamenti/Storico/Pagamenti. Mostra:
  - **Badge di stato**: *Mai generato* (`none`) / *Emesso, in attesa di attivazione* (`issued`) / *Attivo*
    (`active`) / *Revocato* (`revoked`) + «ultima attivazione» (`lastActivatedAt`) quando presente.
  - Pulsante **«Genera accesso»** (label *«Rigenera»* se `issued`/`active`, che avvisa della rotazione) e
    **«Revoca»** (solo se `issued`/`active`, con `ConfirmDialog`).
  - **Visibilità:** la card compare **solo se il cliente ha ≥1 abbonamento** (`type='subscription'`): il
    provisioning risolve il customer da una booking e l'app cliente mostra solo abbonamenti — senza
    abbonamento l'accesso sarebbe vuoto. Usa il **primo booking-abbonamento** come `bookingId` rappresentativo
    (qualunque booking del cliente risolve lo stesso `customerId`; la rotazione è unica per-cliente).
  - Solo **admin** (`isAdmin`), coerente con le altre azioni admin della Scheda.
- **`CustomerAccessModal.vue`** — reveal **una-volta** (pattern fase-`result` di
  [`CreateEstablishmentModal.vue`](../../../apps/web-platform/src/features/establishments/CreateEstablishmentModal.vue)):
  - **QR** (`<img>` da `qrcode.toDataURL(activationUrl)`), **link** e **PIN** con pulsanti **copia** (inline
    `navigator.clipboard`, nessuna dipendenza), **scadenza** formattata, avviso «non più recuperabile, generane
    uno nuovo se lo perdi».
  - Nota: il QR/link è significativo solo con `CUSTOMER_APP_URL` configurato (in dev l'url è **relativo**) — il
    copy lo esplicita.
- **Hooks** in [`useCustomers.ts`](../../../apps/web-staff/src/features/customers/useCustomers.ts):
  - `useCustomerAccessStatus(bookingId)` — `queryResource`, `GET /bookings/:id/customer-access`.
  - `useProvisionCustomerAccess(customerId)` — `mutationResource`, `POST …/customer-access`; invalida lo status.
  - `useRevokeCustomerAccess(customerId)` — `mutationResource`, `POST …/revoke`; invalida lo status.
- Cablaggio in [`CustomerDetailView.vue`](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue):
  monta `CustomerAccessCard` nella colonna delle card, gli passa il `bookingId` rappresentativo, gestisce
  l'apertura del modale sul successo del provisioning.

## 6. Testing (TDD, stile repo)

- **api e2e** (`apps/api/test/customer-access.e2e-spec.ts`, esiste già):
  - `GET /bookings/:id/customer-access` → `none` prima del provisioning, `issued` dopo, `active` dopo
    attivazione, `revoked` dopo revoke.
  - **Isolamento cross-tenant:** admin tenant A su booking tenant B → **404** (nessun leak).
  - **Admin-only:** operatore non-admin → **403**.
- **web-staff** (Vitest + MSW, come le altre feature customers):
  - `CustomerAccessCard`: render per ciascuno stato; card assente senza abbonamenti; label «Rigenera» quando
    già emesso/attivo; «Revoca» solo se `issued`/`active`.
  - `CustomerAccessModal`: apertura sul successo del provisioning, render di link/PIN/QR (mock `qrcode`), copy.
  - Revoke → `ConfirmDialog` → status aggiornato.

## 7. Dipendenza

`qrcode` (+ `@types/qrcode` in devDependencies) in `apps/web-staff`, installata con
`corepack pnpm --filter @coralyn/web-staff add qrcode` (mai `npm` — [[coralyn-pnpm-not-npm]]).

## 8. DoD (ADR-0009 — design docs nello stesso task)

- `deferred.md`: **D-051 → Risolta**.
- `flows.md §9`: nota sulla **UI operatore** (Scheda cliente → Genera/Revoca) sulla macchina a stati accesso.
- ADR-0049: addendum **«UI operatore D-051 realizzata»**.
- Mockup `docs/design/mockups/web-staff-customer-access.html` (card + modale reveal, per lo stile).

## 9. Fuori scope (YAGNI)

- Nessun invio email del link (consegna resta di persona/QR; l'invio è un follow-up separato).
- Nessun audit di lettura/mutazione dedicato (→ D-047, audit di tenant).
- Interceptor 401 globale in `web-staff` (→ D-037, distinto).
