# Selettore Pacchetto + re-quote (A3.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development` (consigliato)
> o `superpowers:executing-plans` per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Far scegliere il `Package` nel modale "Nuova prenotazione", ricalcolare il prezzo al cambio
(re-quote), salvare il `packageId` sulla prenotazione, ed esporre il pacchetto nella `BookingsView`.

**Architecture:** Increment **puro additivo** sopra A3.1. Nuovo endpoint read-only `GET /api/packages`
nel modulo `catalog` (proiezione `toPackageDTO`). La create salva `packageId` (pre-validato nel tenant
come le altre FK) e lo passa al pricing (`priceWithin` lo accetta già). Engine, schema `Rate`, RLS e A2
**invariati**; nessuna migrazione. FE: `usePackages` + selettore nel modale + `packageId` nel quote +
colonna in `BookingsView`. Pacchetto **opzionale** (`null` = tariffa base).

**Tech Stack:** NestJS + Prisma + class-validator (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
contratti condivisi in `@coralyn/contracts`. Test: Jest (api unit + e2e), Vitest (web-staff).

**Spec di riferimento:** [docs/specs/2026-06-30-bookings-package-a3-2-design.md](../specs/2026-06-30-bookings-package-a3-2-design.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. Comandi: `corepack pnpm ...` (pin 11.9.0).
DB locale porta **5433** (`coralyn_dev`/`coralyn_test`); `DATABASE_URL` inline ai comandi prisma; nessuna
migrazione (schema invariato), ma `prisma generate` **prima** di `nest build` su cambio branch. Precedenza
engine **invariata** (ADR-0032).

---

## File map

- **Modifica** `packages/contracts/src/index.ts` — `CreateBookingInput += packageId?`.
- **Crea** `apps/api/src/catalog/package.projection.ts` — `toPackageDTO`.
- **Crea** `apps/api/src/catalog/package.projection.spec.ts` — unit della proiezione.
- **Modifica** `apps/api/src/catalog/catalog.service.ts` — metodo `listPackages()`.
- **Crea** `apps/api/src/catalog/packages.controller.ts` — `GET /api/packages`.
- **Modifica** `apps/api/src/catalog/catalog.module.ts` — registra `PackagesController`.
- **Modifica** `apps/api/src/bookings/dto/create-booking.dto.ts` — `packageId?` opzionale.
- **Modifica** `apps/api/src/bookings/bookings.service.ts` — pre-valida `packageId`, lo passa al pricing e lo salva.
- **Modifica** `apps/api/test/helpers/seed-pricing.ts` — aggiunge una `Rate { packageId }` (60/giorno) e la ritorna.
- **Modifica** `apps/api/test/bookings.e2e-spec.ts` — `GET /packages`, create con `packageId`, packageId invalido.
- **Crea** `apps/web-staff/src/features/bookings/usePackages.ts` — composable lista pacchetti.
- **Modifica** `apps/web-staff/src/lib/queryKeys.ts` — chiave `packages`.
- **Modifica** `apps/web-staff/src/features/bookings/useBookingQuote.ts` — `QuoteParams += packageId?`.
- **Modifica** `apps/web-staff/src/features/map/MapView.vue` — selettore Pacchetto + re-quote + payload.
- **Modifica** `apps/web-staff/src/features/bookings/BookingsView.vue` — colonna "Pacchetto".
- **Modifica** `apps/web-staff/src/mocks/server.ts` — handler `GET /api/packages`; quote variabile per `packageId`.
- **Modifica** `apps/web-staff/src/features/map/MapView.spec.ts` — selettore + re-quote.
- **Crea** `apps/web-staff/src/features/bookings/BookingsView.spec.ts` — colonna Pacchetto (override MSW).
- **Modifica** `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`; **crea**
  `docs/handoff/2026-06-30-bookings-a3-2-done.md`.

---

## Task 1: Contratti — `CreateBookingInput += packageId?`

**Files:** Modifica `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi il campo opzionale**

In `CreateBookingInput` (oggi termina con `date: string;`), aggiungi `packageId?`:

```ts
/** Input per creare una prenotazione giornaliera. Il prezzo è calcolato dal pricing engine (A3.1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string;        // ISO yyyy-mm-dd
  packageId?: string;  // A3.2 (additivo): pacchetto scelto; assente = nessun pacchetto (tariffa base)
}
```

- [ ] **Step 2: Build dei contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): CreateBookingInput += packageId? (A3.2)"
```

---

## Task 2: Proiezione `toPackageDTO` (TDD)

**Files:** Crea `apps/api/src/catalog/package.projection.ts`, `apps/api/src/catalog/package.projection.spec.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

`apps/api/src/catalog/package.projection.spec.ts`:

```ts
import type { Package } from '@prisma/client';
import { toPackageDTO } from './package.projection';

const row = (over: Partial<Package> = {}): Package =>
  ({
    id: 'pkg-1',
    establishmentId: 'e-1',
    name: 'Standard',
    equipment: { sunbeds: 2, deckchairs: 1 },
    ...over,
  }) as Package;

describe('toPackageDTO', () => {
  it('proietta id/name/equipment', () => {
    expect(toPackageDTO(row())).toEqual({
      id: 'pkg-1',
      name: 'Standard',
      equipment: { sunbeds: 2, deckchairs: 1 },
    });
  });

  it('non espone establishmentId', () => {
    expect((toPackageDTO(row()) as Record<string, unknown>).establishmentId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- package.projection`
Expected: FAIL ("Cannot find module './package.projection'").

- [ ] **Step 3: Implementa la proiezione**

`apps/api/src/catalog/package.projection.ts`:

```ts
import type { Package } from '@prisma/client';
import type { PackageDTO } from '@coralyn/contracts';

/** Proietta una riga Package nel DTO condiviso (equipment Json → Record<string, number>). */
export function toPackageDTO(p: Package): PackageDTO {
  return {
    id: p.id,
    name: p.name,
    equipment: p.equipment as Record<string, number>,
  };
}
```

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/api test -- package.projection`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog/package.projection.ts apps/api/src/catalog/package.projection.spec.ts
git commit -m "feat(api): proiezione toPackageDTO (A3.2)"
```

---

## Task 3: `GET /api/packages` — service + controller + module

**Files:** Modifica `apps/api/src/catalog/catalog.service.ts`; crea `apps/api/src/catalog/packages.controller.ts`;
modifica `apps/api/src/catalog/catalog.module.ts`

- [ ] **Step 1: Aggiungi `listPackages` al `CatalogService`**

In `apps/api/src/catalog/catalog.service.ts`:
- aggiorna l'import dei tipi contratti per includere `PackageDTO`:
  `import type { BookingType, PackageDTO } from '@coralyn/contracts';`
- aggiungi l'import della proiezione: `import { toPackageDTO } from './package.projection';`
- aggiungi il metodo (es. sopra `quote`):

```ts
  /** Lista dei pacchetti del tenant (read-only, per il selettore FE). */
  async listPackages(): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.package.findMany());
    return rows.map(toPackageDTO);
  }
