# D-035 S4 — Canale cliente self-service (FE `web-customer` + endpoint cliente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'abbonato un canale self-service (app PWA `web-customer`) per vedere i propri abbonamenti e segnalare/annullare un'assenza dal proprio dispositivo, riusando la meccanica release S1/S2 e la fondazione auth S3.

**Architecture:** S4 è **additiva** sopra S3 (auth cliente, ADR-0049) e S1/S2 (release operatore, ADR-0048). Backend: 3 endpoint cliente su un nuovo `CustomerBookingsController` (guarded da `CustomerJwtGuard`) che **riusano** i domain service `bookings.service` esistenti, estesi con `source` (impostato dal controller, non dal body) + ownership `actingCustomerId`. Frontend: nuova app `apps/web-customer` clonata da `web-platform`, con auth per-attivazione+refresh-rotante e interceptor 401 globale (D-037). **Nessuna nuova tabella / nessuna migration** (le tabelle e `AbsenceRelease.source` esistono già da S1/S2/S3).

**Tech Stack:** NestJS + Prisma/Postgres RLS (api), Vue 3 + Vite + Pinia + vue-router + TanStack Query + vite-plugin-pwa + `@coralyn/ui-kit` + `@coralyn/contracts` (web-customer).

## Global Constraints

- **Invariante non negoziabile (ADR-0048):** rivendita **solo** su `AbsenceRelease` esplicita; nessuna presunzione d'assenza; release a **zero cassa** sull'abbonato (`amountCollected`/`refundedAmount`/`startDate`/`endDate` INTATTI); consenso (`Booking.absenceConsentAt`) è il gate.
- **Sicurezza è il vincolo dominante (ADR-0049):** ownership a 2 assi — RLS (tenant, via `req.tenantId` dal `CustomerJwtGuard`) **+** vincolo cliente (`customerId = req.customer.id`). Mismatch di ownership → **404** (stesso codice di "non trovato", nessun leak d'esistenza).
- **`source` NON è un campo del body** (un cliente non deve poter spacciare `source='operator'`): è un **parametro del service** impostato dal controller in base al canale. Refinement esplicito rispetto alla spec §6.3 (che citava `input.source`) — stesso effetto di dominio, superficie più sicura.
- **Riuso senza duplicazione:** nessuna logica di carve/coverage/rimborso/dispatch-errori è riscritta nel canale cliente; si estendono i **due** metodi domain esistenti (`releaseAbsence`, `cancelAbsenceRelease`) con `source` + ownership; il resto è invariato.
- **pnpm, non npm** ([[coralyn-pnpm-not-npm]]): `corepack pnpm`. Se `pnpm add` fallisce con `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`, aggiungere la dep a mano in `package.json` + `corepack pnpm install --no-frozen-lockfile`, poi rigenerare il Prisma Client. Ma S4 **non aggiunge dipendenze nuove** (web-customer riusa le stesse dev/deps di web-platform già nel lockfile).
- **Contracts CJS:** `@coralyn/contracts` compila in `dist/` (gitignored) → `corepack pnpm --filter @coralyn/contracts build` dopo ogni modifica a `packages/contracts/src`, PRIMA di typecheck/test.
- **Comandi test (forma esatta):** api unit `corepack pnpm --filter @coralyn/api test --runInBand -t '<pattern>'`; api e2e `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t '<pattern>'` (lo script `test:e2e` ha GIÀ `--config`, non ri-passarlo); web-customer `corepack pnpm --filter @coralyn/web-customer test`. **Non** lanciare web `test` e api `test:e2e` in parallelo. DB dev/test Docker su `5433`.
- **Gate typecheck FE REALE** = `corepack pnpm --filter @coralyn/web-customer run typecheck` (= `vue-tsc -b --noEmit`), non `vue-tsc --noEmit`.
- **Baseline da NON regredire (verificata 2026-07-15):** api unit **238** · api e2e **345** · web-staff **364** · ui-kit **111** · web-platform **16**. web-customer parte da 0 e cresce.

---

## File Structure

### Backend (api) — modifiche additive
- **Modify** `apps/api/src/bookings/bookings.service.ts` — `releaseAbsence(id, input, opts?)` e `cancelAbsenceRelease(id, releaseId, opts?)` con `source`/`actingCustomerId`; nuovo `listSubscriptionsForCustomer(customerId)`.
- **Create** `apps/api/src/bookings/customer-bookings.controller.ts` — `@Controller('customer')` guarded `CustomerJwtGuard`, 3 rotte cliente.
- **Modify** `apps/api/src/bookings/bookings.module.ts` — registra `CustomerBookingsController`.
- **Modify** `apps/api/src/bookings/bookings.controller.ts` — call-site operatore invariato (default source='operator').
- **Create** `apps/api/test/helpers/customer-auth.ts` — helper condivisi `provisionCustomerAccess`/`activateCustomer` (estratti dallo spec S3, DRY).
- **Modify** `apps/api/test/customer-access.e2e-spec.ts` — usa gli helper estratti (resta verde).
- **Create** `apps/api/test/customer-subscriptions.e2e-spec.ts` — e2e S4 (me/subscriptions, release cliente, ownership, cancel RESOLD, cross-tenant, regressione operatore).

### Frontend — nuova app `apps/web-customer/` (clonata da `web-platform`)
- **Create** config: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`, `index.html`, `Dockerfile`, `nginx.conf`, `public/{favicon.svg,pwa-192.png,pwa-512.png}`.
- **Create** `src/lib/`: `authToken.ts` (access+refresh keys), `http.ts` (interceptor 401 → refresh → retry/logout, D-037), `queryClient.ts`, `queryKeys.ts`, `useQueryResource.ts`, `toasts.ts`.
- **Create** `src/stores/session.ts` — `activate(token,pin)`, `refresh()`, `logout()`, `rehydrate()`.
- **Create** `src/router/index.ts` + `meta.d.ts` — attivazione pubblica, resto privato.
- **Create** `src/features/subscriptions/`: `useMySubscriptions.ts`, viste `ActivationView.vue`, `MySubscriptionsView.vue`, `AbsenceReleaseModal.vue`, spec.
- **Create** `src/main.ts`, `src/App.vue`, `src/app/CustomerShell.vue`, `src/styles/main.css`, `src/test/setup.ts`.
- **Modify** `docker-compose.yml` (+ service `web-customer`, porta `8082:80`), `.claude/launch.json` (+ entry dev).

### Docs (DoD ADR-0009)
- **Modify** `docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md` — addendum "S4 realizzata".
- **Modify** `docs/design/flows.md` — nota `source='customer'` sul flusso release; conferma §9.
- **Create** `docs/design/mockups/web-customer-*.html` — attivazione, abbonamenti, segnala-assenza, storico.
- **Modify** `docs/architecture/deferred.md` — D-037 «Risolta» su web-customer; D-035 modulo **chiuso**.

---

## PARTE A — Backend (endpoint cliente)

### Task A1: `releaseAbsence` — parametri `source` + ownership

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts:880-935`
- Test: `apps/api/test/customer-subscriptions.e2e-spec.ts` (creato in A6; qui basta un unit di firma se serve — la copertura vera è e2e)

**Interfaces:**
- Consumes: `AbsenceReleaseSource` da `@coralyn/contracts` (già importabile), `ReleaseAbsenceInput`.
- Produces: `releaseAbsence(id: string, input: ReleaseAbsenceInput, opts?: { source?: AbsenceReleaseSource; actingCustomerId?: string }): Promise<BookingDTO>`.

- [ ] **Step 1: Aggiorna la firma e la logica.** In `bookings.service.ts`, importa il tipo se manca (`import type { AbsenceReleaseSource } from '@coralyn/contracts'` — verifica: `ReleaseAbsenceInput` è già importato riga 24, aggiungi `AbsenceReleaseSource` allo stesso import da contracts). Poi modifica il metodo:

```ts
async releaseAbsence(
  id: string,
  input: ReleaseAbsenceInput,
  opts?: { source?: AbsenceReleaseSource; actingCustomerId?: string },
): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const source = opts?.source ?? 'operator';
  const day = 24 * 60 * 60 * 1000;
  const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.booking.findFirst({
      where: { id, ...(opts?.actingCustomerId ? { customerId: opts.actingCustomerId } : {}) },
      include: { absenceReleases: true, suspensions: true },
    });
    if (!existing) return { error: 'NOT_FOUND' as const };
    // ...resto INVARIATO fino alla create della AbsenceRelease...
```

E alla create della `absenceRelease` (riga ~916) sostituisci `source: 'operator'` con `source,`:

```ts
    await tx.absenceRelease.create({
      data: { bookingId: id, establishmentId: tenantId, date: D, source, reason: input.reason ?? null },
    });
```

Il blocco `if ('error' in outcome)` resta invariato (l'ownership-mismatch cade in `NOT_FOUND` → 404, come da §5.4).

- [ ] **Step 2: Verifica che l'operatore non regredisca (RED→GREEN sulla suite esistente).**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'assenze comunicate'`
Expected: PASS (gli endpoint operatore non passano `opts` → `source='operator'`, nessun `actingCustomerId` → nessun vincolo cliente; comportamento identico).

- [ ] **Step 3: Typecheck.**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): releaseAbsence accetta source+actingCustomerId (canale cliente D-035 S4)"
```

---

### Task A2: `cancelAbsenceRelease` — ownership

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts:943-991`

**Interfaces:**
- Produces: `cancelAbsenceRelease(id: string, releaseId: string, opts?: { actingCustomerId?: string }): Promise<BookingDTO>`.

- [ ] **Step 1: Aggiorna firma + lookup con ownership.**

```ts
async cancelAbsenceRelease(
  id: string,
  releaseId: string,
  opts?: { actingCustomerId?: string },
): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id, ...(opts?.actingCustomerId ? { customerId: opts.actingCustomerId } : {}) },
      include: { timeSlot: true, suspensions: true },
    });
    if (!booking) return { error: 'NOT_FOUND' as const };
    // ...resto INVARIATO...
```

Il `source` non è rilevante per il cancel; la logica RESOLD/ricopertura resta identica.

- [ ] **Step 2: Verifica non-regressione operatore.**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'assenze comunicate'`
Expected: PASS.

- [ ] **Step 3: Typecheck.**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): cancelAbsenceRelease con vincolo ownership cliente (D-035 S4)"
```

---

### Task A3: `listSubscriptionsForCustomer` (riuso `listByCustomer`)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (aggiungi metodo dopo `listByCustomer`, ~riga 158)

**Interfaces:**
- Consumes: `listByCustomer(customerId): Promise<CustomerBookingDTO[]>` (esistente, riga 70).
- Produces: `listSubscriptionsForCustomer(customerId: string): Promise<CustomerBookingDTO[]>`.

- [ ] **Step 1: Scrivi il metodo (DRY: filtra il risultato del metodo esistente).**

```ts
/** Solo gli ABBONAMENTI del cliente (canale self-service D-035 S4). Riusa listByCustomer
 *  (single source: stessa proiezione, resold, arricchimenti); il canale cliente passa il proprio
 *  customerId dal JWT → nessun IDOR. Il piccolo over-fetch (booking non-subscription poi scartati)
 *  è trascurabile sul volume di un singolo cliente. */
async listSubscriptionsForCustomer(customerId: string): Promise<CustomerBookingDTO[]> {
  const all = await this.listByCustomer(customerId);
  return all.filter((b) => b.type === 'subscription');
}
```

- [ ] **Step 2: Typecheck.**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit.**

```bash
git add apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): listSubscriptionsForCustomer per il canale cliente (D-035 S4)"
```

---

### Task A4: `CustomerBookingsController` + wiring modulo

**Files:**
- Create: `apps/api/src/bookings/customer-bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`

**Interfaces:**
- Consumes: `BookingsService` (stesso modulo), `CustomerJwtGuard` + `CurrentCustomer` + `CustomerPrincipal` (da `customer-auth`, esportati da `CustomerAuthModule` già importato in `BookingsModule`), `ReleaseAbsenceDto` (esistente).
- Produces rotte: `GET /api/customer/me/subscriptions`, `POST /api/customer/subscriptions/:bookingId/absence-releases`, `POST /api/customer/subscriptions/:bookingId/absence-releases/:rid/cancel`.

- [ ] **Step 1: Crea il controller.** (Nota: `@Public()` per-metodo per bypassare la `JwtAuthGuard` staff globale, come nello S3 `CustomerAuthController`; `CustomerJwtGuard` a livello classe fa l'auth cliente.)

```ts
import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { BookingDTO, CustomerBookingDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import type { CustomerPrincipal } from '../customer-auth/customer-principal';
import { BookingsService } from './bookings.service';
import { ReleaseAbsenceDto } from './dto/release-absence.dto';

/** Rotte di dominio del canale cliente self-service (D-035 S4). Separate dall'auth
 *  (CustomerAuthController) per blast-radius (ADR-0049 §5.6). Ownership a 2 assi: RLS (tenant dal
 *  guard) + customerId dal principal → passato ai domain service come actingCustomerId. */
@UseGuards(CustomerJwtGuard)
@Controller('customer')
export class CustomerBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Public()
  @Get('me/subscriptions')
  mySubscriptions(@CurrentCustomer() c: CustomerPrincipal): Promise<CustomerBookingDTO[]> {
    return this.bookings.listSubscriptionsForCustomer(c.id);
  }

  @Public()
  @Post('subscriptions/:bookingId/absence-releases')
  @HttpCode(200)
  releaseAbsence(
    @Param('bookingId') bookingId: string,
    @Body() body: ReleaseAbsenceDto,
    @CurrentCustomer() c: CustomerPrincipal,
  ): Promise<BookingDTO> {
    return this.bookings.releaseAbsence(bookingId, body, { source: 'customer', actingCustomerId: c.id });
  }

  @Public()
  @Post('subscriptions/:bookingId/absence-releases/:rid/cancel')
  @HttpCode(200)
  cancelAbsenceRelease(
    @Param('bookingId') bookingId: string,
    @Param('rid') rid: string,
    @CurrentCustomer() c: CustomerPrincipal,
  ): Promise<BookingDTO> {
    return this.bookings.cancelAbsenceRelease(bookingId, rid, { actingCustomerId: c.id });
  }
}
```

- [ ] **Step 2: Registra nel modulo.** In `bookings.module.ts` aggiungi `CustomerBookingsController` all'array `controllers`:

```ts
import { CustomerBookingsController } from './customer-bookings.controller';
// ...
  controllers: [BookingsController, RenewalCampaignsController, CustomerBookingsController],
```

(`CustomerAuthModule` è già in `imports` → `CustomerJwtGuard` è disponibile; nessun ciclo: `CustomerAuthModule` non importa `BookingsModule`.)

- [ ] **Step 3: Typecheck + boot dell'app (verifica route + niente ciclo DI).**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0.
Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer me + logout'`
Expected: PASS (conferma che l'app monta con il nuovo controller registrato).

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/bookings/customer-bookings.controller.ts apps/api/src/bookings/bookings.module.ts
git commit -m "feat(api): CustomerBookingsController (me/subscriptions + release cliente) [D-035 S4]"
```

---

### Task A5: Estrai gli helper e2e cliente (DRY)

**Files:**
- Create: `apps/api/test/helpers/customer-auth.ts`
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (usa gli helper; resta verde)

**Interfaces:**
- Produces: `provisionCustomerAccess(app, adminToken, bookingId): Promise<{ activationUrl: string; pin: string; enrollmentToken: string }>` e `activateCustomer(app, enrollmentToken, pin): Promise<{ accessToken: string; refreshToken: string }>`.

- [ ] **Step 1: Leggi le implementazioni attuali** in `customer-access.e2e-spec.ts` (`provision` ~riga 100, `activate` ~riga 114) per replicarne la semantica esatta (endpoint `POST /api/bookings/:id/customer-access`, estrazione token con `match(/token=([^&]+)/)` perché `CUSTOMER_APP_URL` non è settato in `.env.test`).

- [ ] **Step 2: Crea l'helper condiviso** (firme parametriche; nessuna dipendenza da closure del describe):

```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { CustomerProvisionResponse, CustomerAuthResponse } from '@coralyn/contracts';

export async function provisionCustomerAccess(
  app: INestApplication,
  adminToken: string,
  bookingId: string,
): Promise<{ activationUrl: string; pin: string; enrollmentToken: string }> {
  const res = await request(app.getHttpServer())
    .post(`/api/bookings/${bookingId}/customer-access`)
    .set('authorization', `Bearer ${adminToken}`)
    .expect(201);
  const body = res.body as CustomerProvisionResponse;
  const enrollmentToken = body.activationUrl.match(/token=([^&]+)/)![1];
  return { activationUrl: body.activationUrl, pin: body.pin, enrollmentToken };
}

export async function activateCustomer(
  app: INestApplication,
  enrollmentToken: string,
  pin: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/customer/activate')
    .send({ enrollmentToken, pin })
    .expect(200);
  return res.body as CustomerAuthResponse;
}
```

(Verifica la forma HTTP reale — status 201/200, header auth `bearer` — contro lo spec S3 mentre lo leggi allo Step 1, e allinea se differisce.)

- [ ] **Step 3: Refactor `customer-access.e2e-spec.ts`** per usare gli helper (rimuovi le due funzioni locali, importa da `./helpers/customer-auth`, adatta i call-site). Nessun cambiamento di comportamento.

- [ ] **Step 4: Verifica che lo spec S3 resti verde.**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access provisioning'`
Expected: PASS (stesso numero di test di prima).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/test/helpers/customer-auth.ts apps/api/test/customer-access.e2e-spec.ts
git commit -m "test(api): estrai helper provision/activate cliente (DRY per S4) [D-035 S4]"
```

---

### Task A6: e2e S4 — release cliente, ownership, RESOLD, cross-tenant

**Files:**
- Create: `apps/api/test/customer-subscriptions.e2e-spec.ts`

**Interfaces:**
- Consumes: `provisionCustomerAccess`/`activateCustomer` (A5), `createTestApp`, `seedMapTenant`/`cleanMapTenant`, `insertBookingWithCoverage`, `createUser`/`login` (helper esistenti, vedi `customer-access.e2e-spec.ts` import block).

- [ ] **Step 1: Scrivi lo spec (RED).** Struttura annidata per condividere `app`/`prisma`/`adminToken` come lo spec S3. Setup: un tenant A con un abbonamento (consenso attivo) del cliente A, e un tenant B con abbonamento del cliente B. Attiva l'accesso di A. Test:

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { provisionCustomerAccess, activateCustomer } from './helpers/customer-auth';
// + seed helpers come in customer-access.e2e-spec.ts (seedMapTenant, insertBookingWithCoverage, createUser/login)

describe('Customer subscriptions channel (D-035 S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // ...adminToken A, bookingId A (subscription, consenso ON), customerId A; tenant B analogo...
  // Il setup segue customer-access.e2e-spec.ts (beforeAll: createTestApp, seed A e B, consenso ON su bookingA).

  const relativeFutureDate = (): string => {
    // dentro la stagione e ≥ oggi (mirror del fix bookings.e2e-spec: todayInRome()+3g)
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    return d.toISOString().slice(0, 10);
  };

  it('GET /customer/me/subscriptions → solo i propri abbonamenti', async () => {
    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, bookingIdA);
    const { accessToken } = await activateCustomer(app, enrollmentToken, pin);
    const res = await request(app.getHttpServer())
      .get('/api/customer/me/subscriptions')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(bookingIdA);
    expect(res.body[0].type).toBe('subscription');
  });

  it('POST release cliente → carve coverage + source=customer', async () => {
    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, bookingIdA);
    const { accessToken } = await activateCustomer(app, enrollmentToken, pin);
    const date = relativeFutureDate();
    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingIdA}/absence-releases`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ date })
      .expect(200);
    const rel = await prisma.forTenant(establishmentIdA, (tx) =>
      tx.absenceRelease.findFirst({ where: { bookingId: bookingIdA }, orderBy: { createdAt: 'desc' } }));
    expect(rel!.source).toBe('customer');
  });

  it('OWNERSHIP: cliente A non può liberare un abbonamento di B → 404', async () => {
    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, bookingIdA);
    const { accessToken } = await activateCustomer(app, enrollmentToken, pin);
    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingIdB}/absence-releases`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ date: relativeFutureDate() })
      .expect(404); // stesso codice di "non trovato": nessun leak d'esistenza
  });

  it('me/subscriptions di A non contiene mai booking di B (cross-tenant/customer)', async () => {
    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, bookingIdA);
    const { accessToken } = await activateCustomer(app, enrollmentToken, pin);
    const res = await request(app.getHttpServer())
      .get('/api/customer/me/subscriptions')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.every((b: { id: string }) => b.id !== bookingIdB)).toBe(true);
  });

  it('CANCEL cliente su giorno rivenduto → 409 RESOLD', async () => {
    // release del giorno D come cliente → poi rivendita operatore di quel giorno (prenotazione daily)
    // → cancel cliente della propria release → 409.
    // (Riusa il pattern di rivendita degli e2e S2; assicura slot/ombrellone coincidenti.)
  });

  it('REGRESSIONE: endpoint operatore restano source=operator', async () => {
    const date = relativeFutureDate();
    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingIdA2}/absence-releases`)
      .set('authorization', `Bearer ${adminTokenA}`)
      .send({ date })
      .expect(200);
    const rel = await prisma.forTenant(establishmentIdA, (tx) =>
      tx.absenceRelease.findFirst({ where: { bookingId: bookingIdA2 }, orderBy: { createdAt: 'desc' } }));
    expect(rel!.source).toBe('operator');
  });
});
```

(I placeholder di setup vanno riempiti replicando ESATTAMENTE il `beforeAll` di `customer-access.e2e-spec.ts` — tenant A+B, consenso ON via `PATCH /api/bookings/:id/absence-consent`. Il test RESOLD riusa la meccanica di rivendita già coperta negli e2e S2 di `bookings.e2e-spec.ts`.)

- [ ] **Step 2: Esegui (RED prima dell'impl? No — A1..A4 sono già implementati, quindi qui è GREEN diretto).**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer subscriptions channel'`
Expected: PASS (tutti i test). Se un test non è ancora coperto dai task A1-A4, è un gap → torna al task backend relativo.

