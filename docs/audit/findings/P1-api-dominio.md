# P1 — apps/api dominio/struttura (157/157 file non-spec letti)

## ALTO

### P1-001 — `suspend` crea un RANGE INVERTITO su coverage frammentata → 500 — ALTO (correttezza)
- `bookings.service.ts:649-672`, guardia `:654`, create coda `:664-668`.
- La guardia `:654` valida `Rminus1` contro lo **span di contratto** (`existing.endDate`); il carve opera sul **frammento** (`C.endDate`). La `find` `:655` ammette `Rminus1 === C.endDate`. Se `Rminus1 === C.endDate < existing.endDate` → coda `{startDate: C.endDate+1, endDate: C.endDate}` = **invertito**.
- Il commento `:664` codifica l'assunzione errata: «coda [R, C.end] sempre non vuota (Rminus1 < endDate = C.end …)» — vale solo con UNA coverage.
- **Sequenza riproducibile** (tutti passi leciti): abbonamento `[2026-05-01…09-30]` → `POST /bookings/:id/absence-releases {date:"2026-06-15"}` (spezza in `[05-01…06-14]`+`[06-16…09-30]`, righe 927-939) → `POST /bookings/:id/suspend {startDate:"2026-06-01", endDate:"2026-06-14"}` → `C=[05-01…06-14]`, coda `{06-15 … 06-14}`.
  Variante: due sospensioni chiuse consecutive, la 2ª con endDate = ultimo giorno della testa creata dalla 1ª.
- Postgres rifiuta il daterange lower>upper con `data_exception`, NON con `coverage_no_overlap` → `isBookingOverlapExclusion` (`booking.errors.ts:17-25`) non matcha → `PrismaExceptionFilter` non mappa (`:36-40`) → **500 dove il contratto prevede 422**. Nessun `CHECK (startDate<=endDate)` sulla tabella.
- RADICE: il carve è implementato **DUE VOLTE** e le copie **divergono**: `releaseAbsence:923-939` valida contro il FRAMMENTO (`if (D > C.startDate)` / `if (D < C.endDate)`), `suspend` contro lo SPAN. Astrazione mai estratta.
- RADICE ULTIMA (metodologica): identica classe di difetto **già trovata e corretta per `terminate`** nell'audit 2026-07-09 (`docs/superpowers/specs/2026-07-09-audit-macchina-stati-cta-abbonamento-design.md:27`, fix D3 §7). Quel documento mette `suspend` **in ambito** (§2) e dichiara in §8 l'invariante «mai range invertiti». Il fix è stato applicato solo a `terminate` (commento `:596`). **Invariante dichiarato a livello di sistema, verificato a livello di singolo metodo.**
- FIX RADICE: estrarre `bookings/coverage.carve.ts` con `carveInterval(fragments, from, to)` puro, relativo al frammento, mai intervalli vuoti; usarlo in `suspend`, `releaseAbsence`, `terminate`. + migration `ALTER TABLE "BookingCoverage" ADD CONSTRAINT coverage_range_valid CHECK ("startDate" <= "endDate")`.

### P1-002 — `SeasonsService.remove`: cascata applicativa a mano che ignora 2 FK RESTRICT → 500 — ALTO (correttezza)
- `catalog/seasons.service.ts:44-61`, rotta `seasons.controller.ts:20-23`.
- `Season` è referenziata da **4** tabelle RESTRICT, non 2: `Pricing.seasonId` (gestita), `RenewalCampaign.originSeasonId` (NO), `RenewalCampaign.destinationSeasonId` (NO), `RentalTariff.seasonId` (NO).
- P2003 → `PrismaExceptionFilter:37` lo lascia al default = **500**. I gemelli `deletePackage` (`catalog.service.ts:258-264`) e `TimeSlotsService.remove` (`:78-88`) danno 409 azionabile.
- **Raggiungibile col seed shipped**: `prisma/seed.ts:171-198` crea la stagione `u(7,1)` + 3 `RentalTariff` → `DELETE /api/seasons/70000000-0000-4000-8000-000000000001` = 500 out-of-the-box.
- RADICE: cassa di sicurezza pre-delete scritta a mano contro il grafo FK *com'era*. Il modulo rentals (ADR-0050) ha aggiunto una FK senza che nessuno aggiornasse la cascata. Pattern che si degrada a ogni nuova FK.
- FIX: (1) mappare **P2003 → 409** in `mapPrismaKnownError` (gemello di P2002/P2023): trasforma ogni futura FK dimenticata da 500 a 409; (2) elenco dipendenze dichiarato accanto al modello invece che inline; nell'immediato i 3 count mancanti.

