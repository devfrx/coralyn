# Consolidamento Catalogo — Slice "Chiarezza tipi prenotazione" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02. **Da pianificare ed
  eseguire nella prossima sessione** (ADR-0009).
- **Origine:** emerso testando B2 dal vivo. L'utente non capiva la differenza fra **Periodica** e **Abbonamento** —
  né in creazione tariffa, né in prenotazione, né nel calcolo del prezzo. Sequenza roadmap: B1 (fasce, merged) → B2
  (provenienza, merged) → **questo slice** → Slice C (equipment).
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio
  prenotazioni/pricing), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (dimensioni Rate +
  precedenza — questo slice **rimuove `unit`** come dimensione di calcolo), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
  (fasce), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date di calendario), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (post-B2 su `main`, verificata
  live 2026-07-02): **api unit 89 · api e2e 126 · web-staff 141 · ui-kit 55.**
- **Richiede una MIGRAZIONE** (drop colonna `Rate.unit` + enum `RateUnit`). Pre-release: nessun dato di produzione.
  **Nessun nuovo ADR** (incremento su ADR-0032/ADR-0006). Prossimo ADR libero: **0035**.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **`BookingType`** = `daily | periodic | subscription`. Determina **l'intervallo** della prenotazione
  (`BookingsService.deriveInterval`, `bookings.service.ts:81-102`):
  - `daily` → 1 giorno (`endDate == startDate`, vietato passare `endDate`);
  - `periodic` → intervallo `[startDate, endDate]` **scelto** (richiede `endDate`, entro la stagione);
  - `subscription` → **stagione intera** (auto: `season.startDate → season.endDate`, vietato passare `endDate`).
- **`Rate.unit`** (`RateUnit = day | period`, `schema.prisma:203,258`) determina **come si calcola** il prezzo
  (`pricing.engine.ts:90-92`): `unit === 'day'` → `price × giorni`; `unit === 'period'` → `price` (forfait). L'engine
  usa **solo `unit`**, non `type`, per il calcolo.
- **`type` e `unit` sono ortogonali e non vincolati.** Si possono creare tariffe insensate — es. **Abbonamento +
  `unit=day`** → `price × ~120 giorni` (la stagione), cifra assurda: la **trappola** che l'utente teme. Nessuna
  validazione lo impedisce (`create-rate.dto.ts`: `type` e `unit` sono `@IsIn` indipendenti).
- **UX:** nel modale prenotazione (`MapView.vue:326-329`) i tre tipi sono un `<Select>` secco; solo l'abbonamento
  mostra "Durata: stagione intera". Nel modale tariffa (`PricingView.vue`) `Tipo` e `Unità` sono due selettori
  scollegati. Nessuno spiega la differenza.
- **Decisione dell'utente (brainstorming):** l'**abbonamento è SEMPRE un forfait** di stagione (prezzo fisso, es.
  800€); il **periodico è SEMPRE a giornata** (`price × giorni`) — il forfait-periodo **non serve ora** (→ **D-034**).

## 2. Obiettivo e scope

Rendere i tipi **chiari e a prova di errore**: il **come si calcola** smette di essere un campo libero della tariffa
e diventa una **conseguenza del tipo di prenotazione**. Si **rimuove `unit`** dalla `Rate`. Tre layer:

1. **Backend — modello:** migrazione (drop `Rate.unit` + enum `RateUnit`); il motore calcola dal `type`; rimozione di
   `unit` da contratti/DTO/proiezioni/engine/seed.
2. **FE editor (Listino):** via il selettore "Unità"; la colonna Prezzo mostra il significato derivandolo dal **tipo
   della tariffa**.
3. **FE prenotazione (MapView):** `matchedRateLabel` deriva il "/g vs forfait" dal **tipo corrente**; **+ spiegazione
   inline per ogni tipo** nel modale.

**Regola di calcolo (nuova, unica):**
| Booking type | Prezzo |
|---|---|
| `daily` | `price × 1` |
| `periodic` | `price × giorni` (estremi inclusi) |
| `subscription` | `price` (forfait; giorni **ignorati**) |

Il `price` di una tariffa `type=subscription` è **il forfait di stagione**; di una `daily`/`periodic` è **il prezzo al
giorno**. La stagione definisce solo *l'intervallo* dell'abbonamento (disponibilità/mappa), **non** entra nel prezzo.
La trappola "×120" sparisce alla radice.