- [ ] **Step 3: Full e2e (nessuna regressione).**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand`
Expected: PASS, **≥ 345 + nuovi**.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/test/customer-subscriptions.e2e-spec.ts
git commit -m "test(api): e2e canale cliente S4 (release+ownership+RESOLD+cross-tenant) [D-035 S4]"
```

---

## PARTE B — Frontend `apps/web-customer`

> **Nota di scaffolding:** clona la struttura di `apps/web-platform` (vedi mappa in questo piano). Le viste/logiche cambiano; config/tooling si copiano con i valori adattati sotto. **Nessuna dep nuova** → nessun `pnpm add`.

### Task B1: Scaffold app + boot

**Files:**
- Create: `apps/web-customer/package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `Dockerfile`, `nginx.conf`, `public/{favicon.svg,pwa-192.png,pwa-512.png}`, `src/main.ts`, `src/App.vue`, `src/app/CustomerShell.vue`, `src/styles/main.css`, `src/test/setup.ts`, `src/lib/{queryClient.ts,queryKeys.ts,toasts.ts,useQueryResource.ts}`.
- Modify: `docker-compose.yml`, `.claude/launch.json`

- [ ] **Step 1: Copia la struttura.** Da `apps/web-platform` copia: `vite.config.ts`, `vitest.config.ts`, i 3 `tsconfig*.json`, `index.html`, `Dockerfile`, `nginx.conf`, `src/styles/main.css`, `src/test/setup.ts`, `src/lib/{queryClient.ts,toasts.ts,useQueryResource.ts}` **verbatim**. Copia `apps/web-staff/public/{favicon.svg,pwa-192.png,pwa-512.png}` in `apps/web-customer/public/`.

- [ ] **Step 2: `package.json`** — identico a web-platform ma `"name": "@coralyn/web-customer"`. (Stesse deps/devDeps/scripts; già nel lockfile.)

- [ ] **Step 3: Adatta i valori app-specifici:**
  - `index.html`: `<title>Coralyn · Clienti</title>`, `lang="it"`.
  - `vite.config.ts` manifest: `name: 'Coralyn · Clienti'`, `short_name: 'Coralyn'`. Mantieni `optimizeDeps.include: ['@coralyn/contracts']`, `server.proxy['/api'] → http://localhost:3000`, `devOptions.enabled: false`.
  - `src/App.vue`: renderizza `CustomerShell` (crea `src/app/CustomerShell.vue` minimale: `<RouterView />` + `<ToastHost />` se copi il toast host; altrimenti solo `<RouterView />`).
  - `src/lib/queryKeys.ts`:
    ```ts
    export const queryKeys = {
      mySubscriptions: () => ['customer', 'subscriptions'] as const,
    };
    ```