### P1-003 — Due politiche UUID incompatibili; `@IsUUID()` rifiuta id che il repo dichiara validi — ALTO (correttezza/coerenza)
- Policy dichiarata: `common/uuid.ts:1-5` — UUID «SENZA vincolo di versione/variante RFC-4122 … `@IsUUID()` li rifiuterebbe». Pinnata da `create-booking.dto.spec.ts:6-8`.
- **14 campi usano comunque `@IsUUID()`**: `transfer-subscription.dto.ts:8`, `package-equipment-item.dto.ts:4`, `bulk-assign-umbrella-type.dto.ts:8,12`, `bulk-delete-umbrellas.dto.ts:8`, `create-row.dto.ts:5`, `create-umbrella.dto.ts:5,15`, `generate-umbrellas.dto.ts:5,22`, `restore-umbrella.dto.ts:5`, `update-umbrella.dto.ts:13`, `checkout-rental.dto.ts:5,6,7`.
- `validator@13.15.35` regex `all` richiede versione `[1-8]` e variante `[89ab]` → `50000000-0000-0000-0000-000000000001` e `…-0000000000a1` **falliscono**. `UUID_SHAPE` e `ParseUUIDPipe` (regex Nest, permissiva) li accettano.
- Conseguenze: `POST /api/rentals {rentalItemId:"00000000-0000-0000-0000-0000000000a1"}` → **400**, il Pedalò seedato non è noleggiabile. Lo stesso `customerId` è accettato da `POST /bookings` e rifiutato da `POST /bookings/:id/transfer`.
- RADICE: policy introdotta ma mai applicata retroattivamente né resa obbligatoria. Conferma: `seed-report-demo.ts:14` dice «Stesso helper id di seed.ts» ma le due `u()` **differiscono** (`seed.ts:51` → `-0000-4000-8000-` RFC-valido; `seed-report-demo.ts:15` → `-0000-0000-0000-`).
- FIX: (a) 14× `@IsUUID()` → decoratore `@IsUuidShape()` in `common/` (gemello di `IsCalendarDate`/`IsClockTime`); (b) regola ESLint che vieti `@IsUUID`; (c) helper id sintetici unificato fra i due seed.

## MEDIO

### P1-004 — La guardia «cliente anonimizzato» esiste in 1 write-path su 4 — MEDIO (correttezza)
- Presente: `bookings.service.ts:813` (`transfer`). Assente: `bookings.service.ts:404` (`create`), `rentals.service.ts:28` (`checkout`), `customers.service.ts:54-63` (`update`), `customers.service.ts:37-44` (`getById`, mentre `list()` `:32` filtra).
- `PATCH /customers/:id` ripopola la PII **senza azzerare `anonymizedAt`** → record con PII fresca che `list()` continua a nascondere = **PII fuori inventario**.
- RADICE: nessun punto unico «cliente attivo del tenant»; ogni chiamante fa la propria `findFirst`. Stessa famiglia dei difetti GDPR già tracciati.
- FIX: `CustomersService.requireActiveCustomer(tx, id)` usato dai 4 write-path.

