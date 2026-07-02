# Chiarezza tipi prenotazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il calcolo del prezzo si deriva dal **tipo di prenotazione** (`daily`/`periodic`/`subscription`) e non più da `Rate.unit`, che viene **rimosso** dal modello; l'UI editor e prenotazione diventano auto-esplicative.

**Architecture:** Tre layer, **un commit per layer** (ADR-0009): (1) backend — migrazione drop `Rate.unit` + enum `RateUnit`, engine calcola da `ctx.type`, ripulitura di `unit` da contratti/DTO/proiezioni/service/seed + tutte le e2e; (2) FE editor `PricingView.vue` — via il selettore "Unità", il suffisso prezzo si deriva dal tipo; (3) FE prenotazione `MapView.vue` — `matchedRateLabel` per tipo + riga di spiegazione per ogni tipo. Test-first ad ogni layer.

**Tech Stack:** NestJS + Prisma (Postgres, RLS FORCE) · Vue 3 + Vitest + vue-tsc · pnpm monorepo (`@coralyn/contracts` condiviso) · Jest (api unit + e2e).

## Global Constraints

- **Regola di calcolo (unica):** `daily` → `price × 1`; `periodic` → `price × giorni` (estremi inclusi); `subscription` → `price` (forfait, giorni ignorati). Copiata da spec §2.
- **Codice/DB in inglese, UI/doc in italiano** (convenzione repo).
- **Baseline test da NON regredire** (verificata live 2026-07-02): **api unit 89 · api e2e 126 · web-staff 141 · ui-kit 55**; typecheck web-staff + ui-kit puliti. Il netto atteso di questo slice è **invariato** (engine spec +1, create-rate.dto.spec −1).
- **Date UTC** (ADR-0031): mai metodi locali; `common/time.ts`/`daysInclusive` restano l'unica sede.
- **Prezzo server-autoritativo** (ADR-0032 §7): cambia solo la *formula* (da `unit` a `type`); create/renew continuano a ricalcolare.
- **Fuori scope:** forfait per il periodico → **D-034** (non implementare). Nessun avviso "manca tariffa Abbonamento" (spec §7.4, default = no).
- **Comandi** (dalla root repo, `corepack pnpm`): contracts build = `corepack pnpm --filter @coralyn/contracts build`; api unit = `corepack pnpm --filter @coralyn/api test`; api e2e = `corepack pnpm --filter @coralyn/api test:e2e`; web-staff test = `corepack pnpm --filter web-staff test`; web-staff typecheck = `corepack pnpm --filter web-staff typecheck`. Dopo il tocco a `@coralyn/contracts`: **build contracts + `rm -rf apps/web-staff/node_modules/.vite`** prima dei test web-staff.
- **Gotcha migrazione:** `prisma migrate dev` ri-propone uno spurio `DROP INDEX "Rate_signature_key";` → **rimuoverlo** dal `migration.sql` generato (indice raw, non drift). `prisma migrate status` deve restare pulito.
- **⚠️ Ordine di verde:** dopo il Layer 1 la **typecheck web-staff resta ROSSA** (i `RateDTO`/`RateUnit` con `unit` nel FE non compilano) e ci resta fino a fine Layer 3; è **atteso**. I test **vitest** girano via esbuild (niente typecheck) quindi le suite FE possono restare verdi file-per-file. Il verde pieno di tutta la baseline (incl. typecheck) è il **gate finale della whole-branch review**.
- **Subagent-driven:** ogni implementer **fa il lavoro con i propri tool, NON delega/annida subagent**. Se torna a mani vuote, verificare `git log`/working-tree prima di ri-dispatchare.
- **Branch:** tutto il lavoro su un **nuovo branch da `main`** (`catalog-chiarezza-tipi-prenotazione`).

---

## Setup (prima del Layer 1)

- [ ] **S1:** Da `main` sincronizzato, crea il branch:

```bash
git checkout -b catalog-chiarezza-tipi-prenotazione
```

---