- [ ] **Step 4: `src/main.ts`** — come web-platform (Pinia → VueQuery → `rehydrate()` → router → mount), ma la store è quella cliente (B3) e il router è B4. Mantieni il `cleanupDevServiceWorker` (utile in dev).

- [ ] **Step 5: Registra dev/build:**
  - `docker-compose.yml`: aggiungi servizio `web-customer` (clona il blocco `web-platform`, `container_name: coralyn-web-customer`, `dockerfile: apps/web-customer/Dockerfile`, `ports: ["8082:80"]`, stesso `depends_on: api`).
  - `.claude/launch.json`: aggiungi `{ "name": "web-customer", "runtimeExecutable": "pnpm", "runtimeArgs": ["--filter", "@coralyn/web-customer", "dev"], "port": 5175, "autoPort": true }`.

- [ ] **Step 6: Installa il workspace + verifica boot.**

Run: `corepack pnpm install --no-frozen-lockfile`
Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `corepack pnpm --filter @coralyn/web-customer run typecheck`
Expected: exit 0 (dopo B2-B5 completi; se mancano store/router referenziati da main.ts, completa prima B3/B4 e ri-typecheck — questo task e B3/B4 formano un unico "boot verde").

- [ ] **Step 7: Commit.**

```bash
git add apps/web-customer docker-compose.yml .claude/launch.json pnpm-lock.yaml
git commit -m "chore(web-customer): scaffold app PWA da template web-platform [D-035 S4]"
```