```

- [ ] **Step 2: Crea il controller**

`apps/api/src/catalog/packages.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';

@Controller('packages')
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<PackageDTO[]> {
    return this.catalog.listPackages();
  }
}
```

- [ ] **Step 3: Registra il controller nel `CatalogModule`**

`apps/api/src/catalog/catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PackagesController } from './packages.controller';

@Module({
  controllers: [PackagesController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

> `CatalogModule` è già importato da `BookingsModule` (per il pricing) e quindi nel grafo di `AppModule`:
> il controller viene istanziato senza altre modifiche. `JwtAuthGuard` è globale → `/api/packages` è
> protetto (no Bearer → 401; superuser senza tenant → 400 quando `tenant.require()` lancia).

- [ ] **Step 4: `prisma generate` + build dell'api**

Run:
```bash
corepack pnpm --filter @coralyn/api prisma generate
corepack pnpm --filter @coralyn/api build
```
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog/catalog.service.ts apps/api/src/catalog/packages.controller.ts apps/api/src/catalog/catalog.module.ts
git commit -m "feat(api): GET /api/packages (read-only, tenant-scoped) nel modulo catalog (A3.2)"
```

---

## Task 4: Create salva `packageId` + lo prezza

**Files:** Modifica `apps/api/src/bookings/dto/create-booking.dto.ts`, `apps/api/src/bookings/bookings.service.ts`

- [ ] **Step 1: `CreateBookingDto += packageId?`**

In `apps/api/src/bookings/dto/create-booking.dto.ts`, aggiungi l'import `IsOptional` e il campo:

```ts
import { IsOptional, Matches } from 'class-validator';
```

In fondo alla classe `CreateBookingDto` (dopo `date!: string;`):

```ts
  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;
```

- [ ] **Step 2: `BookingsService.create` — pre-valida, prezza e salva `packageId`**

In `apps/api/src/bookings/bookings.service.ts`, nel metodo `create`, dentro `forTenant`:

a) **Pre-validazione FK**: estendi il check FK esistente per includere il pacchetto (quando presente).
Sostituisci il blocco:

```ts
      // FK nel tenant (RLS: fuori tenant → null → 422)
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }
```

con:

```ts
      // FK nel tenant (RLS: fuori tenant → null → 422)
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }
      if (input.packageId) {
        const pkg = await tx.package.findFirst({ where: { id: input.packageId } });
        if (!pkg) throw new UnprocessableEntityException('Pacchetto non valido');
      }
```

b) **Pricing col pacchetto**: nel blocco auto-pricing, passa `packageId` a `priceWithin`. Sostituisci:

```ts
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          date: input.date,
        }),
      );