## Task 1 — Layer 1: Backend (il calcolo si deriva dal tipo, via `unit`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (rimuovi `Rate.unit` :258 e `enum RateUnit` :203-206)
- Create: `apps/api/prisma/migrations/<ts>_drop_rate_unit/migration.sql` (via `prisma migrate dev`, poi ripulita)
- Modify: `apps/api/src/catalog/pricing.engine.ts` (RateRow senza `unit`; calcolo su `ctx.type`)
- Test: `apps/api/src/catalog/pricing.engine.spec.ts`
- Modify: `packages/contracts/src/index.ts` (rimuovi `RateUnit` e `unit` da `RateDTO`/`UpdateRateInput`)
- Modify: `apps/api/src/catalog/dto/create-rate.dto.ts`, `apps/api/src/catalog/dto/update-rate.dto.ts`
- Test: `apps/api/src/catalog/dto/create-rate.dto.spec.ts`
- Modify: `apps/api/src/catalog/rate.projection.ts`, `apps/api/src/catalog/catalog.service.ts`, `apps/api/src/catalog/rates.service.ts`
- Modify (seed): `apps/api/prisma/seed.ts`, `apps/api/test/helpers/seed-pricing.ts`
- Test (e2e, adegua asserzioni/payload `unit`): `apps/api/test/bookings.e2e-spec.ts`, `apps/api/test/rates.e2e-spec.ts`, `apps/api/test/time-slots.e2e-spec.ts`, `apps/api/test/packages.e2e-spec.ts`, `apps/api/test/seasons.e2e-spec.ts`, `apps/api/test/renewal-campaigns.e2e-spec.ts`

**Interfaces:**
- Produces (consumato dai layer FE): `RateDTO` **senza** `unit`; il type `RateUnit` **non esiste più** in `@coralyn/contracts`. `BookingQuoteDTO.matchedRate: RateDTO` eredita (nessun `unit`).
- Consumes: `PricingContext.type: BookingType` (già presente), `daysInclusive(start,end)` (invariato).

- [ ] **Step 1 — Test-first engine:** in `pricing.engine.spec.ts`, togli `unit: 'day'` dal factory `rate()` (riga 14-17) e **sostituisci** i due test `unit=day`/`unit=period` (righe 69-82) con questi quattro:

```ts
it('daily -> price x 1', () => {
  const r = resolvePrice(ctx({ type: 'daily' }), [rate({ price: 28 })]);
  expect(r).toMatchObject({ ok: true, totalPrice: 28 });
});

it('periodic su piu giorni -> price x giorni (estremi inclusi)', () => {
  const r = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 10 })]);
  expect(r).toMatchObject({ totalPrice: 30 }); // 3 giorni
});

it('subscription -> forfait, indipendente dai giorni', () => {
  const r = resolvePrice(ctx({ type: 'subscription', startDate: '2026-07-15', endDate: '2026-07-20' }), [rate({ price: 200 })]);
  expect(r).toMatchObject({ totalPrice: 200 });
});

it('centesimi: 0.1 x 3 senza errore float (periodic)', () => {
  const r = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 0.1 })]);
  expect(r).toMatchObject({ totalPrice: 0.3 });
});
```

- [ ] **Step 2 — Run (fallisce a compile/tipo):** `corepack pnpm --filter @coralyn/api test -- pricing.engine` → Expected: FAIL (il factory `rate()` non passa più `unit`, ma `RateRow` lo richiede ancora; e i vecchi test rimossi).

- [ ] **Step 3 — Engine implementazione:** in `pricing.engine.ts`: rimuovi `RateUnit` dall'import (riga 1 → `import type { BookingType } from '@coralyn/contracts';`), togli `unit: RateUnit;` da `RateRow` (riga 25), e riscrivi il calcolo in `resolvePrice` (righe 91-92):

```ts
  const days = daysInclusive(ctx.startDate, ctx.endDate);
  const totalPrice = ctx.type === 'subscription' ? round2(best.price) : round2(best.price * days);
  return { ok: true, totalPrice, rate: best };
```

- [ ] **Step 4 — Run engine:** `corepack pnpm --filter @coralyn/api test -- pricing.engine` → Expected: PASS (tutti i casi engine verdi).

- [ ] **Step 5 — Contratti:** in `packages/contracts/src/index.ts`: elimina il commento + type `RateUnit` (righe 125-126), togli `unit: RateUnit;` da `RateDTO` (riga 276) e `unit?: RateUnit;` da `UpdateRateInput` (riga 295). Poi `corepack pnpm --filter @coralyn/contracts build` → Expected: build OK.