---

### Task B2: `authToken` + `http.ts` con interceptor 401 (D-037)

**Files:**
- Create: `apps/web-customer/src/lib/authToken.ts`, `apps/web-customer/src/lib/http.ts`
- Test: `apps/web-customer/src/lib/http.spec.ts`

**Interfaces:**
- Produces: `getAccessToken/setAccessToken/clearTokens/getRefreshToken/setRefreshToken` (authToken); `apiFetch<T>(path, init?)` con refresh-on-401 (http). `apiFetch` chiama, su 401, un callback di refresh registrato dalla store (per evitare import circolare store↔http).

- [ ] **Step 1: `authToken.ts`** (chiavi DISTINTE da web-staff/web-platform — [[coralyn-dev-preview-env]]):

```ts
export const ACCESS_KEY = 'coralyn.customer.access.token';
export const REFRESH_KEY = 'coralyn.customer.refresh.token';
export function getAccessToken(): string | null { return localStorage.getItem(ACCESS_KEY); }
export function setAccessToken(t: string): void { localStorage.setItem(ACCESS_KEY, t); }
export function getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY); }
export function setRefreshToken(t: string): void { localStorage.setItem(REFRESH_KEY, t); }
export function clearTokens(): void { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); }
```

- [ ] **Step 2: Scrivi il test (RED)** `http.spec.ts` — un 401 innesca una sola chiamata di refresh e ritenta; se il refresh fallisce, chiama `onAuthFailure` e propaga `ApiError`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, setRefreshHandler } from './http';
import { setAccessToken, setRefreshToken } from './authToken';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('401 → refresh riuscito → ritenta una volta e ritorna il dato', async () => {
  setAccessToken('old'); setRefreshToken('r1');
  const onFailure = vi.fn();
  setRefreshHandler({
    refresh: async () => { setAccessToken('new'); return true; },
    onAuthFailure: onFailure,
  });
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const out = await apiFetch<{ ok: boolean }>('/customer/me/subscriptions');
  expect(out).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(onFailure).not.toHaveBeenCalled();
});

