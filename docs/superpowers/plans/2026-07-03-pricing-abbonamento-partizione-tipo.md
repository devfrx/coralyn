# Pricing — Abbonamento partizione tipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un abbonamento è prezzato **solo** da tariffe `type='subscription'`; il wildcard `type=null` è la famiglia a prezzo/giorno (daily/periodic), mai il forfait — eliminando alla radice il bug "Abbonamento prezzato €28-come-forfait invece di €800".

**Architecture:** Partizione dura del tipo nel motore puro (`isApplicable`): per `ctx.type === 'subscription'` sono applicabili solo le tariffe `subscription`; daily/periodic invariati (il wildcard applica). Precedenza (`compareSpecificity`) **invariata**. Messaggio 422 `NO_RATE` reso type-aware per l'abbonamento. Nuovo ADR-0035 che raffina ADR-0032 §1. **Nessuna migrazione, nessun cambio FE.**

**Tech Stack:** NestJS + Prisma (apps/api), Jest (unit + e2e supertest), Postgres 16. TypeScript. Codice/DB inglese, UI/doc italiano.

## Global Constraints

- **Baseline test da NON regredire** (su `main`, post-Archiviazione, verificata live 2026-07-03): **api unit 91 · api e2e 129 · web-staff 148 (globa ui-kit) · ui-kit standalone 55**. Atteso post-slice: **+3 unit, +1 e2e**, **0 FE**.
- **Nessuna migrazione DB** (logica pura + messaggio + doc).
- **Precedenza invariata**: `specificity`/`compareSpecificity` non si toccano (spec §3.2).
- **FE invariato**: nessun avviso editor (spec §7.5); il mock MSW già ritorna €800 per subscription.
- **Branch nuovo da `main`** (ADR-0009). `BookingType` = `'daily' | 'periodic' | 'subscription'` (già importato in `bookings.service.ts:11`).
- **Un commit per layer**: 1 motore (engine+spec) · 1 service (service+e2e) · 1 doc (ADR-0035 + rimando ADR-0032).
- Comandi test (root repo, `corepack pnpm`): unit `--filter @coralyn/api test`; e2e `--filter @coralyn/api test:e2e` (carica `.env.test` dal ROOT). Il warning Jest "worker failed to exit gracefully" è rumore di teardown pre-esistente, non un fallimento.

---

## File Structure

- `apps/api/src/catalog/pricing.engine.ts` — **modifica** `isApplicable` (partizione tipo). Unica riga di sostanza cambiata (il check `type`).
- `apps/api/src/catalog/pricing.engine.spec.ts` — **modifica** (1:1 del test subscription→forfait) + **3 test additivi**.
- `apps/api/src/bookings/bookings.service.ts` — **modifica** `throwPriceError` (param `type`, ramo subscription) + 2 call site.
- `apps/api/test/bookings.e2e-spec.ts` — **1 test additivo** (subscription senza tariffa Abbonamento → 422 specifico), setup stagione 2028 catch-all-only inline.
- `docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md` — **nuovo** ADR.
- `docs/architecture/decisions/0032-pricing-engine-precedenza.md` — **modifica** (una riga di rimando ad ADR-0035, senza riscrivere la decisione).

---

## Task 1: Motore — partizione dura del tipo in `isApplicable`

**Files:**
- Modify: `apps/api/src/catalog/pricing.engine.ts:32-44` (funzione `isApplicable`, check tipo `:33`)
- Test: `apps/api/src/catalog/pricing.engine.spec.ts` (modifica `:79-82`, +3 test)

**Interfaces:**
- Consumes: `resolvePrice(ctx: PricingContext, rates: RateRow[]): PriceResult` (esistente, firma invariata). `PricingContext.type: BookingType`; `RateRow.type: BookingType | null`.
- Produces: nessuna nuova firma pubblica. Comportamento nuovo: per `ctx.type === 'subscription'` solo le `RateRow` con `type === 'subscription'` sono applicabili; per daily/periodic il wildcard (`type === null`) continua ad applicare.

- [ ] **Step 1: Aggiorna 1:1 il test "subscription → forfait" e aggiungi i 3 test additivi**