- [ ] **Step 6 — DTO + test DTO:** in `create-rate.dto.ts` togli l'import `RateUnit`, la const `UNITS` (riga 7) e il campo `@IsIn(UNITS) unit!: RateUnit;` (righe 45-46). In `update-rate.dto.ts` togli l'import `RateUnit`, la const `UNITS` (riga 7) e `@IsOptional() @IsIn(UNITS) unit?: RateUnit;` (riga 20). In `create-rate.dto.spec.ts`: togli `unit` da tutti i payload (righe 9,12-13), rinomina il test riga 9 in `'accetta una catch-all (solo seasonId + price)'`, e **rimuovi** il test `'rifiuta unit fuori enum'` (righe 18-20). Run: `corepack pnpm --filter @coralyn/api test -- create-rate.dto` → Expected: PASS.

- [ ] **Step 7 — Proiezioni/service:** in `rate.projection.ts` togli `unit: r.unit,` (riga 19). In `catalog.service.ts` togli `unit: r.unit,` da `toRateRow` (riga 39) e `unit: row.unit,` da `rateRowToDTO` (riga 56). In `rates.service.ts` togli `unit: input.unit,` dalla `create` (riga 52) e `if (input.unit !== undefined) data.unit = input.unit;` dalla `update` (riga 80).

- [ ] **Step 8 — Schema + migrazione (workflow `--create-only`, come i piani precedenti):** in `schema.prisma` togli `unit RateUnit` da `model Rate` (riga 258) e l'`enum RateUnit { day period }` (righe 203-206). Prisma NON auto-carica il `.env` di root quando gira sotto `--filter` (cwd=apps/api), quindi passa `DATABASE_URL` esplicito, caricandolo dal file **senza stamparlo**. Le due DB girano su `localhost:5433` (dev `coralyn_dev`, test `coralyn_test`). Dalla **root repo**:

```bash
DEV_URL="$(grep -oE '^DATABASE_URL=.*' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
TEST_URL="$(grep -oE '^DATABASE_URL=.*' .env.test | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"

# 1) genera la migrazione SENZA applicarla
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate dev --name drop_rate_unit --create-only
```

Poi apri il `apps/api/prisma/migrations/<ts>_drop_rate_unit/migration.sql` e **rimuovi la riga spuria** `DROP INDEX "Rate_signature_key";` se presente (indice raw, gotcha noto — la firma unique NON include `unit`, quindi il drop resta pulito). Deve restare `ALTER TABLE "Rate" DROP COLUMN "unit";` + `DROP TYPE "RateUnit";`. Poi applica a dev (rigenera il client) e a test:

```bash
# 2) applica a coralyn_dev + rigenera il client Prisma
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate dev
# 3) applica a coralyn_test (gli e2e girano lì)
DATABASE_URL="$TEST_URL" corepack pnpm --filter @coralyn/api exec prisma migrate deploy
# 4) verifica pulizia su dev
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate status
```

Expected: "Database schema is up to date".

- [ ] **Step 9 — Seed:** in `apps/api/prisma/seed.ts` togli ogni `unit: 'day'`/`unit: 'period'` dai rate upsert (righe 148-190, sia `update` che `create`). In `apps/api/test/helpers/seed-pricing.ts` togli l'import `RateUnit` (riga 1) e ogni `unit: RateUnit.day`/`unit: RateUnit.period` (righe 31,39,48,57,72,75).

- [ ] **Step 10 — e2e: adegua payload/asserzioni `unit`:**
  - `bookings.e2e-spec.ts:154` → `expect(res.body.matchedRate).toMatchObject({ price: 28 });` (togli `unit: 'day'`).
  - `rates.e2e-spec.ts` righe 55,56,66,71,80,98 → togli `unit: 'day'`/`unit: 'period'` da ogni `.send({...})` e da `toMatchObject({ seasonId, price: 25 })` (riga 56).
  - `time-slots.e2e-spec.ts:99`, `packages.e2e-spec.ts:92`, `seasons.e2e-spec.ts:84` → togli `unit: 'day'`.
  - `renewal-campaigns.e2e-spec.ts` → togli `RateUnit` dall'import (riga 3) e `unit: RateUnit.period` (riga 118).