### P1-005 — Tre convenzioni per lo stesso query-param `date`; due portano a 500 — MEDIO (correttezza/coerenza)
- `bookings-query.dto.ts:5-7` `@IsCalendarDate()`; `map-query.dto.ts:5-7` regex locale (solo forma); `rentals.controller.ts:11` `@Query('date')` **nessuna validazione**.
- `/bookings?date=2026-13-40` → 400; `/map?date=2026-13-40` → **500**; `/rentals?date=pippo` → **500**.
- RADICE: `ValidationPipe({whitelist,transform})` **non valida un `@Query('nome')` scalare** (nessun metatype) → la scorciatoia è silenziosamente ammessa dall'infrastruttura. Usata anche per `includeArchived` (`packages.controller.ts:12`, `equipment-types.controller.ts:12`, `rental-items.controller.ts:11`, `rental-tariffs.controller.ts:12-13,18`) e per `seasonId` (`rental-tariffs.controller.ts:12,18` — id non validato dritto a Prisma).
- FIX: DTO validati ovunque + migrare MapQueryDto a `@IsCalendarDate()` + lint che vieti `@Query` con argomento stringa.

### P1-006 — La risoluzione stagione è duplicata DENTRO il file che la dichiara «single source» — MEDIO (manutenibilità)
- `catalog.service.ts:113-130` (`resolveSeasonWithin`, docstring «single source») e `:156-164` dentro `priceWithin` — identiche riga per riga, stesso `logger.warn`. `priceWithin` NON chiama l'helper pur avendo il `tx`.
- **Terza regola di tie-break divergente**: `customer-booking.projection.ts:57-59` usa «la più specifica = startDate più recente» contro «prima per startDate asc» delle altre due.
- RADICE: `resolveSeasonWithin` non restituisce il `pricing` che serve a `priceWithin` (`SeasonRange` espone solo id/start/end) → API dell'helper inadeguata al chiamante.
- FIX: estendere `SeasonRange`/aggiungere `resolvePricingWithin`; allineare il tie-break della projection o documentare la divergenza.

### P1-007 — `setup-status` dichiara «configurato» con criterio più debole dell'applicabilità reale del pricing — MEDIO (coerenza)
- `setup-status.projection.ts:23` (`rates.complete = usableSeasonsWithRates > 0`) ← `setup-status.service.ts:39-47` conta **qualunque** Rate. `pricing.engine.ts:32-51` (`isApplicable`) filtra su 6 dimensioni e partiziona **duramente** per tipo (ADR-0035 `:36-40`).
- ADR-0054 promette «almeno una stagione usable con una **tariffa applicabile**». `bookings.service.ts:194-199` avverte esplicitamente del rischio.
- Casi con `complete:true` + 422 certo: unica rate `type='subscription'` → ogni daily/periodic 422; unica rate catch-all → ogni subscription 422; unica rate `sectorId=X` → altri settori 422.
- Impatto: pilota lo stepper onboarding **e** la Platform Console (`platform-metrics.service.ts:66`).
- FIX: invertire la dipendenza — chiamare `resolvePrice` con contesto sintetico per tipo, esporre `pricableTypes`.

### P1-008 — Due strategie d'errore in `BookingsService` con contratto d'ordine implicito — MEDIO (manutenibilità)
- A) throw in transazione: `deriveInterval`(239,243,246,250,252,253), `priceAndWrite`(292,337,349,388), `create`(406,410), `renew`(435-462), `throwPriceError`(202-209); idem `renewal-campaigns.service.ts`, `catalog.service.ts`, `rentals.service.ts`.
- B) return `{error}` + mapping a valle: 8 metodi (`settlePayment`, `terminate`, `suspend`, `reactivate`, `transfer`, `setAbsenceConsent`, `releaseAbsence`, `cancelAbsenceRelease`), ~90 righe di boilerplate.
- `reactivate` **le mescola**: `CONFLICT` per return (`:750`) e `ConflictException` per throw (`:759`), stesso messaggio.
- **PERICOLO STRUTTURALE**: la transazione **committa** quando il callback ritorna `{error}` → ogni error-return deve precedere qualunque scrittura. Oggi l'invariante regge (verificato) ma non è espresso né testato né verificabile dal tipo: un `return {error}` inserito dopo una create **committerebbe stato parziale**.
- Drift già presente: `releaseAbsence:946-957` e `cancelAbsenceRelease:1012-1020` mappano gli stessi codici con testi diversi.
- FIX: scegliere UNA strategia in un ADR; se resta B, `DomainError` con dizionario `code→{status,message}` + `mapDomainError`, e rollback esplicito sull'error-return.