In `apps/api/src/catalog/pricing.engine.spec.ts`, **sostituisci** il test esistente alle righe 79-82:

```ts
  it('subscription -> forfait, indipendente dai giorni', () => {
    const r = resolvePrice(ctx({ type: 'subscription', startDate: '2026-07-15', endDate: '2026-07-20' }), [rate({ price: 200 })]);
    expect(r).toMatchObject({ totalPrice: 200 });
  });
```

con (la premessa cambia: un abbonamento è prezzato da una tariffa **subscription**, non da una wildcard):

```ts
  it('subscription -> forfait, indipendente dai giorni (tariffa subscription-specifica)', () => {
    const r = resolvePrice(
      ctx({ type: 'subscription', startDate: '2026-07-15', endDate: '2026-07-20' }),
      [rate({ type: 'subscription', price: 200 })],
    );
    expect(r).toMatchObject({ totalPrice: 200 });
  });

  it('subscription: la tariffa Abbonamento (800) batte una fascia-specifica wildcard (28) — il bug esatto', () => {
    const fasciaWildcard = rate({ timeSlotId: 'slot-am', price: 28 }); // type=null, fascia-specifica
    const abbonamento = rate({ type: 'subscription', price: 800 });    // subscription, fascia null
    const r = resolvePrice(ctx({ type: 'subscription' }), [fasciaWildcard, abbonamento]);
    expect(r).toMatchObject({ ok: true, totalPrice: 800 });
  });

  it('subscription: con solo catch-all wildcard -> NO_RATE (partizione: il wildcard non prezza l abbonamento)', () => {
    expect(resolvePrice(ctx({ type: 'subscription' }), [CATCH_ALL])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('partizione non regredisce per/day: daily e periodic sono ancora prezzati dal catch-all wildcard', () => {
    expect(resolvePrice(ctx({ type: 'daily' }), [CATCH_ALL])).toMatchObject({ ok: true, totalPrice: 28 });
    const per = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [CATCH_ALL]);
    expect(per).toMatchObject({ ok: true, totalPrice: 84 }); // 28 x 3 giorni
  });
```

- [ ] **Step 2: Esegui i test e verifica che i nuovi FALLISCANO (motore ancora vecchio)**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine.spec`
Expected: FAIL. Il test "bug esatto" fallisce (pre-fix: la fascia-specifica €28 vince, `totalPrice: 28` invece di 800). Il test "solo catch-all → NO_RATE" fallisce (pre-fix: il catch-all applica, ritorna `ok: true, totalPrice: 28`). I test 1:1 e "non regredisce" passano già (verde su entrambe le premesse — sono guardie).

- [ ] **Step 3: Applica la partizione in `isApplicable`**

In `apps/api/src/catalog/pricing.engine.ts`, **sostituisci** la riga 33:

```ts
  if (r.type !== null && r.type !== ctx.type) return false;
```

con:

```ts
  // Partizione dura del tipo (ADR-0035, raffina ADR-0032 §1): 'subscription' ha formula forfait
  // (non prezzo/giorno) e dev'essere prezzato SOLO da tariffe esplicitamente subscription. Il wildcard
  // (type=null) rappresenta la famiglia a prezzo/giorno (daily/periodic), NON il forfait di stagione.
  if (ctx.type === 'subscription') {
    if (r.type !== 'subscription') return false;
  } else if (r.type !== null && r.type !== ctx.type) {
    return false;
  }
```

- [ ] **Step 4: Esegui i test e verifica che TUTTI passino**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine.spec`
Expected: PASS (tutti i test del file, inclusi i 3 nuovi).

- [ ] **Step 5: Esegui l'intera suite unit e verifica il conteggio**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS, **94 test** (91 baseline + 3 additivi; il test 1:1 è modificato, non aggiunto).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/catalog/pricing.engine.ts apps/api/src/catalog/pricing.engine.spec.ts
git commit -m "fix(pricing): abbonamento prezzato solo da tariffe subscription (partizione tipo)"
```

---

## Task 2: Service — 422 specifico per abbonamento senza tariffa Abbonamento

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts:50-56` (`throwPriceError`), call site `:71` (`quote`) e `:197` (`priceAndWrite`)
- Test: `apps/api/test/bookings.e2e-spec.ts` (+1 test)