- [ ] **Step 11 — Verifica backend completa:** rigenera il client Prisma se serve (`cd apps/api && corepack pnpm exec prisma generate`), poi:

```bash
corepack pnpm --filter @coralyn/api test        # api unit → atteso 89 (engine +1, dto −1)
corepack pnpm --filter @coralyn/api test:e2e     # api e2e → atteso 126 (behavior invariato: sub=800 forfait, periodic=28×g)
```

Expected: entrambe verdi, conteggi ≥ baseline. In particolare `bookings.e2e` "subscription → 800 forfait" e "periodic → 84 (28×3)" restano verdi.

- [ ] **Step 12 — Commit (Layer 1):**

```bash
git add -A
git commit -m "feat(pricing): il calcolo si deriva dal tipo prenotazione; rimuove Rate.unit (migrazione)"
```

---

## Task 2 — Layer 2: FE editor Listino (`PricingView.vue`)

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue`
- Test: `apps/web-staff/src/features/pricing/PricingView.spec.ts`
- Test/fixtures: `apps/web-staff/src/features/pricing/rateSpecificity.spec.ts` (togli `unit` dal factory)
- Modify (mock condiviso): `apps/web-staff/src/mocks/server.ts` (rates senza `unit`)

**Interfaces:**
- Consumes: `RateDTO` senza `unit` (Layer 1). `r.type: BookingType | undefined`.
- Produces: `priceHint(r: RateDTO): string` — `r.type === 'subscription'` → `'forfait/stagione'`, altrimenti `'/giorno'`.

- [ ] **Step 1 — Prep contratti per il FE:** `corepack pnpm --filter @coralyn/contracts build && rm -rf apps/web-staff/node_modules/.vite`.

- [ ] **Step 2 — Test-first:** in `PricingView.spec.ts` togli `unit: 'day'` da tutti i literal `RateDTO` (righe 249,250,269,284) e **aggiungi** questo blocco (adatta `mountApp`/`settle` allo stile del file):

```ts
describe('chiarezza tipi (slice)', () => {
  it('il modale tariffa non ha più il selettore "Unità"', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-rate"]').trigger('click');
    await settle();
    expect(w.get('[data-test="form-rate"]').text()).not.toContain('Unità');
    w.unmount();
  });

  it('colonna Prezzo: subscription → "forfait", altri tipi → "/giorno"', async () => {
    server.use(
      http.get('/api/rates', () => HttpResponse.json([
        { id: 'ra-sub', seasonId: 'se-1', price: 800, type: 'subscription' },
        { id: 'ra-day', seasonId: 'se-1', price: 28 },
      ])),
    );
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    const rows = w.findAll('tbody tr');
    const rowSub = rows.find((r) => r.text().includes('800'))!;
    const rowDay = rows.find((r) => r.text().includes('28'))!;
    expect(rowSub.text()).toContain('forfait');
    expect(rowDay.text()).toContain('/giorno');
    w.unmount();
  });
});
```

- [ ] **Step 3 — Run (fallisce):** `corepack pnpm --filter web-staff test -- PricingView` → Expected: FAIL (il modale contiene ancora "Unità"; `priceHint` non esiste).

- [ ] **Step 4 — Implementazione `PricingView.vue`:**
  - Import (riga 4): rimuovi `RateUnit` → `import type { BookingType, RateDTO, TimeSlotDTO } from '@coralyn/contracts';`.
  - Rimuovi `UNIT_OPTIONS` (righe 134-136).
  - Stato modale (riga 212): rimuovi `const rUnit = ref<RateUnit>('day');` → lascia `const rPrice = ref('');`.
  - `resetRateForm` (riga 215): togli `rUnit.value = 'day';`.
  - `openEditRate` (riga 229): togli `rUnit.value = r.unit;`.
  - `submitRate`: togli `unit: rUnit.value,` da `editDims` (riga 247) e da `createDims` (riga 258).
  - Sostituisci `unitLabel` (righe 286-288) con:

```ts
function priceHint(r: RateDTO): string {
  return r.type === 'subscription' ? 'forfait/stagione' : '/giorno';
}
```

  - Template colonna Prezzo (riga 379): `{{ unitLabel(r.unit) }}` → `{{ priceHint(r) }}`.
  - Template: **rimuovi** il blocco `<Field label="Unità"> … </Field>` (righe 476-482) e allarga il campo Prezzo a piena riga (togli il wrapper `<div class="flex gap-3.5">`/`flex-1` attorno al solo Prezzo, o lascia il Prezzo in `flex-1` da solo — mantieni il markup valido).

- [ ] **Step 5 — Fixtures collaterali:** in `rateSpecificity.spec.ts:5` togli `unit: 'day'` dal factory `base`. In `mocks/server.ts` togli `unit: 'day'` dai due literal dell'array `rates` (righe 18,23) — i literal del quote li tocca il Layer 3.

- [ ] **Step 6 — Run:** `corepack pnpm --filter web-staff test -- PricingView rateSpecificity` → Expected: PASS.

- [ ] **Step 7 — Commit (Layer 2):**

```bash
git add -A
git commit -m "feat(pricing): editor Listino senza selettore Unità; suffisso prezzo derivato dal tipo"
```

---

## Task 3 — Layer 3: FE prenotazione (`MapView.vue`) + chiarezza tipi

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Test: `apps/web-staff/src/features/map/MapView.spec.ts`
- Modify (mock condiviso): `apps/web-staff/src/mocks/server.ts` (quote responses senza `unit`)

**Interfaces:**
- Consumes: `RateDTO` senza `unit`; `bookingType: Ref<BookingType>` (già in `MapView.vue`).
- Produces (utente finale): `matchedRateLabel` con suffisso per tipo corrente; riga di spiegazione `TYPE_HELP[bookingType]` sotto il Select Tipo.

- [ ] **Step 1 — Test-first:** in `MapView.spec.ts` togli `unit: 'day'` dai literal `matchedRate` (righe 108,139) e **aggiungi** (adatta ai helper del file — apertura drawer + modale "Nuova prenotazione", come i test esistenti):

```ts
it('la riga di spiegazione cambia col tipo di prenotazione', async () => {
  const w = mountApp(MapView, { attachTo: document.body });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
  await flushPromises();
  await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
  await flushPromises();

  const typeSelect = w.findAll('select')[0]; // primo Select del modale = Tipo
  await typeSelect.setValue('subscription');
  expect(document.body.textContent).toContain('Tutta la stagione, prezzo forfait.');
  await typeSelect.setValue('periodic');
  expect(document.body.textContent).toContain('paghi a giornata');
  await typeSelect.setValue('daily');
  expect(document.body.textContent).toContain('Un giorno.');
  w.unmount();
});