```

con:

```ts
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          date: input.date,
          packageId: input.packageId ?? null,
        }),
      );
```

c) **Salvataggio**: nel `tx.booking.create({ data: { ... } })`, aggiungi `packageId` dopo `status: 'confirmed',`:

```ts
          status: 'confirmed',
          totalPrice,
          packageId: input.packageId ?? null,
```

- [ ] **Step 3: Build dell'api**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: build OK (nessun errore di tipo; `CreateBookingInput.packageId?` riconosciuto).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bookings/dto/create-booking.dto.ts apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): create salva e prezza packageId (pre-validato nel tenant) (A3.2)"
```

---

## Task 5: e2e — `GET /packages`, create con `packageId`, packageId invalido

**Files:** Modifica `apps/api/test/helpers/seed-pricing.ts`, `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Aggiungi una `Rate { packageId }` al seed e2e**

In `apps/api/test/helpers/seed-pricing.ts`, **dopo** la creazione della rate pomeriggio (price 40) e
**prima** del `return`, aggiungi una rate specifica per il pacchetto Standard (60/giorno):

```ts
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        packageId: pkg.id,
        price: 60,
        unit: RateUnit.day,
      },
    });
```

> La rate `{ packageId }` non matcha i contesti con `packageId=null` (i test esistenti creano senza
> pacchetto → restano a 28/40). Precedenza ADR-0032: con `packageId` selezionato e fascia mattina, la
> rate pacchetto (60) batte la catch-all (28).

- [ ] **Step 2: Cattura gli id del listino nel `beforeAll`**

In `apps/api/test/bookings.e2e-spec.ts`, dichiara una variabile per gli id del listino e catturala.
Aggiungi sotto `let customerId: string;`:

```ts
  let packageId: string;
```

Nel `beforeAll`, sostituisci:

```ts
    await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
```

con:

```ts
    packageId = (await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon })).packageId;