it('401 → refresh fallito → onAuthFailure + ApiError', async () => {
  setAccessToken('old'); setRefreshToken('r1');
  const onFailure = vi.fn();
  setRefreshHandler({ refresh: async () => false, onAuthFailure: onFailure });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
  await expect(apiFetch('/customer/me/subscriptions')).rejects.toBeInstanceOf(ApiError);
  expect(onFailure).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Run test → FAIL.**

Run: `corepack pnpm --filter @coralyn/web-customer test -- http.spec`
Expected: FAIL (`apiFetch`/`setRefreshHandler` non definiti).

- [ ] **Step 4: Implementa `http.ts`** (parte da web-platform, aggiungi l'anello refresh; niente segreti in URL):

```ts
import { getAccessToken } from './authToken';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string, serverMessage?: string) {
    super(serverMessage || `HTTP ${status} su ${path}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

// La store registra qui il refresh (evita import circolare store↔http).
interface RefreshHandler { refresh: () => Promise<boolean>; onAuthFailure: () => void; }
let handler: RefreshHandler | null = null;
export function setRefreshHandler(h: RefreshHandler): void { handler = h; }

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const { message } = JSON.parse(await res.text()) as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  } catch { /* fallback */ }
  return undefined;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getAccessToken();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);
  if (res.status === 401 && handler) {
    const ok = await handler.refresh();               // rotazione silenziosa (una volta)
    if (ok) res = await rawFetch(path, init);          // ritenta con il nuovo access token
    else handler.onAuthFailure();                      // refresh morto → logout + redirect attivazione
  }
  if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));
  if (res.status === 204) return null as T;
  const text = await res.text();
  return text.length === 0 ? (null as T) : (JSON.parse(text) as T);
}
```

- [ ] **Step 5: Run test → PASS.**

Run: `corepack pnpm --filter @coralyn/web-customer test -- http.spec`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/web-customer/src/lib/authToken.ts apps/web-customer/src/lib/http.ts apps/web-customer/src/lib/http.spec.ts
git commit -m "feat(web-customer): http con interceptor 401→refresh (D-037) [D-035 S4]"
```