it('il suffisso della tariffa applicata deriva dal tipo: subscription → forfait', async () => {
  server.use(
    http.get('/api/bookings/quote', () =>
      HttpResponse.json({ totalPrice: 800, matchedRate: { id: 'ra-sub', seasonId: 'se-1', price: 800, type: 'subscription' } }),
    ),
  );
  const w = mountApp(MapView, { attachTo: document.body });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
  await flushPromises();
  await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
  await flushPromises();
  await w.findAll('select')[0].setValue('subscription');
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  expect(document.body.textContent).toContain('forfait stagione');
  w.unmount();
});
```

  Inoltre, nei test B2 esistenti che asserivano il suffisso `/g` (label per `daily`), verifica che il tipo corrente nel modale sia `daily` (default) così la label resta `…/g` — non serve cambiarli oltre alla rimozione di `unit` dai literal.

- [ ] **Step 2 — Run (fallisce):** `corepack pnpm --filter web-staff test -- MapView` → Expected: FAIL (`TYPE_HELP` assente; label ancora su `r.unit`).

- [ ] **Step 3 — Implementazione `MapView.vue`:**
  - `matchedRateLabel` (riga 199): sostituisci il suffisso basato su `r.unit` con la derivazione dal tipo corrente:

```ts
  const suffix = bookingType.value === 'subscription' ? ' forfait stagione' : '/g';
  return `${dims} — ${formatEuro(r.price)}${suffix}`;