**Interfaces:**
- Consumes: dalla Task 1, il motore ora ritorna `NO_RATE` per una prenotazione `subscription` priva di tariffa `subscription`. `BookingType` è già importato in `bookings.service.ts:11`. `QuoteOutcome` (da `../catalog/catalog.service`) è già importato.
- Produces: `throwPriceError(outcome: Extract<QuoteOutcome, { ok: false }>, type: BookingType): never` — firma con parametro `type` aggiunto. Per `NO_RATE` + `type==='subscription'` lancia 422 "Nessuna tariffa Abbonamento configurata per questa stagione"; altrimenti il generico.

- [ ] **Step 1: Scrivi il test e2e (subscription senza tariffa Abbonamento → 422 specifico)**

In `apps/api/test/bookings.e2e-spec.ts`, dentro il `describe('subscription ...')` esistente (accanto ai test subscription — cfr. `:218` e `:256`), aggiungi. Crea inline una stagione 2028 col **solo catch-all** (nessuna tariffa subscription), poi prenota un abbonamento in quella stagione:

```ts
    it('subscription senza tariffa Abbonamento nella stagione -> 422 con messaggio specifico', async () => {
      // Stagione 2028 con listino SOLO catch-all (nessuna tariffa subscription): esercita la partizione.
      await prisma.forTenant(s1, async (tx) => {
        const season2028 = await tx.season.create({
          data: {
            establishmentId: s1,
            name: 'Estate 2028',
            startDate: new Date('2028-05-01T00:00:00Z'),
            endDate: new Date('2028-09-30T00:00:00Z'),
          },
        });
        const pricing2028 = await tx.pricing.create({ data: { establishmentId: s1, seasonId: season2028.id } });
        await tx.rate.create({ data: { establishmentId: s1, pricingId: pricing2028.id, price: 30 } }); // solo catch-all
      });

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2028-07-01' }))
        .expect(422);
      expect(res.body.message).toBe('Nessuna tariffa Abbonamento configurata per questa stagione');
    });
```

> Nota per l'implementer: `uSub` è l'ombrellone dedicato agli abbonamenti già in uso nel blocco subscription (cfr. `:218-220`). Verifica il nome esatto della variabile nel `describe` (potrebbe essere `uSub`); usa quella già in scope. Il cleanup è coperto dal `cleanPricingTenant`/`afterAll` esistente (cancella tutte le rate/pricing/season del tenant `s1`).

