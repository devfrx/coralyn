# Spec — Navigazione data operativa (`activeDate`)

> Design **CONFERMATO** in brainstorming (2026-07-06, sessione successiva). Le decisioni §3 sono state **approvate
> dall'utente** (tutte come raccomandato; §5 nella variante "professionale senza debito", vedi §5).
> Slice FE-only, piccola. Nessun cambio backend.

---

## 1. Obiettivo e contesto

Oggi il gestionale è **bloccato su un singolo giorno**: `session.activeDate` è **hardcoded a `'2026-06-27'`**
([stores/session.ts:10](../../../apps/web-staff/src/stores/session.ts)) e **niente lo muta** — le frecce ‹ › nella
[Topbar.vue:24-26](../../../apps/web-staff/src/app/Topbar.vue) non hanno `@click`. L'operatore non può vedere/operare
un altro giorno. Obiettivo: rendere `activeDate` navigabile (giorno per giorno + salto a data arbitraria).

**Buona notizia — il grosso c'è già.** `activeDate` è **già la sorgente reattiva** consumata ovunque via `storeToRefs` /
query-keys; manca solo il **mutatore** e un **default sensato**. Consumatori verificati:
- **Mappa** — [MapView.vue:18-19](../../../apps/web-staff/src/features/map/MapView.vue) `useDayBookings(activeDate)` + [useDayMap.ts:11](../../../apps/web-staff/src/features/map/useDayMap.ts) `GET /map?date=${activeDate}`; creazione prenotazione usa `startDate: activeDate` ([:169](../../../apps/web-staff/src/features/map/MapView.vue), [:189](../../../apps/web-staff/src/features/map/MapView.vue)).
- **Prenotazioni** — [BookingsView.vue:15-16](../../../apps/web-staff/src/features/bookings/BookingsView.vue) `useDayBookings(activeDate)`; invalidazioni keyed su `activeDate` ([useBookings.ts](../../../apps/web-staff/src/features/bookings/useBookings.ts)).
- **Rinnovi** — [RenewalsView.vue:24](../../../apps/web-staff/src/features/renewals/RenewalsView.vue): default stagione d'origine = quella che contiene `activeDate` (soft default).
- **Topbar** — [:11](../../../apps/web-staff/src/app/Topbar.vue) formatta il label data.
- **Scheda cliente** — [CustomerDetailView.vue:33](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue): l'hint "prenotazioni attive/future" (erasure GDPR, D-024) usa `session.activeDate` come "oggi" di riferimento (vedi §5, accoppiamento da sciogliere).

Poiché tutti i consumatori sono già reattivi, **mutare `activeDate` rende reattivo tutto downstream** senza altro lavoro di plumbing.

## 2. Cosa NON è in scope
- Il **Report** ha un proprio selettore di periodo, indipendente da `activeDate` — non toccato.
- Nessuna persistenza cross-reload (§3.4), nessun backend (map/bookings prendono già il parametro `date`).

## 3. Decisioni (CONFERMATE con l'utente 2026-07-06)

1. **Default = oggi (data operativa Europe/Rome), calcolato client-side.** Niente più data fissa. Coerente con la data
   operativa ADR-0031. Serve una util FE `todayIso()` che formatta "oggi" in `Europe/Rome` → `yyyy-mm-dd`
   (`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' })` o equivalente deterministico). *Raccomandato.*
2. **Controlli:** frecce ‹ (giorno precedente) / label / › (giorno successivo) cablate a mutare `activeDate` di ±1 giorno,
   **più** click sul label → apre un `<input type="date">` nativo per **saltare a una data arbitraria**. (Frecce per i
   giorni adiacenti, picker per i salti lontani — nessun mezzo-lavoro.) *Raccomandato.*
3. **Visibilità: solo sulle viste dipendenti dalla data (Mappa, Prenotazioni)**, via flag route-meta `usesDate: true`; la
   Topbar mostra il navigatore solo se `route.meta.usesDate`. Su Clienti/Listino/Report/Stabilimento **nascosto** (lì non
   fa nulla → niente sensazione di finto). *Raccomandato* (alternativa: sempre globale come nel mock — più semplice ma un
   controllo che "non fa niente" su metà delle viste).
