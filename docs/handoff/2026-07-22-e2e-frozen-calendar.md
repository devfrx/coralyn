# Handoff — Time-bomb date e2e risolto alla radice (calendario congelato)

> **Data:** 2026-07-22 · **Autore sessione:** agente cantiere-polish (stessa sessione).
> **TL;DR:** Il chip time-bomb e2e (task_673403dd) è chiuso NON relativizzando le date ma
> **congelando il calendario delle e2e come fixture**: nuovo `setupFilesAfterEnv`
> ([`jest-frozen-calendar.setup.ts`](../../apps/api/test/jest-frozen-calendar.setup.ts)) che
> finge SOLO `Date` a **2026-07-15** (metà della stagione seed), timer reali intatti.
> Risultato: **33/33 suite, 379/379 test — prima batteria e2e interamente verde del repo**
> (baseline storica 30/33). Review esterna: APPROVED, 0 Critical/Important.
> **MERGIATO FF su `main` e pushato con ok esplicito utente** (`fe1cc12..2981363`; full e2e
> riverificata sul mergiato: 33/33). Branch eliminato.

## 1. Perché così (la diagnosi che cambia la soluzione)

I 17 test rossi (bookings, customer-bookings, subscription-cession) non erano «date da
aggiornare»: erano il sintomo di due modelli temporali incompatibili. Le suite raccontano una
storia su un **calendario assoluto** (stagione seed «Estate 2026» `2026-05-01…09-30`,
`seed-pricing.ts`) con 188 date letterali; il server valida regole **relative a oggi**
(`suspend` S ≥ oggi, `absence-releases` D ≥ oggi — `bookings.service.ts:634/:913`, ADR-0031).
Dal 20 luglio reale i test «futuri» sono diventati passato; dopo il 30 settembre **nessuna**
data potrebbe più essere insieme ≥ oggi e ≤ endDate.

Prova che la relativizzazione parziale non basta: in `bookings.e2e-spec.ts` esisteva già
`releaseDate = addDays(todayInRome(), 3)` col commento «così i test non marciscono» — ed era tra
i rossi comunque, perché una data relativa a oggi resta vincolata a una stagione fissa.
Relativizzare *tutto* (stagione compresa) = ~188 letterali → offset, leggibilità peggiore e
rischio sugli incastri testa/buco/coda. Scelta (confermata dall'utente): **il tempo è parte
della fixture** — le e2e girano per sempre al 2026-07-15.

## 2. Com'è fatto

- `apps/api/test/jest-frozen-calendar.setup.ts` (registrato in `jest-e2e.json` →
  `setupFilesAfterEnv`, NON `setupFiles`: servono i globals jest): `jest.useFakeTimers` con
  `doNotFake` = tutte le 14 API fakeable tranne `Date` → supertest/Prisma/throttler su timer
  reali; `afterAll` ripristina. Istante: `2026-07-15T07:00:00Z` (09:00 Roma).
- Il blocco relativo marcito in `bookings.e2e-spec.ts` è tornato letterale (`'2026-07-18'`),
  import `todayInRome` e helper `addDays` rimossi: lo stile della suite è di nuovo uno solo.
- Rischi verificati dal reviewer a livello sorgente: JWT iat/exp emessi E verificati sotto lo
  stesso clock in-process; throttler TTL mai asserito in reset; nessuna suite confronta
  timestamp DB (`@default(now())`, reali) col calendario JS; lista `doNotFake` completa
  (15 API di jest 29, `Date` esclusa).

## 3. Gotcha per chi scrive e2e da qui in poi

- **«Oggi» nelle e2e è il 2026-07-15, per sempre.** Date «future» nei test = dopo quella data e
  dentro `2026-09-30`; guardie sul passato = prima. Se un test deve calcolare oggi, usi
  `todayInRome()` (deterministica sotto il clock). L'istante non è esportato di proposito.
- Se un giorno serve **ri-centrare** l'istante (nuova stagione seed), ripassare le guardie
  passato/futuro delle suite: il commento in testa al setup è il contratto.
- Il warning jest «worker process has failed to exit gracefully» è **pre-esistente** (compare
  identico nella suite unit non toccata): non è stato introdotto dal freeze, non inseguirlo qui.
- La suite **unit** api (config default) NON è congelata: era verde e resta fuori scope.

## 4. Stato

- **Mergiato**: `main = 2981363` (FF `fe1cc12..2981363`, 2 commit), pushato su origin, branch
  `fix/e2e-timebomb-date` eliminato. Working tree pulito.
- Verifica: 3 suite ex-rosse 119/119 → **full e2e 33/33, 379/379** (ripetuta identica sul
  mergiato) → ricontrollo post-fix cosmetico (customer-bookings 7/7). Review sonnet APPROVED;
  unico Minor (costanti esportate mai importate) fixato secondo prescrizione.
- I riferimenti storici «e2e 30/33, 3 rosse = time-bomb» negli handoff precedenti restano validi
  come storia; da questo commit la baseline e2e è **33/33**.