---

### Task B3: Session store (activate / refresh / logout / rehydrate)

**Files:**
- Create: `apps/web-customer/src/stores/session.ts`
- Test: `apps/web-customer/src/stores/session.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, `setRefreshHandler`, `authToken` setters, contracts `CustomerActivateInput`/`CustomerAuthResponse`/`CustomerMeDTO`/`CustomerRefreshInput`.
- Produces: store `session` con `{ me, authenticated, activate(token, pin), refresh(): Promise<boolean>, logout(), rehydrate() }`. Registra `setRefreshHandler` all'init.

- [ ] **Step 1: Test (RED)** — `activate` persiste i token e popola `me`; `refresh` rotea e ritorna true; `logout` pulisce.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from './session';
import * as http from '@/lib/http';
import { getAccessToken, getRefreshToken } from '@/lib/authToken';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.restoreAllMocks(); });

it('activate: persiste access+refresh e carica me', async () => {
  vi.spyOn(http, 'apiFetch')
    .mockResolvedValueOnce({ accessToken: 'a1', refreshToken: 'r1' }) // POST /customer/activate
    .mockResolvedValueOnce({ customerId: 'c1', firstName: 'Mario', lastName: 'Rossi', establishmentName: 'Lido' }); // GET /customer/me
  const s = useSessionStore();
  await s.activate('enroll-tok', '1234');
  expect(getAccessToken()).toBe('a1');
  expect(getRefreshToken()).toBe('r1');
  expect(s.authenticated).toBe(true);
  expect(s.me?.firstName).toBe('Mario');
});
```

- [ ] **Step 2: Run → FAIL.**

Run: `corepack pnpm --filter @coralyn/web-customer test -- session.spec`
Expected: FAIL.

- [ ] **Step 3: Implementa la store.**

```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { CustomerAuthResponse, CustomerMeDTO } from '@coralyn/contracts';
import { apiFetch, setRefreshHandler } from '@/lib/http';
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from '@/lib/authToken';

export const useSessionStore = defineStore('session', () => {
  const me = ref<CustomerMeDTO | null>(null);
  const authenticated = computed(() => me.value !== null);

  async function loadMe(): Promise<void> { me.value = await apiFetch<CustomerMeDTO>('/customer/me'); }

  async function activate(enrollmentToken: string, pin: string): Promise<void> {
    const res = await apiFetch<CustomerAuthResponse>('/customer/activate', {
      method: 'POST', body: JSON.stringify({ enrollmentToken, pin }),
    });
    setAccessToken(res.accessToken); setRefreshToken(res.refreshToken);
    await loadMe();
  }

  async function refresh(): Promise<boolean> {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await apiFetch<CustomerAuthResponse>('/customer/refresh', {
        method: 'POST', body: JSON.stringify({ refreshToken: rt }),
      });
      setAccessToken(res.accessToken); setRefreshToken(res.refreshToken);
      return true;
    } catch { return false; }
  }

  function logout(): void { clearTokens(); me.value = null; }

  async function rehydrate(): Promise<void> {
    if (!getRefreshToken()) return;
    try { await loadMe(); } catch { logout(); }
  }

  // D-037: l'http interceptor usa questi due su 401.
  setRefreshHandler({ refresh, onAuthFailure: logout });

  return { me, authenticated, activate, refresh, logout, rehydrate };
});
```