### P1-009 — `PasswordHasher` ri-dichiarato in 4 moduli; una giustificazione cita un ciclo INESISTENTE — MEDIO (manutenibilità)
- `identity/identity.module.ts:25-31` **non esporta** la classe. Ri-provveduta in `credential.module.ts:3,10` (giustificazione **corretta**: identity importa credential `:22`), `customer-auth.module.ts:10,32` (giustificazione **FALSA**: identity NON importa customer-auth), `establishment.module.ts:19,44` (nessuna), `platform.module.ts:5,12` (nessuna).
- Oggi innocuo (stateless), ma il giorno in cui i parametri argon2 diventano configurabili nascono 4 configurazioni divergenti.
- RADICE: primitivo crittografico cross-cutting collocato dentro il bounded context `identity`. Il repo ha già il pattern giusto (`PrismaModule`/`TenantModule` `@Global` con exports).
- FIX: `crypto/crypto.module.ts` `@Global` con `PasswordHasher` + `token-hash.ts`; rimuovere le 4 ri-dichiarazioni e i 2 commenti.

### P1-010 — Scrittura listino/noleggio senza `@Roles`, contro la postura fail-closed della struttura — MEDIO (coerenza) → **ESCALATO A P2**
- SENZA `@Roles` (accessibili a `staff`): `seasons.controller.ts`, `rates.controller.ts`, `time-slots.controller.ts`, `packages.controller.ts`, `equipment-types.controller.ts`, `rental-items.controller.ts`, `rental-tariffs.controller.ts`, `rentals.controller.ts`.
- CON `@Roles(Role.Admin)` a livello di classe: `establishment-structure.controller.ts:8`, `rows.controller.ts:10`, `sectors.controller.ts:10`, `umbrella-types.controller.ts:10`, `umbrellas.controller.ts:18`, `platform.controller.ts:12`.
- `umbrellas.controller.ts:13-16` esplicita la dottrina: «Admin-only di default (**fail-closed**: un handler futuro senza @Roles nasce protetto)». catalog e rentals adottano la postura opposta, senza ADR.
- RADICE: `roles.guard.ts:22` `if (!required) return true` — permissivo per assenza. Il fail-closed è ottenuto a mano, controller per controller.
- Verifica: token `staff` → `DELETE /api/seasons/:id` 200 (o 500, cfr P1-002); `DELETE /api/establishment/rows/:id` 403.