```

  - Aggiungi (nello `<script setup>`, vicino a `TYPE_LABEL`) la mappa di aiuto:

```ts
const TYPE_HELP: Record<BookingType, string> = {
  daily: 'Un giorno.',
  periodic: 'Scegli le date; paghi a giornata (prezzo × giorni).',
  subscription: 'Tutta la stagione, prezzo forfait.',
};
```

  - Template: sotto il `<Select v-model="bookingType">` (dopo la chiusura del `</div>` del blocco Tipo, righe 325-332) inserisci la riga di aiuto, e **rimuovi** il vecchio paragrafo `<p v-else-if="bookingType === 'subscription'">Durata: stagione intera.</p>` (riga 351):

```html
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Tipo</label>
          <Select v-model="bookingType">
            <option value="daily">Giornaliera</option>
            <option value="periodic">Periodica</option>
            <option value="subscription">Abbonamento</option>
          </Select>
          <p class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">{{ TYPE_HELP[bookingType] }}</p>
        </div>
```

  Mantieni invariato il blocco `v-if="bookingType === 'periodic'"` per l'input "Fine periodo" (righe 347-350).

- [ ] **Step 4 — Mock quote:** in `mocks/server.ts` togli `unit` dai tre response del quote (righe 198,201,202): rispettivamente `{ id: 'ra-sub', seasonId, price: 800, type: 'subscription' }`, `{ id: 'ra-pkg', seasonId, price: 35, packageId: pkg }`, `{ id: 'ra-1', seasonId, price: 28 }`.

- [ ] **Step 5 — Run MapView + suite FE piena:**

```bash
corepack pnpm --filter web-staff test        # atteso ≥ 141 (nessuna suite persa)
corepack pnpm --filter web-staff typecheck   # atteso: PULITO (chiude la finestra rossa del Layer 1)
```

Expected: entrambe verdi. Se la typecheck lamenta un `unit` residuo, cercalo (`rg "\bunit\b" apps/web-staff/src`) e rimuovilo.

- [ ] **Step 6 — Commit (Layer 3):**

```bash
git add -A
git commit -m "feat(map): matchedRateLabel per tipo + spiegazione inline dei tipi di prenotazione"
```

---

## Verifica finale (whole-branch, prima della review/merge)

- [ ] **V1 — Full green baseline** (riverifica dal vivo, non regredire):

```bash
corepack pnpm --filter @coralyn/contracts build
corepack pnpm --filter @coralyn/api test        # api unit 89
corepack pnpm --filter @coralyn/api test:e2e     # api e2e 126
rm -rf apps/web-staff/node_modules/.vite
corepack pnpm --filter web-staff test            # web-staff 141 (globa ui-kit)
corepack pnpm --filter web-staff typecheck       # pulito
```

- [ ] **V2 — Migrazione pulita:** `cd apps/api && corepack pnpm exec prisma migrate status` → "up to date".

- [ ] **V3 — Grep di residui `unit`/`RateUnit`:** `rg -n "RateUnit|\bunit\b" apps packages` → nessun riferimento a `Rate.unit`/`RateUnit` (restano solo eventuali `unit` estranei al dominio prezzo, es. test unrelated).

- [ ] **V4 — Verifica live in dev** (gotcha handoff — **rebuild obbligatorio**):

```bash
docker compose --profile full up -d --build api web
```

  Login `admin@coralyn.dev` / `coralyn-admin-8473` (web vite dev `localhost:5173`, api `localhost:3000/api`): (a) editor Listino → il modale tariffa **non** ha "Unità"; una tariffa Abbonamento mostra "forfait/stagione", una base "/giorno". (b) Prenotazione → cambiando Tipo cambia la riga di spiegazione; per un abbonamento la "Tariffa applicata" mostra "… forfait stagione", per una giornaliera "…/g"; il prezzo dell'abbonamento è il forfait (es. 800), **non** ×giorni.

## Self-Review (checklist spec ↔ piano)

- Spec §3 (backend, migrazione, engine, contratti, service, seed) → Task 1. ✓
- Spec §4 (FE editor: via Unità, colonna Prezzo per tipo) → Task 2. ✓
- Spec §5 (FE prenotazione: `matchedRateLabel` per tipo + spiegazione tipi) → Task 3. ✓
- Spec §7.3/§7.4 fuori scope (forfait periodo D-034, nessun avviso Abbonamento) → rispettati (Global Constraints). ✓
- Baseline test §8 non regredita → V1 (engine +1 / dto −1 = netto invariato). ✓