```

- [ ] **Step 3: Aggiungi i test create-con-pacchetto e packageId invalido**

In `apps/api/test/bookings.e2e-spec.ts`, **dopo** il test `data fuori stagione → 422` (riga ~116) e
**prima** del `describe('GET /bookings/quote', ...)`, aggiungi:

```ts
  it('create con packageId valido → 201, prezzo dalla rate pacchetto (60) e lo persiste', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, date: '2026-07-21', packageId })).expect(201);
    expect(res.body.totalPrice).toBe(60);
    expect(res.body.packageId).toBe(packageId);

    const get = await request(app.getHttpServer()).get(`/api/bookings?date=2026-07-21`).set(...bearer(token1)).expect(200);
    expect(get.body.find((b: { id: string }) => b.id === res.body.id).packageId).toBe(packageId);
  });

  it('create con packageId inesistente nel tenant → 422', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, date: '2026-07-22', packageId: '00000000-0000-0000-0000-0000000000ff' })).expect(422);
  });
```

- [ ] **Step 4: Aggiungi il describe `GET /packages`**

In `apps/api/test/bookings.e2e-spec.ts`, **dopo** il `describe('GET /bookings/quote', ...)` e **prima** del
test `DELETE annulla ...`, aggiungi:

```ts
  describe('GET /packages', () => {
    it('senza token → 401', async () => {
      await request(app.getHttpServer()).get('/api/packages').expect(401);
    });
    it('con token → 200, lista i pacchetti del tenant', async () => {
      const res = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: { id: string; name: string }) => p.id === packageId && p.name === 'Standard')).toBe(true);
      expect(res.body[0].establishmentId).toBeUndefined();
    });
    it('isolamento: s2 non vede i pacchetti di s1', async () => {
      const res = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token2)).expect(200);
      expect(res.body).toEqual([]);
    });
    it('superuser (no tenant) → 400', async () => {
      await request(app.getHttpServer()).get('/api/packages').set(...bearer(superToken)).expect(400);
    });
  });
```

- [ ] **Step 5: Esegui gli e2e bookings**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" \
  corepack pnpm --filter @coralyn/api test:e2e -- bookings
```
Expected: PASS (inclusi i nuovi: create-con-pacchetto, packageId invalido, GET /packages 401/200/isolamento/400).
*(Se l'ambiente e2e carica `.env.test`, basta `test:e2e -- bookings`.)*

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/helpers/seed-pricing.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e GET /packages + create con packageId (prezzo pacchetto, isolamento, 422 invalido) (A3.2)"
```

---

## Task 6: FE — `usePackages`, selettore nel modale, re-quote

**Files:** Crea `apps/web-staff/src/features/bookings/usePackages.ts`; modifica
`apps/web-staff/src/lib/queryKeys.ts`, `apps/web-staff/src/features/bookings/useBookingQuote.ts`,
`apps/web-staff/src/features/map/MapView.vue`, `apps/web-staff/src/mocks/server.ts`,
`apps/web-staff/src/features/map/MapView.spec.ts`

- [ ] **Step 1: Chiave query `packages`**

In `apps/web-staff/src/lib/queryKeys.ts`, aggiungi dentro l'oggetto `queryKeys`:

```ts
  packages: (tenantId: string) => ['packages', tenantId] as const,
```

- [ ] **Step 2: Composable `usePackages`**

`apps/web-staff/src/features/bookings/usePackages.ts`:

```ts
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { PackageDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.packages(session.establishmentId)),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}
```

- [ ] **Step 3: `useBookingQuote` accetta `packageId`**

In `apps/web-staff/src/features/bookings/useBookingQuote.ts`:

a) estendi `QuoteParams`:

```ts
export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  date: string;
  packageId?: string; // A3.2: opzionale (nessun pacchetto = assente)
}
```

b) aggiungi `packageId` alla `queryKey` (dopo `params.value?.date ?? ''`):

```ts
      params.value?.packageId ?? '',
```

c) includi `packageId` nell'URL solo se presente — sostituisci il `queryFn`:

```ts
    queryFn: () => {
      const p = params.value!;
      const pkg = p.packageId ? `&packageId=${p.packageId}` : '';
      return apiFetch<BookingQuoteDTO>(
        `/bookings/quote?umbrellaId=${p.umbrellaId}&timeSlotId=${p.timeSlotId}&date=${p.date}${pkg}`,
      );
    },