4. **Nessuna persistenza:** `activeDate` torna a "oggi" a ogni reload completo (store, non persistito). YAGNI su localStorage. *Raccomandato.*
5. **Nessun limite** di navigazione: passato/futuro liberi (l'operatore vede legittimamente incassi passati / prenotazioni future).

## 4. Aritmetica delle date (attenzione DST/UTC)

Il ±1 giorno deve essere **timezone-safe**: NON usare `new Date(iso + 'T00:00:00')` (ora locale, deriva su DST). Usare
math in UTC: parse `new Date(iso + 'T00:00:00Z')` → `setUTCDate(getUTCDate() + n)` → riformatta `toISOString().slice(0,10)`.
Fornire una util pura `addDays(iso: string, n: number): string` con test unitari (inclusi i confini mese/anno e attorno al
cambio ora legale). Collocazione: `apps/web-staff/src/lib/dates.ts` (nuovo) o accanto a util esistenti.

## 5. Follow-up correlato (da valutare nella slice)

L'hint erasure in [CustomerDetailView.vue:33](../../../apps/web-staff/src/features/customers/CustomerDetailView.vue) usa
`session.activeDate` come "oggi". Con la navigazione attiva, se l'operatore porta `activeDate` a una data passata su Mappa e
poi apre una Scheda cliente, l'hint "attive/future" userebbe quella data passata come riferimento. È **minore** (il **409 del
server è autoritativo** e usa il vero `todayInRome()`), ma resta un accoppiamento improprio.

**Decisione CONFERMATA (variante "professionale, senza debito"):** `todayIso()` diventa la **fonte unica del "oggi
operativo"** (Europe/Rome, coerente ADR-0031). L'hint erasure legge **`todayIso()` direttamente**, NON `activeDate`, così
resta corretto qualunque data l'operatore stia navigando sulla Mappa. Nessuna duplicazione di logica-data; niente toppa
isolata. Nessun endpoint di preview lato server (sarebbe over-engineering per un hint UX ed è fuori scope FE-only): il 409
resta l'autorità finale. Scollegamento incluso nella slice (L3).

## 6. Layer previsti (indicativi — dettaglio nel piano)

1. **Util + store default:** `addDays`/`todayIso` in `lib/dates.ts` (+ unit test); `session.activeDate` default a `todayIso()`.
2. **Topbar + gating:** cablare frecce (±1 via `addDays`) + picker (`<input type="date">`) che mutano `activeDate`; flag
   route-meta `usesDate: true` su `/map` e `/bookings`; Topbar mostra il navigatore solo se `usesDate`; spec Topbar.
3. **(Opz.) Scollegamento hint erasure** (§5): usare `todayIso()` invece di `activeDate` in `CustomerDetailView`.

## 7. Test

- **Unit** (`lib/dates.spec.ts`): `addDays` (±1, confine mese/anno, DST), `todayIso` (formato yyyy-mm-dd, timezone Europe/Rome).
- **Topbar** (`Topbar.spec.ts`, nuovo): freccia › incrementa `activeDate` di 1 giorno; ‹ decrementa; il picker imposta la
  data scelta; il label mostra la data formattata; il navigatore è **nascosto** su una route senza `usesDate` e **visibile**
  su `/map`/`/bookings`.
- **Regressione:** non regredire web-staff (baseline **227**), typecheck EXIT 0. Le viste map/bookings già reagiscono ad
  `activeDate` (query-keys) → nessun cambio ai loro test se non un eventuale caso di refetch al cambio data.

## 8. Rischi / note

- **DST/UTC** (§4) è l'unico punto insidioso: coprirlo con test.
- Se si sceglie la visibilità globale (§3.3 alternativa) invece del gating, cade il flag route-meta e la Topbar resta semplice.
- Nessun ADR necessario (feature FE, nessuna decisione architetturale oltre a quelle documentate; la data operativa è già ADR-0031).

## 9. Baseline (verificata LIVE 2026-07-06 all'HEAD `6feebf3`)
ui-kit 70 · web-staff 227 · web-platform 16 · api unit 200 · api e2e 235 · typecheck pulito.
