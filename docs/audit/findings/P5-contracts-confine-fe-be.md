# P5 — contracts + confine FE↔BE

## Correzioni al brief (verificate dall'agente)
- `packages/contracts` = **773 LOC**, 116 export in un solo `src/index.ts` (non ~1.5k).
- **ZERO file di test** (non 2). Nessuno script `test` NÉ `typecheck`.
- Sonde allineate: `LoginResponse.accessToken` ✓, `CustomerActivateInput.enrollmentToken`+`pin` ✓.
- `CustomerMeDTO` senza `establishmentId` RISPETTATO da web-customer.
- Lato API disciplinato: 19 `*.projection.ts`, 90+ handler annotati, **zero** `as any`/`as unknown as` in `apps/api/src` fuori dai test.

## Finding

### P5-001 — Niente impedisce a un cambio di contratto di passare inosservato — ALTO (contratto)
- `packages/contracts/package.json`: no `test`, no `typecheck`. Root `package.json`: solo `build:contracts`, `prepare`, `lint`, `format` — **nessun test/typecheck aggregato**.
- **Nessuna CI**: `.github/` non esiste.
- `"types": "./dist/index.d.ts"`, nessun `paths` alias verso `src` → i 5 consumatori typecheckano contro **`dist` committato**, non contro `src`.
- Dimostrazione: rinomina `LoginResponse.accessToken`→`token` in `src/index.ts` senza rebuild → `pnpm --filter @coralyn/web-staff typecheck` PASSA.
- RADICE: package configurato da libreria pubblicata invece che sorgente di workspace.
- FIX: (1) export condizionale `development`→`./src/index.ts` o `paths` alias; (2) `typecheck`/`test` aggregati a root; (3) CI minimale.

### P5-002 — `/api/establishment/legal-profile` restituisce un campo non dichiarato — MEDIO (contratto)
- DTO `contracts:735-746` = 10 campi, **`establishmentId` assente**.
- `legal-profile.service.ts:34-37` `findUnique` SENZA `select` + cast `as Row` + `toDTO` che fa `{...row}` (`:23-25`) → `establishmentId` finisce in risposta. Idem PUT `:45-50`.
- `ValidationPipe({whitelist:true})` in `main.ts` ripulisce solo l'INPUT.
- Test ciechi: unit spec `:14-19` mocka riga già conforme; e2e `:51,57` asserisce campi singoli, mai la forma.
- Unico punto del repo che abbandona la disciplina projection. Nella STESSA classe `getTitolare` (`:60-71`) è corretto.
- RADICE: query aperta + cast che sostituisce la verifica + spread. Canale additivo: una colonna futura finisce in risposta da sola.
- FIX: `legal-profile.projection.ts` con literal esplicito + `select` espliciti; e2e da per-campo a `toEqual`.

### P5-003 — `CustomerBookingDTO`: 4 campi opzionali ma sempre emessi — MEDIO (contratto)
- `contracts:277-280`: `suspensions?`, `transfers?`, `absenceReleases?`, `absenceConsentAt?` — commento dice «sempre valorizzato dal server».
- `customer-booking.projection.ts:41-44`: unico produttore, sempre `?? []` / `?? null`.
- 5 `?? []` difensivi inutili: `CustomerSubscriptionsCard.vue:21,25,35,85`, `AbsenceReleaseModal.vue:32` (staff), `MySubscriptionsView.vue:40`, `AbsenceReleaseModal.vue:30` (customer).
- RADICE: opzionalità di migrazione (D-013/D-035) mai ritirata; aggiornato il commento invece del tipo.
- FIX: promuovere a obbligatori, rimuovere i 5 `?? []`.

### P5-004 — `TimeSlotDTO.startTime/endTime` opzionali per un consumatore legacy inesistente — MEDIO (contratto)
- `contracts:48-49` opzionali; `schema.prisma:176-177` **NOT NULL**; 2 produttori incondizionati (`time-slot.projection.ts:9-10`, `map.projection.ts:42-43`); `CreateTimeSlotInput` li richiede obbligatori.
- Consumatori INCOERENTI: guardia in `MapView.vue:451`, `PricingView.vue:289-290,525`; **nessuna guardia** in `StepTimeSlots.vue:46`.
- RADICE: identica a P5-003.
- FIX: obbligatori, rimuovere commento e 3 guardie.

### P5-005 — Union duplicate NON coperte da D-040 — MEDIO (manutenibilità)
- `BookingType` (fonte `contracts:123`) → 4 copie: `schema.prisma:122`, `create-booking.dto.ts:7`, `create-rate.dto.ts:6`, `update-rate.dto.ts:6`.
- `PaymentMethod` (fonte `contracts:180`) → 4 copie: `schema.prisma:139`, `settle-payment.dto.ts:5`, `SettlePaymentModal.vue:19-24`, `SettleRentalPaymentModal.vue:19-24` (copia letterale).
- `PaymentStatus` (fonte `contracts:177`) → `schema.prisma:133`, `BookingsView.vue:20-25` **NON TIPIZZATA**.
- Insidia: `const TYPES: BookingType[]` verifica appartenenza, NON copertura → aggiungere un membro lascia gli array validi e incompleti, silenziosamente.
- **Nessuna divergente oggi** (verificato valore per valore).
- RADICE (R2): contracts esporta TIPI ma non VALORI → chi serve un elenco a runtime (`@IsIn`, `<Select>`) lo riscrive.
- FIX: `export const BOOKING_TYPES = [...] as const; export type BookingType = typeof BOOKING_TYPES[number];` + estendere D-040.

