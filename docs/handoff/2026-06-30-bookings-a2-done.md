# Handoff 2026-06-30 — Slice A2 incasso base: COMPLETATA

> Documento di consegna per il prossimo agente/sessione. Descrive cosa ha realizzato la slice A2
> (incasso base sulla prenotazione), lo stato git, i confini mantenuti e le opzioni per i prossimi slice.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR), tutte le
> `docs/specs/`, tutte le `docs/design/`, tutti i `docs/plans/` e i `docs/handoff/`. Più `README.md`
> di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **Branch corrente: `feat/bookings-payment`**, creato da `feat/bookings-daily` (A1 **non** ancora
  mergiata in `main`). Commit per layer; elenco con `git log --oneline feat/bookings-daily..HEAD`.
- Pronto per review/merge. **Dipende da A1**: va mergiato dopo (o insieme a) `feat/bookings-daily`.
- Pushato su `origin/feat/bookings-payment`.

---

## 1. Cosa ha consegnato A2

**Nessuna migrazione di schema**: le colonne incasso esistevano già su `Booking` da A1.

### Backend
- **Helper di dominio puro** `booking.payment.ts` → `resolvePayment(input, totalPrice, today)`:
  deriva `paymentStatus` da `amountCollected` vs `totalPrice` (confronto in **centesimi interi**),
  normalizza method/date, ritorna un risultato discriminato (`ok` | `OVER_TOTAL`/`METHOD_REQUIRED`).
  Niente dipendenze Nest → unit-testato in isolamento (10 test).
- **`PATCH /api/bookings/:id/payment`** (controller + `BookingsService.settlePayment`): idempotente,
  imposta lo stato di incasso **assoluto**. Codici: 200 ok; 404 inesistente/fuori-tenant (RLS);
  409 prenotazione `cancelled`; 422 `OVER_TOTAL`/`METHOD_REQUIRED`; 401 senza Bearer; 400 superuser.
- **`SettlePaymentDto`** (class-validator): `amountCollected` (≥0, ≤99.999.999,99, max 2 dec),
  `paymentMethod?` (`@IsIn`), `collectionDate?` (`@IsCalendarDate`).
- **Contratti additivi**: `SettlePaymentInput`; `BookingDTO += paymentMethod?/collectionDate?`.
  `toBookingDTO` proietta i nuovi campi (`null→undefined`, `Date→yyyy-mm-dd`).

### Frontend
- **`useSettlePayment`** (mutation PATCH; invalida **solo** `bookings` del giorno — l'incasso non
  cambia la mappa, A1 §10).
- **`SettlePaymentModal.vue`** riusabile: importo (default = totale; scorciatoie "Salda tutto" /
  "Segna non pagato"), metodo, data (default oggi `Europe/Rome`); messaggi d'errore 422/409.
- **`BookingsView`** dal mock al reale: prenotazioni del giorno, nome cliente e label ombrellone
  risolti **client-side** (DTO resta puro), Badge stato pagamento, colonna incasso
  (`€ incassato / € totale`), **filtro** per stato (Tutte/Da incassare/Parziali/Saldate),
  **empty-state**. "Nuova prenotazione" naviga a `/map`.
- **Drawer `MapView`**: Badge stato pagamento + bottone "Registra incasso" accanto ad "Annulla".
- MSW: handler `PATCH /api/bookings/:id/payment` **solo nei test**.

---

## 2. Test e build

| Suite     | Prima di A2 | Dopo A2 | Δ   |
|-----------|-------------|---------|-----|
| ui-kit    | 14          | 14      | —   |
| web-staff | 41          | 43      | +2  |
| api unit  | 27          | 46      | +19 |
| api e2e   | 31          | 40      | +9  |

- `pnpm -r build` verde · `eslint .` verde.
- Nuovi unit: `booking.payment` (10), `settle-payment.dto` (7), proiezione (+2).
- Nuovi e2e (9): PATCH paid/partial/reset/over-total/missing-method/404/409/isolamento + 401.
- Verifica live Docker: vedi §4.