- **Fuori scope (deliberato):**
  - **Forfait per il periodico** (pacchetto-settimana a prezzo fisso) → **D-034** (il "per ora" dell'utente).
  - Ripensare le dimensioni di prezzo o le precedenze (ADR-0032 resta invariato, tranne la rimozione di `unit`).

## 3. Layer 1 — Backend: il calcolo si deriva dal tipo, via `unit`

### 3.1 Migrazione (Prisma)
- **Schema** (`apps/api/prisma/schema.prisma`): rimuovi il campo `unit RateUnit` da `model Rate` (`:258`) e l'`enum
  RateUnit` (`:203`) se non più referenziato. **La firma di unicità della `Rate` è un indice RAW `Rate_signature_key`**
  (`("pricingId","type","sectorId","rowId","packageId","timeSlotId","periodStart","periodEnd") NULLS NOT DISTINCT`,
  creato dalla migrazione `20260630203447_pricing`; NON è un `@@unique` Prisma) e **NON include `unit`** — quindi il
  drop **non tocca la firma**.
- `prisma migrate dev --name drop_rate_unit`. ⚠️ **Gotcha noto:** `migrate dev` ri-propone sempre uno spurio
  `DROP INDEX "Rate_signature_key"` → **rimuovilo** dal `migration.sql` generato (non è drift; l'indice è raw, vedi
  D-032). Verifica `prisma migrate status` pulito dopo.

### 3.2 Engine (`pricing.engine.ts`)
- `RateRow` perde `unit`. `PriceResult.rate` resta `RateRow` (senza `unit`).
- Il calcolo in `resolvePrice` diventa (il `ctx.type` è già in `PricingContext`):
  ```ts
  const days = daysInclusive(ctx.startDate, ctx.endDate);
  const totalPrice = ctx.type === 'subscription' ? round2(best.price) : round2(best.price * days);
  ```
- `isApplicable`/`specificity` invariati. Aggiorna `pricing.engine.spec.ts` (il factory `rate()` toglie `unit`; i casi
  `unit=period` diventano casi `type=subscription`; aggiungi un caso "subscription → forfait, giorni ignorati" e
  "periodic → price × giorni").

### 3.3 Contratti (`packages/contracts/src/index.ts`)
- Rimuovi `unit` da `RateDTO`; rimuovi il type `RateUnit`. `CreateRateInput` (= `Omit<RateDTO,'id'>`) e
  `UpdateRateInput` perdono `unit` di conseguenza. `BookingQuoteDTO.matchedRate` è `RateDTO` → eredita (nessun `unit`).

### 3.4 Service / proiezioni / DTO
- `rate.projection.ts` (`toRateDTO`): togli `unit`.
- `catalog.service.ts`: `toRateRow` e `rateRowToDTO` (introdotto in B2) tolgono `unit`.
- `rates.service.ts`: `create`/`update` non scrivono/leggono più `unit`.
- `dto/create-rate.dto.ts` + `dto/update-rate.dto.ts`: rimuovi il campo `unit` + la costante `UNITS` + l'import
  `RateUnit`. Aggiorna `create-rate.dto.spec.ts`.
- **Seed:** `apps/api/prisma/seed.ts` e l'helper e2e `apps/api/test/helpers/seed-pricing.ts` (centrale, usato da molti
  e2e) tolgono `unit` dai rate seedati. Questo sistema in un punto la maggior parte delle e2e; **le asserzioni** che
  citano `unit` (`rates.e2e-spec.ts`, `bookings.e2e-spec.ts`, ecc.) vanno comunque adeguate.
- **e2e nuovo/adeguato:** un abbonamento con una tariffa `type=subscription, price=800` → quote `totalPrice: 800`
  (forfait, indipendente dai giorni di stagione); un periodico di N giorni con catch-all a `price` → `price × N`.

## 4. Layer 2 — FE editor (Listino)

- `PricingView.vue`: **rimuovi** il selettore "Unità" dal modale tariffa (`rUnit`, `UNIT_OPTIONS`, la `<Select>`
  unità); `submitRate` non invia più `unit`.
- **Colonna Prezzo:** il "significato" del prezzo si deriva ora dal **tipo della tariffa** (`unitLabel` diventa
  `priceHint(r)`): `r.type === 'subscription'` → "forfait/stagione"; altrimenti → "/giorno". (Una tariffa `type=Tutti`
  serve soprattutto le giornaliere/periodiche → "/giorno".)
- **Test (`PricingView.spec.ts`):** il modale tariffa non ha più "Unità"; una tariffa `type=subscription` mostra il
  suffisso "forfait", una giornaliera "/giorno". Aggiorna/rimuovi i test che sceglievano `unit`.

## 5. Layer 3 — FE prenotazione (MapView) + chiarezza

- `matchedRateLabel` (`MapView.vue`, introdotta in B2) non usa più `matchedRate.unit` (rimosso): il suffisso prezzo si
  deriva dal **tipo corrente** (`bookingType`): `subscription` → "forfait stagione"; altrimenti → "€X/g" (× giorni per
  il periodico). La riga "Tariffa applicata: «…»" resta.
- **Spiegazione dei tipi** nel modale prenotazione: una riga di aiuto sotto il `<Select>` tipo, che cambia col tipo
  scelto:
  - `daily` → "Un giorno.";
  - `periodic` → "Scegli le date; paghi a giornata (prezzo × giorni).";
  - `subscription` → "Tutta la stagione, prezzo forfait." (sostituisce/estende l'attuale "Durata: stagione intera").
- **Test (`MapView.spec.ts`):** cambiando il tipo, la riga di spiegazione cambia; per un abbonamento la label mostra
  "forfait", per una giornaliera "/g". Aggiorna i test B2 che asserivano il suffisso via `unit`.

## 6. Rischi e mitigazioni
- **Ripple ampio di `unit`** (schema, engine, contratti, 2 DTO, proiezioni, 2 viste FE, ~10 file di test via
  `seed-pricing.ts`): mitigato dall'helper centrale del seed e da un ordine di layer che tiene ogni commit verde
  (backend prima, poi FE). Dopo il tocco a `@coralyn/contracts`: `pnpm --filter @coralyn/contracts build` +
  `rm -rf apps/web-staff/node_modules/.vite`.
- **Migrazione:** drop pulito (nessun impatto su firma/unique). Rimuovi lo spurio `DROP INDEX Rate_signature_key` dal
  `migration.sql`. Verifica `migrate status` pulito. Rebuild container prima del test dev (gotcha handoff).
- **Rinnovi invariati:** un rinnovo crea un abbonamento → forfait; nessun cambiamento a `RenewalCampaign`/`priceAndWrite`
  (che ricalcola il prezzo via engine).
- **Prezzo server-autoritativo invariato** (ADR-0032 §7): solo la *formula* cambia (da `unit` a `type`); la create
  continua a ricalcolare.

## 7. Decisioni (risolte in brainstorming 2026-07-02)
1. **Opzione 1 scelta:** il calcolo si deriva dal **tipo di prenotazione**; il campo `unit` della `Rate` viene
   **rimosso**. (Alternativa scartata: tenere `unit` e vincolarlo per tipo — lascia aperta la trappola sul wildcard
   catch-all, vedi brainstorming.)
2. **Abbonamento = forfait** (`price`, giorni ignorati). **Periodica/Giornaliera = a giornata** (`price × giorni`).
3. **Periodico sempre a giornata** ("per ora"): il **forfait-periodo** è rimandato a **D-034**.
4. **Nessun avviso "manca tariffa Abbonamento"** (YAGNI): la trasparenza di B2 mostra già quale tariffa ha vinto, e con
   il forfait non c'è più l'esplosione ×120. *Sotto-decisione minore: se in fase di piano l'utente lo vuole, è
   un'aggiunta additiva all'editor — confermare, ma default = niente avviso.*
5. **Migrazione sì, nuovo ADR no** (incremento su ADR-0032: si rimuove `unit` come dimensione di calcolo).

## 8. Impatto test (atteso, da non regredire)
Baseline: api unit 89 · api e2e 126 · web-staff 141 · ui-kit 55. Attesi: engine spec ricablato su `type`; e2e rate/quote
senza `unit` (+ caso abbonamento forfait); FE editor senza selettore unità; FE prenotazione con spiegazioni tipo.
Nessun test rimosso senza sostituto. Prossimo ADR libero: **0035**.

## 9. Slice successivo (dopo questo)
**Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment` (`schema.prisma:208-212`;
FE oggi edita solo `sunbeds`). Decisione da prendere con l'utente: free-form JSONB (rec: YAGNI) vs entità
`EquipmentType` (→ nuovo ADR, confina con D-012). Brainstorming+spec dedicati.