- [ ] **Step 2: Esegui l'e2e e verifica che il nuovo test FALLISCA sul messaggio**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings.e2e`
Expected: FAIL sul nuovo test. Con la Task 1 già applicata il motore ritorna `NO_RATE`, quindi la risposta è **422** (l'`.expect(422)` passa) ma il messaggio è ancora il generico "Nessuna tariffa applicabile: configurare il listino" → l'assert su `res.body.message` fallisce.

- [ ] **Step 3: Rendi `throwPriceError` type-aware**

In `apps/api/src/bookings/bookings.service.ts`, **sostituisci** `throwPriceError` (righe 50-56):

```ts
  /** Lancia il 422 di dominio col messaggio IT per un esito di pricing fallito. */
  private throwPriceError(outcome: Extract<QuoteOutcome, { ok: false }>, type: BookingType): never {
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    // NO_RATE — messaggio type-aware (ADR-0035): un abbonamento senza tariffa dedicata non è mai
    // prezzato dal wildcard; il no-match è esplicito, mai un forfait silenzioso.
    if (type === 'subscription')
      throw new UnprocessableEntityException('Nessuna tariffa Abbonamento configurata per questa stagione');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino');
  }
```

- [ ] **Step 4: Aggiorna i due call site**

In `bookings.service.ts`, call site 1 (`quote`, riga 71) — **sostituisci**:

```ts
      if (!outcome.ok) this.throwPriceError(outcome);
```
con:
```ts
      if (!outcome.ok) this.throwPriceError(outcome, input.type);
```

Call site 2 (`priceAndWrite`, riga 197) — **sostituisci** la seconda occorrenza identica:

```ts
    if (!outcome.ok) this.throwPriceError(outcome);
```
con:
```ts
    if (!outcome.ok) this.throwPriceError(outcome, p.type);
```

> Sono gli **unici due** call site di `throwPriceError`. Verifica con `git grep -n throwPriceError apps/api/src/bookings/bookings.service.ts` che entrambi ora passino il `type`.

- [ ] **Step 5: Esegui l'e2e e verifica che tutto passi**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings.e2e`
Expected: PASS (incluso il nuovo test; €800/€850 e i test subscription esistenti invariati).

- [ ] **Step 6: Esegui l'intera suite e2e e verifica il conteggio**

Run: `corepack pnpm --filter @coralyn/api test:e2e`
Expected: PASS, **130 test** (129 baseline + 1 additivo). `renewal-campaigns.e2e` e `bookings.e2e` verdi.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "feat(bookings): 422 specifico per abbonamento senza tariffa Abbonamento"
```

---

## Task 3: Documentazione — ADR-0035 + rimando in ADR-0032

**Files:**
- Create: `docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md`
- Modify: `docs/architecture/decisions/0032-pricing-engine-precedenza.md` (header + §1: riga di rimando)

**Interfaces:**
- Consumes: nulla (documentazione). Riferisce le decisioni implementate in Task 1 e Task 2.
- Produces: nessun contratto di codice.

- [ ] **Step 1: Crea l'ADR-0035**

Crea `docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md`:

```markdown
# ADR-0035: Il tipo prenotazione partiziona la formula di prezzo (abbonamento ≠ wildcard)

- **Status:** Accepted
- **Data:** 2026-07-02
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0032](0032-pricing-engine-precedenza.md) (**raffinato** da questo ADR: §1 semantica wildcard),
  [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (dominio pricing),
  [ADR-0009](0009-documentazione-di-design.md) (workflow). Spec:
  `docs/specs/2026-07-02-pricing-abbonamento-partizione-tipo-design.md`.

## Context

[ADR-0032](0032-pricing-engine-precedenza.md) definì `type` come una normale dimensione-filtro con `type=null`
"wildcard" (vale per qualsiasi tipo, abbonamento incluso) e `type` come **ultima** dimensione di precedenza (la più
debole). All'epoca il prezzo era guidato da `Rate.unit` (`day`/`period`).

Lo slice "Chiarezza tipi prenotazione" (2026-07-02) ha **cambiato il ruolo di `type`**: ora è `type` a determinare la
**formula** — `subscription` → forfait di stagione, `daily`/`periodic` → prezzo × giorni — e `unit` è stato rimosso. La
precedenza (`type` ultimo) non fu rivista dopo quel cambio: da lì il debito.

**Bug emerso dal vivo.** Un abbonamento (Giorno Intero) veniva prezzato **€28** — una tariffa fascia-specifica a
`type=null` — invece della tariffa dedicata **Abbonamento €800**. Il wildcard `type=null` combaciava con `subscription`;
nella precedenza la fascia (dimensione 5) batte il tipo (dimensione 6), così la tariffa €800 (specifica solo su `type`,
l'ultima dimensione) era **irraggiungibile** ogni volta che esisteva una tariffa fascia-specifica a `type=null`.
Aggravante: per un abbonamento il prezzo vincente è usato **come forfait di stagione**, quindi un prezzo *al giorno* (€28)
diventava il prezzo dell'intera stagione. Errore di categoria.

## Decision

**Il tipo partiziona la formula.** Il prezzo di una tariffa è un valore *al giorno*; il wildcard `type=null` rappresenta
la famiglia **a prezzo/giorno** (`daily`/`periodic`), **non** il forfait. Un abbonamento ha una formula diversa (forfait
di stagione) e va prezzato **solo** da una tariffa `type='subscription'`.

Operativamente, nel motore puro (`pricing.engine.ts`, `isApplicable`):

- **`ctx.type === 'subscription'`**: applicabili **solo** le tariffe con `type === 'subscription'`. Le tariffe wildcard
  (`type=null`) e quelle daily/periodic sono **escluse**.
- **`ctx.type ∈ {daily, periodic}`**: comportamento **invariato** — il wildcard `type=null` continua ad applicarsi; una
  tariffa `type='subscription'` non è mai applicabile (già escluso dal check `r.type !== ctx.type`), quindi nessun forfait
  moltiplicato ×giorni.

**Raffinamento di ADR-0032 §1.** `type=null` non significa più "qualsiasi tipo, abbonamento incluso" ma "famiglia a
prezzo/giorno (daily/periodic)". L'abbonamento è una famiglia **forfait partizionata** che richiede una tariffa
`type='subscription'`.

**Precedenza invariata.** `specificity`/`compareSpecificity` (l'ordine periodo › fila › settore › pacchetto › fascia ›
tipo) **non** cambiano. La partizione è sufficiente:
- Tra le tariffe subscription (tutte `type='subscription'`) `tipo` è costante → la sua posizione è irrilevante; la
  specificità normale (periodo/fila/settore/pacchetto/fascia) decide correttamente.
- Tra le tariffe a prezzo/giorno, `tipo`-ultimo distingue ancora una tariffa daily-specifica dalla catch-all senza
  scavalcare la specificità di posizione. Riordinare introdurrebbe effetti indesiderati su daily/periodic senza servire il
  problema.

**No-match esplicito (mai forfait silenzioso).** Un abbonamento in un listino privo di tariffa `subscription` produce
`NO_RATE` → **422** con messaggio dedicato "Nessuna tariffa Abbonamento configurata per questa stagione" (coerente con
ADR-0032 §6, "mai €0/prezzo silenzioso"). Il messaggio generico resta per gli altri no-match.

## Consequences

### Positive
- **Errore di categoria eliminato alla radice**: un prezzo/giorno non può più essere reinterpretato come forfait di
  stagione. Il fix non dipende dalla presenza o meno di una tariffa fascia-specifica.
- **Diagnostica chiara**: un listino senza tariffa Abbonamento dà un 422 che indica esattamente cosa manca, invece di un
  forfait errato silenzioso.
- **Precedenza intatta**: nessun rischio di regressione su daily/periodic da un riordino delle dimensioni.

### Negative / Trade-off
- **Cambio di comportamento osservabile (voluto)**: un listino privo di tariffa Abbonamento ora **rifiuta** (422) le
  prenotazioni Abbonamento invece di prezzarle col wildcard. Un listino ben formato con tariffa Abbonamento non è
  impattato (il seed dev/e2e la contiene già).

### Neutre / Note
- **Nessuna migrazione**: cambia solo la logica del motore puro + un messaggio 422 + questa doc.
- **FE invariato**: il modale già gestisce il 422 (blocca il confirm, mostra il messaggio del server); nessun avviso
  editor (deciso NO nello slice "Chiarezza tipi" §7.4).

## Alternatives considered

- **Solo riordino della precedenza** (portare `tipo` più in alto): fa vincere €800 su €28 *in questo caso*, ma con la sola
  catch-all €28 e nessuna tariffa Abbonamento l'abbonamento verrebbe ancora prezzato €28-come-forfait → fix parziale,
  debito residuo. Scartata.
- **Guard/avviso a motore invariato**: tampone, non elimina la causa (il wildcard resterebbe applicabile). Scartata.

## Rubric check

1. **Professionalità** — il fix è alla radice (partizione della formula), non un riordino tattico; il no-match esplicito a
   422 è la scelta sicura di un engine di pricing.
2. **Convenzioni** — motore puro unit-testato in isolamento (coerente con ADR-0032 §4); messaggi di dominio in italiano,
   codice in inglese (ADR-0030).
3. **Modularità** — la partizione vive interamente in `isApplicable` (motore `catalog`); il messaggio type-aware nel
   `BookingsService`; nessuna dipendenza nuova.
4. **Zero debito** — il debito lasciato aperto da "Chiarezza tipi" (precedenza non rivista dopo il cambio di ruolo di
   `type`) è qui chiuso e tracciato; la precedenza resta invariata per scelta motivata, non per inerzia.
```

- [ ] **Step 2: Aggiungi il rimando in ADR-0032**

In `docs/architecture/decisions/0032-pricing-engine-precedenza.md`, nella lista **ADR correlati** dell'header (righe 6-11), aggiungi la voce:

```markdown
  [ADR-0035](0035-pricing-tipo-partiziona-la-formula.md) (**raffina** questo ADR: §1 semantica wildcard di `type`),
```

Poi, in fondo alla sezione **§1. Dimensioni della `Rate` e wildcard** (dopo la riga sulla `UmbrellaType`, riga ~38), aggiungi una riga di rimando **senza** riscrivere la decisione:

```markdown

> **Raffinato da [ADR-0035](0035-pricing-tipo-partiziona-la-formula.md) (2026-07-02):** dopo lo slice "Chiarezza tipi",
> `type=null` non è più "qualsiasi tipo, abbonamento incluso" ma "famiglia a prezzo/giorno (daily/periodic)". Un
> abbonamento è prezzato **solo** da una tariffa `type='subscription'`; il wildcard non lo prezza. La precedenza qui
> definita resta invariata.
```

- [ ] **Step 3: Verifica i link relativi**

Run: `git grep -n "0035-pricing-tipo-partiziona" docs/architecture/decisions/0032-pricing-engine-precedenza.md`
Expected: 2 occorrenze (header + §1). Verifica a occhio che il file 0035 esista e che i link `0032-...md` / `0006-...md` / `0009-...md` puntino a file esistenti in `docs/architecture/decisions/`.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/decisions/0035-pricing-tipo-partiziona-la-formula.md docs/architecture/decisions/0032-pricing-engine-precedenza.md
git commit -m "docs(adr): ADR-0035 il tipo partiziona la formula di prezzo (raffina ADR-0032)"
```

---

## Verifica finale (dopo le 3 task, prima del merge)

- [ ] **Suite complete (dal vivo, non regredire i conteggi):**
  - `corepack pnpm --filter @coralyn/api test` → **94** (91 + 3)
  - `corepack pnpm --filter @coralyn/api test:e2e` → **130** (129 + 1)
  - `corepack pnpm --filter web-staff test` → **148** (invariato, include i 55 ui-kit)
  - `corepack pnpm --filter web-staff typecheck` → pulito
- [ ] **Review whole-branch (opus)** via `superpowers:requesting-code-review`: 0 Critical/Important attesi.
- [ ] **Rebuild container + verifica live** (handoff §5): `docker compose --profile full up -d --build api web`; login `admin@coralyn.dev`/`coralyn-admin-8473`; `GET /api/bookings/quote?...&type=subscription&...` → **€800** (matchedRate `type=subscription`), non €28. Una stagione senza tariffa subscription → **422** "Nessuna tariffa Abbonamento configurata per questa stagione".
- [ ] **Presenta lo stato all'utente e attendi conferma** prima dello Slice C (Equipment) — ADR-0009.

---

## Self-review (svolta in fase di scrittura piano)

- **Copertura spec:** §3.1 motore → Task 1; §3.3 422 → Task 2; §3.4 ADR-0035 + rimando 0032 → Task 3; §3.2 precedenza invariata → Global Constraints (nessuna modifica a `specificity`); §4 FE invariato → Global Constraints; §5 piano test (1:1 + 3 additivi unit, +1 e2e) → Task 1/Task 2; §6 impatto (nessun cambio seed) → i test usano il seed esistente (subscription €800/€850) + stagione 2028 inline per il caso NO_RATE.
- **Placeholder:** nessuno — ogni step ha codice/comandi concreti.
- **Type consistency:** `throwPriceError(outcome, type: BookingType)` usato con `input.type` (quote) e `p.type` (priceAndWrite); `BookingType` già in scope; nessuna nuova import necessaria. `isApplicable` firma invariata.