---

## 3. Confini mantenuti (cosa A2 NON fa)

- **No edit in-place** di cliente/fascia/prezzo (resta cancel+ricrea). Slice additivo successivo.
- **No modulo Cassa**: niente entità `Payment` ricca, ricevute, storni, chiusura cassa → [D-009](../architecture/deferred.md).
- **No fiscale/POS** → [D-004](../architecture/deferred.md).
- **No pricing**: `totalPrice` read-only, digitato a mano (arriva A3).
- **No calendario multi-giorno** in `BookingsView`: resta sulla data attiva.
- **No stato `draft`**: `status` resta `confirmed|cancelled`.
- **Annullo di una prenotazione pagata**: il `DELETE` non tocca i campi incasso; un eventuale
  rimborso è gestione Cassa (D-009), non modellato. `listByDate` ritorna solo `confirmed`.

---

## 4. Insidie e gotcha (riconfermati / nuovi)

- **`.env` / `.env.test` locali erano STALE** (nomenclatura `driftly_*` pre-rename): corretti in
  questa sessione a `coralyn_app:coralyn_app@localhost:5433/coralyn_{dev,test}`. Sono **gitignored**:
  ogni macchina deve allinearli (altrimenti dev/e2e falliscono contro il DB `coralyn`).
- **DB su Docker, porta 5433**: `docker compose up -d` (profilo default = solo `db`) crea
  `coralyn_dev` + `coralyn_test` (init `01-app-role.sql`). Applicare le migrazioni a **entrambi**
  (`prisma migrate deploy` con `DATABASE_URL` inline) — A2 non aggiunge migrazioni ma il DB va creato.
- **`prisma generate` dopo cambio branch/schema**: il client generato può essere stale (mancava il
  tipo `Booking` dopo lo switch da un checkout vecchio) → rigenerare prima di `nest build`/test.
- **`corepack pnpm`** (pin 11.9.0). Pulire `apps/web-staff/node_modules/.vite` dopo cambi contratti.
- **`eslint .`** ora ignora anche i dump locali del design tool (`Redesign coralyn gestionale
  moderno/`, `Coralyn - Gestionale Lidi.html`) — già gitignored; aggiunti agli `ignores` di eslint.
- **Rebuild api Docker dopo modifiche BE**: `docker compose --profile full up -d --build api`,
  altrimenti il dev FE (proxy Vite `/api`) prende 404 dall'immagine vecchia. Login dev:
  `admin@coralyn.dev` / `coralyn-admin-8473`.

---

## 5. Prossimi slice

- **A3 — Pricing engine + `Package`** ([ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)/[0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
  `Season`/`Pricing`/`Rate`/`Package`, risoluzione prezzo a precedenze, selettore Pacchetto,
  FK `Booking.packageId`. **Increment a sé** con design spec dedicata (la parte più delicata).
- **A4 — Periodiche/abbonamenti** ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)):
  `type=periodic`→`booked`, `type=subscription`→`season`, rinnovo `previousBookingId`. Dà il valore
  pieno **dopo** A3 (rinnovo con prezzo ricalcolato sul nuovo listino).
- In alternativa: **B** setup-form mappa CRUD ([ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)),
  **C** staff-mgmt & RBAC ([D-025](../architecture/deferred.md)).

---

## 6. Riferimenti

- **Spec A2:** [docs/specs/2026-06-30-bookings-payment-design.md](../specs/2026-06-30-bookings-payment-design.md)
- **Piano A2:** [docs/plans/2026-06-30-bookings-payment.md](../plans/2026-06-30-bookings-payment.md)
- **ADR incasso base:** [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)
- **Handoff precedente (A1):** [2026-06-30-bookings-a1-done.md](2026-06-30-bookings-a1-done.md)
- **Modello dati:** [docs/design/data-model.md](../design/data-model.md)