```

- [ ] **Step 4: `MapView.vue` — selettore + re-quote + payload**

In `apps/web-staff/src/features/map/MapView.vue`, `<script setup>`:
- aggiungi l'import: `import { usePackages } from '@/features/bookings/usePackages';`
- aggiungi (vicino a `const { data: customers } = useCustomers();`): `const { data: packages } = usePackages();`
- aggiungi lo stato: `const packageId = ref<string>('');`
- in `openModal()`, dopo `customerId.value = '';`, aggiungi: `packageId.value = '';`
- estendi `quoteParams` per includere `packageId` (sostituisci il computed esistente):

```ts
const quoteParams = computed(() =>
  modalBooking.value && sel.value && selectedSlotId.value
    ? {
        umbrellaId: sel.value.u.id,
        timeSlotId: selectedSlotId.value,
        date: activeDate.value,
        packageId: packageId.value || undefined,
      }
    : null,
);
```

- in `confirmBooking()`, aggiungi `packageId` al payload (sostituisci la chiamata):

```ts
  await createBooking.mutateAsync({
    customerId: customerId.value,
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    date: activeDate.value,
    packageId: packageId.value || undefined,
  });
```

Nel `<template>`, **dopo** il blocco Fascia (`<div v-if="freeSlotOptions.length"> ... </div>`) e **prima**
del blocco Prezzo, aggiungi il selettore Pacchetto:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Pacchetto</label>
          <select v-model="packageId" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="">Nessun pacchetto</option>
            <option v-for="p in (packages ?? [])" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
```

- [ ] **Step 5: MSW — handler `GET /api/packages` + quote variabile per `packageId`**

In `apps/web-staff/src/mocks/server.ts`:

a) aggiungi, **prima** di `http.get('/api/bookings', ...)`:

```ts
  http.get('/api/packages', () =>
    HttpResponse.json([{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }]),
  ),
```

b) rendi il quote sensibile a `packageId` (35 col pacchetto, 28 senza) — sostituisci l'handler quote:

```ts
  http.get('/api/bookings/quote', ({ request }) => {
    const hasPkg = new URL(request.url).searchParams.has('packageId');
    return HttpResponse.json({ totalPrice: hasPkg ? 35 : 28 });
  }),
```

c) il `POST /api/bookings` riflette il `packageId` opzionale — sostituisci l'handler:

```ts
  http.post('/api/bookings', async ({ request }) => {
    const b = (await request.json()) as { customerId: string; umbrellaId: string; timeSlotId: string; date: string; packageId?: string };
    return HttpResponse.json(
      { id: 'bk-1', ...b, startDate: b.date, endDate: b.date, type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0 },
      { status: 201 },
    );
  }),
```

- [ ] **Step 6: `MapView.spec.ts` — selettore + re-quote**

In `apps/web-staff/src/features/map/MapView.spec.ts`, nel secondo test, **sostituisci** il blocco finale
(dall'assert su `'28'` fino a `w.unmount();`) con la verifica del selettore e del re-quote:

```ts
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('28');

    // Il selettore Pacchetto è presente con l'opzione di default e quella del MSW.
    const select = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Nessun pacchetto'),
    ) as HTMLSelectElement | undefined;
    expect(select).toBeTruthy();
    expect(select!.textContent).toContain('Standard');

    // Scegliendo il pacchetto, il prezzo si ricalcola (MSW: 35 col pacchetto).
    select!.value = 'pkg-1';
    select!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('35');

    w.unmount();
```

- [ ] **Step 7: Esegui i test FE + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- MapView
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: PASS; nessun errore TS. *(Se i tipi dei contratti non risultano aggiornati, pulisci
`apps/web-staff/node_modules/.vite` e ri-esegui.)*

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/bookings/usePackages.ts apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/bookings/useBookingQuote.ts apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): selettore Pacchetto nel modale + re-quote al cambio (A3.2)"
```

---

## Task 7: FE — colonna "Pacchetto" in `BookingsView`

**Files:** Modifica `apps/web-staff/src/features/bookings/BookingsView.vue`; crea
`apps/web-staff/src/features/bookings/BookingsView.spec.ts`

- [ ] **Step 1: Test della colonna (override MSW)**

`apps/web-staff/src/features/bookings/BookingsView.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { server } from '@/mocks/server';
import { mountApp } from '@/test/utils';
import BookingsView from './BookingsView.vue';