## BASSO
- **P1-011** `projectDayMap` O(U²·S²): `map.projection.ts:56-70` (`find`+`filter` sull'intero elenco) dentro 4 cicli annidati `:72-91`. 500 ombrelloni × 3 fasce ≈ 2,2M confronti per `GET /api/map`. Richiamata anche da `reports.service.ts:63`. FIX: `Map<umbrellaId, bookings[]>` una volta all'ingresso (~5 righe).
- **P1-012** `start<end` mappato a **400** in `seasons.service.ts:25`, `time-slots.service.ts:27,54` e a **422** ovunque altrove (~80 casi). I DTO dichiarano il confine («qui solo shape/bound sintattici»). FIX: convertire i 3 a 422.
- **P1-013** `platform-metrics.service.ts:38`: `[await a(), await b(), await c()]` — ha la FORMA di `Promise.all` ma è seriale. Moltiplicato per N tenant da `list()` `:20`. FIX: `await Promise.all([...])`.
- **P1-014** `normalizeName` identica in 4 classi (`catalog.service.ts:272-274`, `sectors.service.ts:16-18`, `umbrella-types.service.ts:21-23`, `rental-catalog.service.ts:21`) + 6 `.trim()` inline; formattazione data che bypassa `common/dates.ts` in 7 punti (ADR-0031 dice «Mai metodi locali»).
- **P1-015** `UmbrellaType` unica entità struttura con SELECT+projection locali (`umbrella-types.service.ts:7-8,17-19`), e lo stesso select riscritto una **terza** volta in `establishment-structure.service.ts:19`.
- **P1-016** Unicità case-insensitive solo applicativa (`mode:'insensitive'`) mentre l'unique DB è case-**sensitive** → 4 entità; `Package` e `TimeSlot` non hanno **né** check **né** unique. `Umbrella` usa correttamente un indice parziale (`schema.prisma:229-232`). FIX: unique su `lower(name)`.
- **P1-017** Commenti che descrivono codice inesistente: `set-password.dto.ts:11-12` cita un campo password in `create-staff-user.dto.ts` che **non esiste**; `seed-report-demo.ts:13-15` «stesso helper» falso (causa di P1-003); `bookings.service.ts:664` codifica l'assunzione che causa P1-001.
- **P1-018** Micro-divergenze: 3 forme di risposta DELETE (`{ok:true}` in `renewal-campaigns.controller.ts:22-25`, 204+void in `bookings.controller.ts:133`, DTO cancellato ovunque); re-export inutile di `UUID_SHAPE` (`create-booking.dto.ts:4-5` → `quote-booking.dto.ts:4`); tipo `Parameters<Parameters<...>>` in `rental-catalog.service.ts:171` dove tutti usano `Prisma.TransactionClient`; `setupStatus_` con underscore.

## IPOTESI VERIFICATE E SCARTATE (dichiarate)
- `cancel()` non tocca BookingCoverage: OK, il trigger `booking_sync_coverage_status_trg` propaga.
- Prisma fuori `forTenant` in 5 service: legittimo, quelle tabelle non hanno RLS (ADR-0026).
- `refundToPrevious ≤ amountCollected` in `cession.payment.ts:22`: documentato ADR-0047 §83.
- Nessun blocco stock in `rentals.checkout`: documentato ADR-0050.
- Finestra-giorno UTC in `rentals.listByDate`: limite MVP documentato ADR-0050.
- Loop `forTenant` O(N): ADR-0040/D-043.
- `ParseUUIDPipe` senza opzioni: regex Nest permissiva, nessuna divergenza.
- **`eslint-disable`/`@ts-ignore`/`@ts-expect-error`/`any`/TODO/FIXME in `apps/api/src`: ZERO occorrenze.**
- Codice morto: 13 simboli campionati, tutti referenziati.
- **Grafo moduli: NESSUN ciclo.**

## RADICI
- **R1 — Invariante dichiarato a livello di sistema, verificato a livello di singolo metodo.** P1-001, P1-007, P1-004. Documento corretto + implementazione parziale, nulla lega i due. Un test d'invariante (`∀coverage: start≤end` dopo OGNI CTA; `setupComplete ⇒ quote(daily)≠422`) li avrebbe fermati tutti e tre. → contatto con partizione test.
- **R2 — Il presidio strutturale esiste ma è sostituito da una copia applicativa a mano.** P1-002 (cascata FK in TS), P1-016 (unicità), P1-001 (nessun CHECK), P1-007 (prezzabilità con count). Il DB potrebbe essere l'autorità e non lo è. → contatto con partizione schema.
- **R3 — Le policy trasversali sono convenzioni ripetute a memoria, non proprietà del sistema.** P1-003 (`@IsUUID` resta usabile), P1-005 (`@Query` scalare sfugge al pipe), P1-010 (RolesGuard permissivo per assenza), P1-008 (due strategie, nessun ADR). Denominatore: **la strada scorretta non costa nulla**. Ogni fix puntuale è a scadenza.
- **R4 — L'API di modulo inadeguata produce l'aggiramento.** P1-006, P1-009. Difetto ripetuto nello STESSO punto per la stessa ragione. Miglior rapporto fix/beneficio: 2 modifiche piccole eliminano 5 occorrenze.
- **R5 — Il commento di razionale come fonte di verità non verificata.** P1-017 + effetti in P1-001 e P1-003. Codebase insolitamente ben commentata → il commento sbagliato è più dannoso perché viene creduto.