- [ ] **Step 4: Run → PASS.**

Run: `corepack pnpm --filter @coralyn/web-customer test -- session.spec`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web-customer/src/stores/session.ts apps/web-customer/src/stores/session.spec.ts
git commit -m "feat(web-customer): session store activate/refresh/rehydrate [D-035 S4]"
```

---

### Task B4: Router (attivazione pubblica, resto privato)

**Files:**
- Create: `apps/web-customer/src/router/index.ts`, `apps/web-customer/src/router/meta.d.ts`

**Interfaces:**
- Produces: `router` con rotte `/attiva` (public), `/abbonamenti` (privata, default), redirect `/`→`/abbonamenti`.

- [ ] **Step 1: `meta.d.ts`** (come web-platform ma senza `role`):

```ts
import 'vue-router';
declare module 'vue-router' {
  interface RouteMeta { title?: string; public?: boolean; bare?: boolean; }
}
```

- [ ] **Step 2: `router/index.ts`.**

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/abbonamenti' },
  { path: '/attiva', name: 'activation', component: () => import('@/features/subscriptions/ActivationView.vue'), meta: { public: true, bare: true } },
  { path: '/abbonamenti', name: 'my-subscriptions', component: () => import('@/features/subscriptions/MySubscriptionsView.vue'), meta: { title: 'I miei abbonamenti' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'activation' };
  return true;
});
```

- [ ] **Step 3: Typecheck.**

Run: `corepack pnpm --filter @coralyn/web-customer run typecheck`
Expected: exit 0 (le viste referenziate esistono dopo B5; se typecheck fallisce solo per import mancanti, procedi a B5 e ri-typecheck lì — B4+B5 formano il boot delle viste).

- [ ] **Step 4: Commit.**

```bash
git add apps/web-customer/src/router
git commit -m "feat(web-customer): router (attivazione pubblica, abbonamenti privata) [D-035 S4]"
```

---

### Task B5: Composable + viste (attivazione, abbonamenti, segnala/annulla assenza)

**Files:**
- Create: `apps/web-customer/src/features/subscriptions/useMySubscriptions.ts`
- Create: `apps/web-customer/src/features/subscriptions/ActivationView.vue`
- Create: `apps/web-customer/src/features/subscriptions/MySubscriptionsView.vue`
- Create: `apps/web-customer/src/features/subscriptions/AbsenceReleaseModal.vue`
- Test: `apps/web-customer/src/features/subscriptions/MySubscriptionsView.spec.ts`, `ActivationView.spec.ts`

**Interfaces:**
- Consumes: `queryResource`/`mutationResource` (`@/lib/useQueryResource`), `queryKeys`, `apiFetch`, contracts `CustomerBookingDTO`/`AbsenceReleaseDTO`/`ReleaseAbsenceInput`, `@coralyn/ui-kit` components, `useSessionStore`.
- Produces: `useMySubscriptions()`, `useReleaseAbsence()`, `useCancelRelease()`.

- [ ] **Step 1: Composable `useMySubscriptions.ts`.**