describe('BookingsView — colonna Pacchetto', () => {
  afterEach(() => server.resetHandlers());

  it('mostra il nome del pacchetto risolto da packageId, "—" se assente', async () => {
    server.use(
      http.get('/api/packages', () =>
        HttpResponse.json([{ id: 'pkg-1', name: 'Standard', equipment: { sunbeds: 2 } }]),
      ),
      http.get('/api/bookings', () =>
        HttpResponse.json([
          { id: 'bk-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed', totalPrice: 60, paymentStatus: 'unpaid', amountCollected: 0, packageId: 'pkg-1' },
          { id: 'bk-2', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0 },
        ]),
      ),
    );

    const w = mountApp(BookingsView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(w.text()).toContain('Pacchetto'); // header colonna
    expect(w.text()).toContain('Standard');  // risolto per bk-1
    w.unmount();
  });
});
```

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: FAIL (header "Pacchetto" e/o "Standard" assenti).

- [ ] **Step 3: Aggiungi la colonna a `BookingsView.vue`**

In `apps/web-staff/src/features/bookings/BookingsView.vue`, `<script setup>`:
- import: `import { usePackages } from './usePackages';`
- dopo `const { data: map } = useDayMap();`, aggiungi: `const { data: packages } = usePackages();`
- dopo il computed `umbrellaLabel` (riga ~43), aggiungi la mappa nome pacchetto:

```ts
const packageName = computed(() => {
  const m = new Map<string, string>();
  for (const p of packages.value ?? []) m.set(p.id, p.name);
  return m;
});
```

- in `cols`, **dopo** `{ key: 'tipo', label: 'Tipo' }`, inserisci:

```ts
  { key: 'pacchetto', label: 'Pacchetto' },
```

Nel `<template>`, dentro la riga `<tr>`, **dopo** il `<td>` del Tipo (quello con "Giornaliero") e **prima**
del `<td>` del Periodo, aggiungi:

```vue
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ b.packageId ? (packageName.get(b.packageId) ?? '—') : '—' }}</td>
```

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/bookings/BookingsView.vue apps/web-staff/src/features/bookings/BookingsView.spec.ts
git commit -m "feat(web-staff): colonna Pacchetto in BookingsView (packageId→name) (A3.2)"
```

---

## Task 8: Documentazione + handoff + verifica finale (DoD)

**Files:** Modifica `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`; crea
`docs/handoff/2026-06-30-bookings-a3-2-done.md`

- [ ] **Step 1: Aggiorna glossary, data-model, README**

- `glossary.md`: nella riga **Pacchetto/`Package`**, aggiorna la nota: il selettore è **implementato**
  (A3.2); `Booking.packageId` valorizzabile, opzionale (`null` = tariffa base). Nella riga
  **Prenotazione/`Booking`**, togli "selettore Pacchetto in A3.2" → "selettore Pacchetto implementato (A3.2)".
- `data-model.md`: nella nota d'intestazione e nella regola "Risoluzione prezzo", segnala che
  `Booking.packageId` è ora **valorizzato dal selettore** (A3.2), pacchetto = dimensione opzionale
  (`null` = tariffa base); `GET /api/packages` espone i pacchetti del tenant.
- `README.md`: stato — **A3.2 selettore Pacchetto implementato** (modale sceglie il pacchetto, prezzo
  ricalcolato, colonna Pacchetto in BookingsView; `GET /api/packages`); A3 completo. Aggiorna l'elenco
  "Prossimi passi" (A4 periodiche/abbonamenti; editor CRUD listino D-032).