### P5-006 — Due endpoint con forma non dichiarata in contracts — BASSO (contratto)
- `establishment.controller.ts:23` → `Promise<{id,name}>` ↔ `useEstablishment.ts:28` ridigita la stessa forma a mano.
- `renewal-campaigns.controller.ts:22` → `Promise<{ok:true}>` ↔ `useRenewals.ts:51` senza tipo.
- Unici 2 su 90+ handler. FIX: dichiararli in contracts + regola lint sui type literal inline nei controller.

### P5-007 — `UmbrellaTypeDTO.icon`: 2 produttori 2 regole + commento obsoleto — BASSO (coerenza)
- `contracts:42` commento «FE fallback until the backend exposes it» — **falso**: il backend lo espone, `CreateUmbrellaTypeInput.icon` è obbligatorio.
- `map.projection.ts:35` = `t.icon ?? undefined`; `establishment-structure.projection.ts:27` = `...(t.icon ? {icon:t.icon} : {})` → divergono su `''`.
- FIX: correggere commento, uniformare, tipizzare `UmbrellaIconKey` con D-040.

### P5-008 — `PackageDTO.archived` incoerente con le altre 3 archiviabili — BASSO (coerenza)
- `contracts:154` = `boolean`; le altre 3 (`:129`, `:706`, `:712`) = `true`. Tutti e 4 i produttori emettono `{archived:true}` o chiave assente.
- FIX: allineare a `archived?: true`; valutare `type Archivable = { archived?: true }`.

### P5-009 — `Role` in 3 dichiarazioni, sottoinsieme `'admin'|'staff'` in altre 3 — BASSO (manutenibilità)
- `contracts:2-6` enum; `schema.prisma:111-115` enum; ponte `identity.service.ts:22` `as Role` con commento che ASSERISCE la coincidenza senza verificarla.
- Sottoinsieme riscritto: `contracts:535`, `contracts:579`, `create-staff-user.dto.ts:8`.
- Merito: `establishment.projection.ts:35-36` filtra prima e casta dopo (corretto).
- FIX: `TenantRole` derivato + **un test che asserisca l'uguaglianza dei due insiemi** (sarebbe il primo test di contracts).

### P5-010 — `packages/contracts/dist/` tracciato in git ma coperto da `.gitignore:25` — BASSO
- `dist/index.d.ts`, `index.js`, `index.js.map` tracciati; `.gitignore` non agisce sui file già tracciati.
- Oggi ALLINEATO a src (116 export, stesso commit `61c229c`).
- Moltiplicatore di P5-001. FIX: risolto P5-001, `git rm -r --cached`.

### P5-011 — Nessuna documentazione dei contratti — BASSO (documentazione)
- Nessun README in `packages/contracts`, nessun OpenAPI/Swagger nel repo. Solo JSDoc (di buona qualità, citano ADR/deferred).
- FIX: README con tabella endpoint→DTO (generabile: i controller sono già annotati).

## Superficie pubblica
14 handler `@Public()`. **Una sola** osservabile dall'esterno: `GET /api/public/informativa/:establishmentId` (obbligo art. 14.3(a) GDPR + art. 7 D.Lgs. 70/2003). Il suo produttore è CORRETTO (`legal-profile.service.ts:60-71`, literal esplicito) e ha e2e dedicato. Nessun webhook. Nessun versionamento contracts — proporzionato, non segnalato come difetto.

## Buco strutturale di copertura
- e2e: 27 `toEqual` vs 34 `toMatchObject`/`objectContaining` → la maggioranza non vincola la forma.
- `apps/web-staff/src/mocks/server.ts` = **699 righe, 89 handler MSW** = seconda implementazione dell'API. Risposte via `HttpResponse.json(x)` che accetta qualsiasi cosa; `:693` ricalcola `paymentStatus` duplicando `booking.payment.ts:32,39`.
  → **se mock e API divergono, i test FE restano verdi e la produzione si rompe.**

## Radici
- **R1** contracts configurato da libreria pubblicata → P5-001, P5-010. Massima leva.
- **R2** contracts esporta tipi ma non valori → P5-005 + D-040.
- **R3** opzionalità di migrazione mai ritirata → P5-003, P5-004, P5-008. Sintomo testuale: «sempre valorizzato dal server» accanto a `?` (3 occorrenze in index.ts).
- **R4** disciplina projection = convenzione non applicata → P5-002, P5-006.
- **R5** mock scritti dalla forma ATTESA non REALE → nasconde P5-002; `mocks/server.ts` duplica logica di dominio.

## Non verificati end-to-end (dichiarato)
`PlatformEstablishmentDTO`, `CreateEstablishmentResponse`, `ResetAdmin/StaffPasswordResponse`, `RenewalCampaign*`, `RenewalWindow*`, `SubscriptionListItemDTO`, `TransferDTO`, `CededSubscriptionDTO`, `AbsenceReleaseDTO`, `BookingQuoteDTO`, `QuoteBookingInput`, `CredentialSetupContext`, `SetPasswordInput`, `GenerateUmbrellas*`, `BulkDelete*`, `BulkAssign*`, `RentalsDayDTO`, `RentalAvailabilityDTO`, e gli `*Input` di scrittura non citati.

## DA VERIFICARE IO in sintesi
- [ ] Assenza CI (`.github/`) — claim forte, conferma.
- [ ] P5-002: `establishmentId` davvero in risposta (leggere il codice).
- [ ] P5-001: il typecheck legge davvero `dist` e non `src`.