```ts
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useMySubscriptions() {
  return queryResource({
    queryKey: () => queryKeys.mySubscriptions(),
    queryFn: () => apiFetch<CustomerBookingDTO[]>('/customer/me/subscriptions'),
  });
}

export function useReleaseAbsence(bookingId: () => string) {
  return mutationResource({
    mutationFn: (input: { date: string; reason?: string }) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.mySubscriptions()],
  });
}

export function useCancelRelease(bookingId: () => string) {
  return mutationResource({
    mutationFn: (releaseId: string) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases/${releaseId}/cancel`, { method: 'POST' }),
    invalidates: () => [queryKeys.mySubscriptions()],
  });
}
```

- [ ] **Step 2: Test viste (RED)** — `MySubscriptionsView` renderizza le righe da una query mockata; `ActivationView` chiama `session.activate` al submit. Segui il pattern di `apps/web-platform/src/features/establishments/*.spec.ts` (mount con `@vue/test-utils`, mock del composable/della store).

```ts
// MySubscriptionsView.spec.ts — mock useMySubscriptions per ritornare 1 abbonamento con consenso ON
// assert: appare l'umbrellaLabel; il bottone "Segnala assenza" è presente.
// ActivationView.spec.ts — mock useSessionStore().activate; submit form (token+pin) → activate chiamato con gli input.
```

- [ ] **Step 3: Run → FAIL.**

Run: `corepack pnpm --filter @coralyn/web-customer test -- subscriptions`
Expected: FAIL (viste non implementate).

- [ ] **Step 4: Implementa le viste.**
  - `ActivationView.vue`: legge il token da query/fragment (`?token=` dal link QR), form PIN, `await session.activate(token, pin)` → `router.push('/abbonamenti')`; errori generici (nessun dettaglio d'auth). Usa `@coralyn/ui-kit` (`Button`, input) e lo stile di `LoginView.vue`.
  - `MySubscriptionsView.vue`: `useMySubscriptions()`; lista read-only (umbrellaLabel, span, fascia/`seasonName`, stato canale = `absenceConsentAt`); per ogni abbonamento con consenso ON, bottone "Segnala assenza" → apre `AbsenceReleaseModal`; sezione storico release (`absenceReleases[]`) con badge `resold` (rivenduto → non annullabile) o azione "Annulla" (`useCancelRelease`).
  - `AbsenceReleaseModal.vue`: replica la meccanica del mockup S2 `docs/design/mockups/absence-release-modal.html` (selezione giorno dentro lo span, preview, conferma) → `useReleaseAbsence(bookingId).mutate({ date })`. Riusa i componenti modale di `ui-kit`.

- [ ] **Step 5: Run → PASS + typecheck.**

Run: `corepack pnpm --filter @coralyn/web-customer test`
Expected: PASS.
Run: `corepack pnpm --filter @coralyn/web-customer run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add apps/web-customer/src/features apps/web-customer/src/app apps/web-customer/src/App.vue apps/web-customer/src/main.ts
git commit -m "feat(web-customer): viste attivazione/abbonamenti/segnala-assenza [D-035 S4]"
```

---

## PARTE C — Verifica LIVE + Docs (DoD ADR-0009)

### Task C1: Verifica LIVE su Docker

**Files:** nessuna modifica (verifica).

- [ ] **Step 1: Avvia lo stack.**

Run: `docker compose --profile full up -d --build`
Expected: `coralyn-web-customer` up su `:8082`; api healthy su `:3000`.

- [ ] **Step 2: Provisioning operatore.** In web-staff (`:8080`, login `admin@coralyn.dev`/`coralyn-admin-8473`), su un abbonamento con consenso ON, genera l'accesso cliente (`POST /bookings/:id/customer-access`) → annota `activationUrl` + `pin`.

- [ ] **Step 3: Flusso cliente su web-customer (`:8082`).** Apri l'`activationUrl` (usa il token dal link) → inserisci il PIN → verifica lista abbonamenti → segnala un'assenza per un giorno futuro → verifica in web-staff/mappa che quel giorno risulti liberato (rivendibile) e la cassa dell'abbonato invariata.

- [ ] **Step 4: 401/refresh (D-037).** Attendi la scadenza dell'access JWT (o forzala) → un'azione deve rotare silenziosamente il refresh e proseguire; revoca l'accesso da web-staff → l'azione successiva deve fare logout + redirect all'attivazione. Cattura screenshot delle schermate chiave.

- [ ] **Step 5: Documenta l'esito LIVE** (screenshot + note) nel messaggio di review; nessun commit.

---

### Task C2: Docs DoD (ADR-0009) + deferred.md

**Files:**
- Modify: `docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md`
- Modify: `docs/design/flows.md`
- Create: `docs/design/mockups/web-customer-{attivazione,abbonamenti,segnala-assenza,storico}.html`
- Modify: `docs/architecture/deferred.md`

> **Sub-skill:** usa `anthropic-skills:design-docs` per i mockup e l'aggiornamento diagrammi/flows.

- [ ] **Step 1: ADR-0049 addendum** — sezione "S4 realizzata": endpoint cliente (`GET /me/subscriptions`, `POST subscriptions/:id/absence-releases[/:rid/cancel]`), `source` impostato dal controller (non dal body), ownership a 2 assi, app `web-customer` + interceptor 401 (D-037). Nessuna nuova tabella.

- [ ] **Step 2: `flows.md`** — conferma §9 (macchina a stati accesso, già presente da S3) e aggiungi la nota `source='customer'` sul flusso release §7 (il carve è identico; cambia solo attore + `source`).

- [ ] **Step 3: Mockup** delle 4 schermate web-customer (HTML statici, pattern dei mockup esistenti in `docs/design/mockups/`).

- [ ] **Step 4: `deferred.md`** — **D-037 → «Risolta»** su web-customer (interceptor 401 → refresh o logout/redirect; nota "applicabile a web-staff come follow-up"); **D-035 → modulo CHIUSO** (S1+S2+S3+S4 fatte). Aggiorna la baseline test finale.

- [ ] **Step 5: Commit.**

```bash
git add docs/
git commit -m "docs: D-035 S4 realizzata (ADR-0049 addendum, flows, mockup, deferred D-037 risolta) [D-035 S4]"
```

---

## Self-Review (esito)

**1. Copertura spec:**
- §6.3 `GET /me/subscriptions` → A3+A4; release cliente → A1+A4; cancel cliente → A2+A4. ✔
- §5.4 ownership 404 → A1/A2 (`actingCustomerId` nel where) + A6 (test). ✔
- §8 app `web-customer` (4 viste, session store, refresh silenzioso + 401 interceptor) → B1-B5. ✔ (D-037 → B2)
- §9 contracts → nessun cambiamento necessario (tipi già esistenti); annotato in Global Constraints. ✔
- §10 testing → A6 (e2e cliente/ownership/RESOLD/cross-tenant + regressione operatore), B2/B3/B5 (unit/component). ✔
- §11 docs → C2. ✔
- **Refinement segnalato:** `source` come parametro del service (non body) — più sicuro dello `input.source` letterale della spec; stesso effetto di dominio. Documentato in Global Constraints + C2 Step 1.

**2. Placeholder:** i blocchi di setup e2e (A6) e le viste (B5) rimandano a pattern esistenti esatti (file citati) invece di codice inline completo — accettabile perché sono repliche 1:1 di file letti nel repo, non logica nuova; ogni step ha comando + expected. Nessun "TODO/handle errors" generico.

**3. Consistenza tipi:** `releaseAbsence(id, input, opts?)` / `cancelAbsenceRelease(id, releaseId, opts?)` usati con la stessa firma in A1/A2 (service) e A4 (controller). `apiFetch`/`setRefreshHandler`/`RefreshHandler{refresh,onAuthFailure}` coerenti tra B2 (def) e B3 (uso). `queryKeys.mySubscriptions()` coerente B1/B5. ✔

**Ordine di esecuzione:** A1→A2→A3→A4→A5→A6 (backend completo e verde) → B1→B2→B3→B4→B5 (FE) → C1 (LIVE) → C2 (docs). Backend e FE sono sequenziali ma indipendenti dopo A6.