- [ ] **Step 2: Scrivi l'handoff A3.2**

`docs/handoff/2026-06-30-bookings-a3-2-done.md`: stato git (branch `feat/bookings-package-selector` da
`main`); cosa ha consegnato A3.2 (GET /packages + toPackageDTO; create salva/prezza packageId pre-validato;
re-quote nel modale; selettore; colonna BookingsView); confini (`packageId` opzionale = tariffa base; no
editor CRUD listino D-032; engine/schema/RLS/A2 invariati; create daily-only; UmbrellaType fuori pricing
D-018); conteggi test aggiornati; gotcha riconfermati (prisma generate su cambio branch, porta 5433,
rebuild api Docker, pulizia `.vite` dopo cambio contratti); **prossimo slice A4** (periodiche/abbonamenti).

- [ ] **Step 3: Verifica DoD completa**

Run:
```bash
corepack pnpm -r build
corepack pnpm eslint .
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/api test
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm --filter @coralyn/api test:e2e
```
Expected: tutto verde. Conteggi attesi: ui-kit 14 (invariato) · web-staff ≥44 (+BookingsView, +eventuale
MapView) · api unit ≥60 (+2 toPackageDTO) · api e2e ≥53 (+create-pacchetto, +422 invalido, +GET /packages ×4).

- [ ] **Step 4: Verifica live (Docker) — raccomandata**

```bash
docker compose --profile full up -d --build api
```
Login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`); apri il modale "Nuova prenotazione" → scegli
un pacchetto → il prezzo si **aggiorna** (re-quote); conferma → la `BookingsView` mostra il pacchetto nella
nuova colonna; `GET /api/packages` con Bearer → lista pacchetti. *(Rebuild dell'immagine api dopo il cambio
BE, altrimenti il FE prende 404 — gotcha noto.)*

- [ ] **Step 5: Commit + push**

```bash
git add README.md docs/
git commit -m "docs: A3.2 selettore Pacchetto implementato (glossary, data-model, handoff) (A3.2)"
git push -u origin feat/bookings-package-selector
```

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §2.1 GET /packages → Task 2 (proiezione) + Task 3 (service/controller/module);
  §2.2 create salva/prezza packageId → Task 4; §2.3 pre-validazione FK → 422 → Task 4 (Step 2a) + e2e Task 5;
  §3 contratti → Task 1; §4.1 usePackages/queryKey → Task 6 (Step 1-2); §4.2 selettore+payload → Task 6
  (Step 4); §4.3 useBookingQuote packageId → Task 6 (Step 3); §4.4 colonna BookingsView → Task 7; §4.5 MSW
  → Task 6 (Step 5); §5 test → Task 2/5/6/7; §6 DoD/doc → Task 8; §7 decisioni chiuse → riflesse in
  glossary/data-model/handoff (Task 8) e nei confini dei task.
- **Placeholder:** nessuno; ogni step ha codice/comando reale. L'UUID `...00ff` (Task 5 Step 3) è di forma
  valida ma inesistente nel tenant (caso 422), non un TODO.
- **Coerenza tipi:** `PackageDTO` (contracts) ↔ `toPackageDTO` (projection) ↔ `CatalogService.listPackages`
  ↔ `PackagesController` ↔ `usePackages`/MSW. `CreateBookingInput.packageId?` (contracts) ↔
  `CreateBookingDto.packageId?` ↔ `BookingsService.create` (pre-check + priceWithin + create) ↔ MapView
  payload ↔ e2e/MSW. `QuoteParams.packageId?` (useBookingQuote) ↔ MapView `quoteParams`. `priceWithin`
  accetta già `packageId?: string | null` (A3.1, [catalog.service.ts](../../apps/api/src/catalog/catalog.service.ts)).
  Engine, schema `Rate`, migrazioni: **non toccati**.
```
