# Assenze comunicate (D-035 S1+S2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consentire all'operatore di catturare il consenso "assenze comunicate" su un abbonamento e registrare una release per `(abbonamento, giorno)` che apre la rivendita di quel posto, senza toccare la cassa dell'abbonato.

**Architecture:** Additiva su `Booking`/`BookingCoverage` (D-013). Nuova child `AbsenceRelease` (RLS FORCE, pura storia) + campo `Booking.absenceConsentAt`. Tre endpoint admin-only sul controller `bookings`: `PATCH …/absence-consent`, `POST …/absence-releases`, `POST …/absence-releases/:rid/cancel`. La release scava un buco a **giorno singolo** in `BookingCoverage` (versione a giorno singolo del carve sospensione); la rivendita usa il flusso giornaliero esistente. Le release + lo stato consenso vengono proiettati su `CustomerBookingDTO` (mai su `BookingDTO`).

**Tech Stack:** NestJS + Prisma (PostgreSQL RLS) · `@coralyn/contracts` (tipi TS condivisi) · Vue 3 + TanStack Query + Vitest + MSW (`apps/web-staff`).

**Spec:** [`docs/superpowers/specs/2026-07-09-assenze-comunicate-release-operatore-design.md`](../specs/2026-07-09-assenze-comunicate-release-operatore-design.md)

## Global Constraints

- **pnpm via corepack, MAI npm.** Comandi filtrati per package: `corepack pnpm --filter <pkg> run <script>`.
- **Baseline da NON regredire:** api unit **223** · api e2e **273** (`--runInBand`) · web-staff **348** · ui-kit **111** · web-platform **16** · typecheck pulito. Ogni task **aggiunge** test, mai rimuove.
- **Gate typecheck FE reale** = `corepack pnpm --filter @coralyn/web-staff run typecheck` (`vue-tsc -b`), **non** `vue-tsc --noEmit`. **Ogni** `.spec.ts` importa esplicitamente da `vitest` (`import { describe, it, expect, vi } from 'vitest'`).
- **Rebuild `@coralyn/contracts`** (`corepack pnpm --filter @coralyn/contracts run build`) dopo **ogni** modifica a `packages/contracts/src/` e prima di typecheck/e2e di api e web-staff.
- **Migrazioni:** `migrate deploy` a **dev E test DB** (env alla radice repo, `dotenv-cli`), **mai** `db push`. Nuove tabelle tenant = **RLS ENABLE+FORCE + policy `tenant_isolation`**. Purge di node_modules → `prisma generate` di nuovo.
- **e2e api** ts-jest **type-checka** → sempre `--runInBand`.
- **Rotte** sotto `/api`. **Occupazione** su `BookingCoverage`; **span/diritti/titolarità** su `Booking`.
- **Cassa abbonato INTATTA:** la release **non** tocca `Booking.amountCollected`/`refundedAmount`/`paymentStatus`/`startDate`/`endDate`. Verificato in ogni test di release.
- **Admin-only:** tutti e tre gli endpoint `@Roles(Role.Admin)`; e2e verifica 403 per staff.

Comandi di verifica ricorrenti (dalla radice repo):
```bash
corepack pnpm --filter @coralyn/api run test           # unit (jest)
corepack pnpm --filter @coralyn/api run test:e2e        # e2e (--runInBand già nello script)
corepack pnpm --filter @coralyn/api run typecheck
corepack pnpm --filter @coralyn/web-staff run test
corepack pnpm --filter @coralyn/web-staff run typecheck # vue-tsc -b
```
Applicazione migrazione a dev + test (dalla radice, come nelle slice D-013):
```bash
corepack pnpm --filter @coralyn/api exec prisma migrate deploy                        # dev DB (DATABASE_URL)
corepack pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @coralyn/api exec prisma migrate deploy   # test DB
```

---

### Task 1: Schema + migration + contracts (fondazione dati)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Booking` += campo + relazione; nuovo `model AbsenceRelease`; nuovo `enum AbsenceReleaseSource`; `Establishment` += relazione inversa)
- Create: `apps/api/prisma/migrations/20260709120000_absence_release/migration.sql`
- Modify: `packages/contracts/src/index.ts` (DTO + input + estensione `CustomerBookingDTO`)

**Interfaces:**
- Produces (Prisma): `model AbsenceRelease { id, bookingId, establishmentId, date, source: AbsenceReleaseSource, canceledAt, reason, createdAt }`; `Booking.absenceConsentAt: DateTime?`; `Booking.absenceReleases: AbsenceRelease[]`.
- Produces (contracts): `AbsenceReleaseSource = 'operator'|'customer'`; `AbsenceReleaseDTO`; `SetAbsenceConsentInput`; `ReleaseAbsenceInput`; `CustomerBookingDTO.absenceConsentAt: string|null`; `CustomerBookingDTO.absenceReleases: AbsenceReleaseDTO[]`.

- [ ] **Step 1: Prisma schema — enum + campo su Booking + model**

In `apps/api/prisma/schema.prisma`, dentro `model Booking`, sotto la riga `refundedAmount  Decimal   @default(0) @db.Decimal(10, 2)`, aggiungi:
```prisma
  // Consenso "assenze comunicate" (D-035 S1). null = nessun consenso; valorizzato = consenso attivo.
  // Grant/revoke via PATCH admin-only. Audit chi/quando dei cambi = D-047 (come suspension/transfer).
  absenceConsentAt DateTime?
```
Nella lista relazioni di `Booking` (dopo `transfers  BookingTransfer[]`) aggiungi:
```prisma
  absenceReleases AbsenceRelease[]
```
Dopo `model BookingTransfer { … }` aggiungi il nuovo enum e il model:
```prisma
enum AbsenceReleaseSource {
  operator
  customer
}

// Assenza comunicata dall'abbonato per un singolo giorno (D-035 S1/S2, ADR-0048). Pura storia:
// il buco nell'occupazione vive su BookingCoverage (carve giorno-singolo), NON qui. La release NON tocca
// la cassa né lo span dell'abbonamento. `source` predispone il canale cliente (S4). RLS FORCE.
model AbsenceRelease {
  id              String    @id @default(uuid()) @db.Uuid
  bookingId       String    @db.Uuid
  establishmentId String    @db.Uuid // RLS FORCE tenant-scoped
  date            DateTime  @db.Date // il giorno liberato (fascia = quella del Booking, implicita)
  source          AbsenceReleaseSource @default(operator)
  canceledAt      DateTime? // annullo (soft) prima della rivendita; null = attiva
  reason          String?
  createdAt       DateTime  @default(now())

  booking       Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])

  @@index([bookingId])
  @@index([establishmentId])
}
```
In `model Establishment`, aggiungi la relazione inversa accanto alle altre `…[]` (es. dopo `bookingTransfers …` se presente, altrimenti in fondo alle relazioni):
```prisma
  absenceReleases AbsenceRelease[]
```

- [ ] **Step 2: Scrivere la migration SQL a mano (RLS FORCE, mirror BookingTransfer)**

Crea `apps/api/prisma/migrations/20260709120000_absence_release/migration.sql`:
```sql
-- CreateEnum
CREATE TYPE "AbsenceReleaseSource" AS ENUM ('operator', 'customer');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "absenceConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AbsenceRelease" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "source" "AbsenceReleaseSource" NOT NULL DEFAULT 'operator',
    "canceledAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceRelease_bookingId_idx" ON "AbsenceRelease"("bookingId");

-- CreateIndex
CREATE INDEX "AbsenceRelease_establishmentId_idx" ON "AbsenceRelease"("establishmentId");

-- AddForeignKey
ALTER TABLE "AbsenceRelease" ADD CONSTRAINT "AbsenceRelease_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRelease" ADD CONSTRAINT "AbsenceRelease_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingSuspension/BookingTransfer). Nessun backfill: tabella vuota.
ALTER TABLE "AbsenceRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AbsenceRelease" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AbsenceRelease"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 3: Applicare a dev + test e rigenerare il client**

Run (dalla radice):
```bash
corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Expected: entrambe le `migrate deploy` riportano `1 migration applied` (o "already applied" alla seconda esecuzione); `generate` OK.

- [ ] **Step 4: Contracts — DTO, input, estensione CustomerBookingDTO**

In `packages/contracts/src/index.ts`, subito dopo `export interface CededSubscriptionDTO { … }` (o vicino ai DTO D-013), aggiungi:
```ts
export type AbsenceReleaseSource = 'operator' | 'customer';

/** Un'assenza comunicata registrata su un abbonamento (D-035 S1/S2, ADR-0048). */
export interface AbsenceReleaseDTO {
  id: string;
  date: string;                 // ISO yyyy-mm-dd (giorno liberato)
  source: AbsenceReleaseSource; // operator (S1/S2) | customer (S4)
  canceledAt: string | null;    // ISO datetime | null (attiva)
  resold: boolean;              // il giorno è occupato da altra booking → annullo vietato
  reason?: string;
  createdAt: string;            // ISO datetime
}

/** Grant/revoke del consenso "assenze comunicate" (admin-only). */
export interface SetAbsenceConsentInput {
  consent: boolean;
}

/** Registrazione di un'assenza comunicata per un giorno (admin-only). */
export interface ReleaseAbsenceInput {
  date: string;                 // ISO yyyy-mm-dd, ∈ [start, end], ≥ oggi
  reason?: string;
}
```
Dentro `export interface CustomerBookingDTO { … }`, accanto a `transfers?: TransferDTO[];`, aggiungi:
```ts
  absenceConsentAt?: string | null; // D-035 (additivo): stato consenso; null/assente = non attivo
  absenceReleases?: AbsenceReleaseDTO[]; // D-035 (additivo): sempre valorizzato dal server ([] se nessuna)
```

- [ ] **Step 5: Build contracts + typecheck api**

Run:
```bash
corepack pnpm --filter @coralyn/contracts run build
corepack pnpm --filter @coralyn/api run typecheck
```
Expected: entrambi PASS (nessun consumatore rotto; i campi nuovi sono opzionali/additivi).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260709120000_absence_release packages/contracts/src/index.ts packages/contracts/dist
git commit -m "feat(D-035): schema AbsenceRelease + Booking.absenceConsentAt + contracts"
```

---

### Task 2: `setAbsenceConsent` — service + endpoint + e2e

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (nuovo metodo `setAbsenceConsent`; import `SetAbsenceConsentInput`)
- Create: `apps/api/src/bookings/dto/set-absence-consent.dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts` (endpoint `PATCH :id/absence-consent`)
- Test: `apps/api/src/bookings/bookings.service.spec.ts` (unit) · `apps/api/test/bookings.e2e-spec.ts` (e2e) — usa i file spec esistenti del dominio bookings (mirror dei test `suspend`)

**Interfaces:**
- Consumes: `SetAbsenceConsentInput` (Task 1), `toBookingDTO`, `this.prisma.forTenant`, `this.tenant.require()`.
- Produces: `BookingsService.setAbsenceConsent(id: string, input: SetAbsenceConsentInput): Promise<BookingDTO>`; endpoint `PATCH /bookings/:id/absence-consent`.

- [ ] **Step 1: Unit test (falla) — toggle e guardie del consenso**

Nel describe del service (`bookings.service.spec.ts`), aggiungi (mirror dei test `suspend`; riusa gli helper di setup già presenti nel file — `makeService`/seed abbonamento confermato):
```ts
describe('setAbsenceConsent', () => {
  it('attiva il consenso su un abbonamento confermato', async () => {
    const sub = await seedConfirmedSubscription(); // helper esistente nel file spec
    const dto = await service.setAbsenceConsent(sub.id, { consent: true });
    const row = await rawBooking(sub.id); // helper esistente che rilegge la riga
    expect(row.absenceConsentAt).not.toBeNull();
    expect(dto.id).toBe(sub.id);
  });

  it('revoca il consenso (torna a null)', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    await service.setAbsenceConsent(sub.id, { consent: false });
    expect((await rawBooking(sub.id)).absenceConsentAt).toBeNull();
  });

  it('422 se non è un abbonamento', async () => {
    const daily = await seedConfirmedDaily(); // helper esistente
    await expect(service.setAbsenceConsent(daily.id, { consent: true })).rejects.toThrow(UnprocessableEntityException);
  });

  it('404 se la prenotazione non esiste', async () => {
    await expect(service.setAbsenceConsent(randomUuid(), { consent: true })).rejects.toThrow(NotFoundException);
  });
});
```
> Nota per l'implementer: se i nomi helper (`seedConfirmedSubscription`, `rawBooking`, `seedConfirmedDaily`, `randomUuid`) differiscono nel file, usa quelli realmente presenti (grep `seedConfirmed`/`describe('suspend'` nel file per il pattern esatto). Non introdurre nuovi helper se ne esistono equivalenti.

- [ ] **Step 2: Eseguire il test → deve fallire**

Run: `corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t setAbsenceConsent`
Expected: FAIL — `service.setAbsenceConsent is not a function`.

- [ ] **Step 3: Implementare il metodo service**

In `bookings.service.ts`, aggiungi `SetAbsenceConsentInput` all'import type da `@coralyn/contracts`. Aggiungi il metodo (dopo `transfer`, prima della `}` di chiusura classe):
```ts
/**
 * Grant/revoke del consenso "assenze comunicate" (D-035 S1). Setta/annulla Booking.absenceConsentAt.
 * Idempotente. admin-only. Non tocca cassa/span. La revoca NON annulla le release già registrate.
 */
async setAbsenceConsent(id: string, input: SetAbsenceConsentInput): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id } });
    if (!existing) return { error: 'NOT_FOUND' as const };
    if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
    if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
    if (existing.terminatedAt) return { error: 'TERMINATED' as const };
    const row = await tx.booking.update({
      where: { id },
      data: { absenceConsentAt: input.consent ? new Date() : null },
    });
    return { row };
  });

  if ('error' in outcome) {
    const e = outcome.error;
    if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
    if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno il consenso assenze');
    if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
    throw new UnprocessableEntityException('Abbonamento non attivo'); // NOT_CONFIRMED
  }
  return toBookingDTO(outcome.row);
}
```

- [ ] **Step 4: DTO + endpoint**

Crea `apps/api/src/bookings/dto/set-absence-consent.dto.ts`:
```ts
import { IsBoolean } from 'class-validator';
import type { SetAbsenceConsentInput } from '@coralyn/contracts';

/** Validazione grant/revoke consenso assenze (D-035). Gli invarianti di dominio sono nel service. */
export class SetAbsenceConsentDto implements SetAbsenceConsentInput {
  @IsBoolean()
  consent!: boolean;
}
```
In `bookings.controller.ts`, importa `SetAbsenceConsentDto` e aggiungi l'endpoint (dopo `settle`):
```ts
@Patch(':id/absence-consent')
@Roles(Role.Admin)
setAbsenceConsent(@Param('id') id: string, @Body() body: SetAbsenceConsentDto): Promise<BookingDTO> {
  return this.bookings.setAbsenceConsent(id, body);
}
```

- [ ] **Step 5: Unit verde + e2e (happy + 403 staff)**

Nel file e2e (`bookings.e2e-spec.ts`), aggiungi (mirror del blocco e2e `suspend`; riusa i login helper `adminToken`/`staffToken` già presenti):
```ts
describe('PATCH /bookings/:id/absence-consent', () => {
  it('admin attiva il consenso → 200', async () => {
    const sub = await createConfirmedSubscription(adminToken); // helper e2e esistente
    const res = await request(app.getHttpServer())
      .patch(`/bookings/${sub.id}/absence-consent`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ consent: true });
    expect(res.status).toBe(200);
  });

  it('staff → 403', async () => {
    const sub = await createConfirmedSubscription(adminToken);
    const res = await request(app.getHttpServer())
      .patch(`/bookings/${sub.id}/absence-consent`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ consent: true });
    expect(res.status).toBe(403);
  });
});
```
Run:
```bash
corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t setAbsenceConsent
corepack pnpm --filter @coralyn/api run test:e2e -- -t "absence-consent"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings
git commit -m "feat(D-035): PATCH absence-consent (grant/revoke) admin-only"
```

---

### Task 3: `releaseAbsence` — carve giorno-singolo + endpoint + e2e

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (metodo `releaseAbsence`; import `ReleaseAbsenceInput`)
- Create: `apps/api/src/bookings/dto/release-absence.dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts` (endpoint `POST :id/absence-releases`)
- Test: `bookings.service.spec.ts` · `bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReleaseAbsenceInput`, `toDbDate`, `todayInRome`, `toBookingDTO`.
- Produces: `BookingsService.releaseAbsence(id, input): Promise<BookingDTO>`; endpoint `POST /bookings/:id/absence-releases`.

- [ ] **Step 1: Unit test (falla) — carve + guardie**

```ts
describe('releaseAbsence', () => {
  it('crea il buco a giorno singolo e la release; cassa/span invariati', async () => {
    const sub = await seedConfirmedSubscription();               // span = stagione, 1 coverage
    await service.setAbsenceConsent(sub.id, { consent: true });
    const before = await rawBooking(sub.id);
    const day = midSeasonDate(sub);                              // un giorno interno allo span, ≥ oggi
    await service.releaseAbsence(sub.id, { date: day });

    const covs = await rawCoverages(sub.id);                     // helper: coverage confirmed della booking
    expect(covs.some((c) => within(c, day))).toBe(false);        // il giorno NON è più coperto
    const rel = await rawReleases(sub.id);
    expect(rel).toHaveLength(1);
    expect(rel[0].source).toBe('operator');
    const after = await rawBooking(sub.id);
    expect(after.amountCollected).toStrictEqual(before.amountCollected);
    expect(after.refundedAmount).toStrictEqual(before.refundedAmount);
    expect(after.startDate).toStrictEqual(before.startDate);
    expect(after.endDate).toStrictEqual(before.endDate);
  });

  it('422 NO_CONSENT senza consenso attivo', async () => {
    const sub = await seedConfirmedSubscription();
    await expect(service.releaseAbsence(sub.id, { date: midSeasonDate(sub) })).rejects.toThrow(UnprocessableEntityException);
  });

  it('422 PAST_DATE per una data passata', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    await expect(service.releaseAbsence(sub.id, { date: yesterdayIso() })).rejects.toThrow(UnprocessableEntityException);
  });

  it('409 ALREADY_RELEASED sullo stesso giorno', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    const day = midSeasonDate(sub);
    await service.releaseAbsence(sub.id, { date: day });
    await expect(service.releaseAbsence(sub.id, { date: day })).rejects.toThrow(ConflictException);
  });
});
```
> `within(c, day)`, `midSeasonDate`, `rawCoverages`, `rawReleases`, `yesterdayIso`: se non esistono, definiscili localmente nel file spec in modo minimale (una data ISO interna allo span; `within` = `c.startDate <= D && D <= c.endDate`). Preferisci helper già presenti (grep `rawCoverages`/`midSeason`).

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t releaseAbsence`
Expected: FAIL — `service.releaseAbsence is not a function`.

- [ ] **Step 3: Implementare il carve giorno-singolo**

In `bookings.service.ts`, aggiungi `ReleaseAbsenceInput` all'import type. Aggiungi il metodo:
```ts
/**
 * Registra un'assenza comunicata per un giorno (D-035 S2). Scava un buco a GIORNO SINGOLO in
 * BookingCoverage (versione a giorno singolo del carve sospensione), gated dal consenso. NON tocca
 * cassa/span dell'abbonamento (ADR-0048). admin-only. La rivendita usa il flusso giornaliero.
 */
async releaseAbsence(id: string, input: ReleaseAbsenceInput): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const day = 24 * 60 * 60 * 1000;
  const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id }, include: { absenceReleases: true } });
    if (!existing) return { error: 'NOT_FOUND' as const };
    if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
    if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
    if (existing.terminatedAt) return { error: 'TERMINATED' as const };
    if (existing.absenceConsentAt === null) return { error: 'NO_CONSENT' as const };

    const today = toDbDate(todayInRome());
    const D = toDbDate(input.date);
    if (D < existing.startDate || D > existing.endDate) return { error: 'BAD_DATE' as const };
    if (D < today) return { error: 'PAST_DATE' as const };
    if (existing.absenceReleases.some((r) => r.canceledAt === null && +r.date === +D)) return { error: 'ALREADY_RELEASED' as const };

    const coverages = await tx.bookingCoverage.findMany({ where: { bookingId: id, status: 'confirmed' } });
    const C = coverages.find((c) => c.startDate <= D && D <= c.endDate);
    if (!C) return { error: 'NO_COVERAGE' as const };

    await tx.bookingCoverage.delete({ where: { id: C.id } });
    if (D > C.startDate) {
      await tx.bookingCoverage.create({
        data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
          startDate: C.startDate, endDate: new Date(D.getTime() - day), status: 'confirmed' },
      });
    }
    if (D < C.endDate) {
      await tx.bookingCoverage.create({
        data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
          startDate: new Date(D.getTime() + day), endDate: C.endDate, status: 'confirmed' },
      });
    }
    await tx.absenceRelease.create({
      data: { bookingId: id, establishmentId: tenantId, date: D, source: 'operator', reason: input.reason ?? null },
    });
    return { row: existing };
  });

  if ('error' in outcome) {
    const e = outcome.error;
    if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
    if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno assenze comunicate');
    if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
    if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
    if (e === 'NO_CONSENT') throw new UnprocessableEntityException('Consenso assenze comunicate non attivo');
    if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data fuori dallo span dell’abbonamento');
    if (e === 'PAST_DATE') throw new UnprocessableEntityException('Non si può segnalare un’assenza nel passato');
    if (e === 'ALREADY_RELEASED') throw new ConflictException('Assenza già registrata per quel giorno');
    throw new UnprocessableEntityException('Giorno già libero (non coperto)'); // NO_COVERAGE
  }
  return toBookingDTO(outcome.row);
}
```

- [ ] **Step 4: DTO + endpoint**

Crea `apps/api/src/bookings/dto/release-absence.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReleaseAbsenceInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione registrazione assenza (D-035). Gli invarianti di dominio (consenso, span, ≥ oggi,
 *  copertura, no-doppione) sono nel service: qui solo shape/bound sintattici. */
export class ReleaseAbsenceDto implements ReleaseAbsenceInput {
  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```
In `bookings.controller.ts`, importa `ReleaseAbsenceDto` e aggiungi:
```ts
@Post(':id/absence-releases')
@HttpCode(200)
@Roles(Role.Admin)
releaseAbsence(@Param('id') id: string, @Body() body: ReleaseAbsenceDto): Promise<BookingDTO> {
  return this.bookings.releaseAbsence(id, body);
}
```

- [ ] **Step 5: Unit verde + e2e (happy → buco disponibile per rivendita; guardie)**

Nel file e2e, aggiungi (mirror del blocco `suspend` che verifica la disponibilità nel buco via mappa/disponibilità):
```ts
describe('POST /bookings/:id/absence-releases', () => {
  it('release apre la disponibilità del giorno per la rivendita', async () => {
    const sub = await createConfirmedSubscription(adminToken);
    await request(app.getHttpServer()).patch(`/bookings/${sub.id}/absence-consent`)
      .set('Authorization', `Bearer ${adminToken}`).send({ consent: true });
    const day = midSeasonDateOf(sub);
    const res = await request(app.getHttpServer()).post(`/bookings/${sub.id}/absence-releases`)
      .set('Authorization', `Bearer ${adminToken}`).send({ date: day });
    expect(res.status).toBe(200);
    // rivendita: una giornaliera sullo stesso ombrellone+fascia in `day` ora passa (era 409 prima)
    const resale = await createDailyBooking(adminToken, { umbrellaId: sub.umbrellaId, timeSlotId: sub.timeSlotId, date: day });
    expect(resale.status).toBe(201);
  });

  it('senza consenso → 422', async () => {
    const sub = await createConfirmedSubscription(adminToken);
    const res = await request(app.getHttpServer()).post(`/bookings/${sub.id}/absence-releases`)
      .set('Authorization', `Bearer ${adminToken}`).send({ date: midSeasonDateOf(sub) });
    expect(res.status).toBe(422);
  });

  it('staff → 403', async () => {
    const sub = await createConfirmedSubscription(adminToken);
    const res = await request(app.getHttpServer()).post(`/bookings/${sub.id}/absence-releases`)
      .set('Authorization', `Bearer ${staffToken}`).send({ date: midSeasonDateOf(sub) });
    expect(res.status).toBe(403);
  });
});
```
> `createDailyBooking`/`midSeasonDateOf`: usa gli helper e2e esistenti per creare una giornaliera e derivare una data interna (grep il file e2e per il pattern di creazione booking; il codice di stato della create è quello già usato negli altri test create — allinealo).

Run:
```bash
corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t releaseAbsence
corepack pnpm --filter @coralyn/api run test:e2e -- -t "absence-releases"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings
git commit -m "feat(D-035): POST absence-releases — carve giorno-singolo, consenso-gated"
```

---

### Task 4: `cancelAbsenceRelease` — re-cover se non rivenduto + endpoint + e2e

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (metodo `cancelAbsenceRelease`)
- Modify: `apps/api/src/bookings/bookings.controller.ts` (endpoint `POST :id/absence-releases/:rid/cancel`)
- Test: `bookings.service.spec.ts` · `bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: `dateRangesOverlap`, `slotsOverlap`, `isBookingOverlapExclusion`, `toBookingDTO`.
- Produces: `BookingsService.cancelAbsenceRelease(id: string, releaseId: string): Promise<BookingDTO>`; endpoint `POST /bookings/:id/absence-releases/:rid/cancel`.

- [ ] **Step 1: Unit test (falla) — re-cover + gate RESOLD**

```ts
describe('cancelAbsenceRelease', () => {
  it('ricopre il giorno e marca canceledAt se non rivenduto', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    const day = midSeasonDate(sub);
    await service.releaseAbsence(sub.id, { date: day });
    const rel = (await rawReleases(sub.id))[0];

    await service.cancelAbsenceRelease(sub.id, rel.id);

    const covs = await rawCoverages(sub.id);
    expect(covs.some((c) => within(c, day))).toBe(true);   // il giorno è di nuovo coperto
    expect((await rawReleases(sub.id))[0].canceledAt).not.toBeNull();
  });

  it('409 RESOLD se il giorno è già stato rivenduto', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    const day = midSeasonDate(sub);
    await service.releaseAbsence(sub.id, { date: day });
    const rel = (await rawReleases(sub.id))[0];
    await seedDailyBookingOn(sub.umbrellaId, sub.timeSlotId, day); // occupa il buco (rivendita)
    await expect(service.cancelAbsenceRelease(sub.id, rel.id)).rejects.toThrow(ConflictException);
  });

  it('409 ALREADY_CANCELED se già annullata', async () => {
    const sub = await seedConfirmedSubscription();
    await service.setAbsenceConsent(sub.id, { consent: true });
    await service.releaseAbsence(sub.id, { date: midSeasonDate(sub) });
    const rel = (await rawReleases(sub.id))[0];
    await service.cancelAbsenceRelease(sub.id, rel.id);
    await expect(service.cancelAbsenceRelease(sub.id, rel.id)).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t cancelAbsenceRelease`
Expected: FAIL — `service.cancelAbsenceRelease is not a function`.

- [ ] **Step 3: Implementare (mirror del re-cover di reactivate)**

```ts
/**
 * Annulla un'assenza comunicata non ancora rivenduta (D-035 S2): ricopre il giorno [date,date] e marca
 * canceledAt. Se il buco è già occupato da un'altra prenotazione (rivendita) → 409 (vincolante). admin-only.
 */
async cancelAbsenceRelease(id: string, releaseId: string): Promise<BookingDTO> {
  const tenantId = this.tenant.require();
  const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id }, include: { timeSlot: true } });
    if (!booking) return { error: 'NOT_FOUND' as const };
    const release = await tx.absenceRelease.findFirst({ where: { id: releaseId, bookingId: id } });
    if (!release) return { error: 'RELEASE_NOT_FOUND' as const };
    if (release.canceledAt !== null) return { error: 'ALREADY_CANCELED' as const };

    // rivenduto? coverage confirmed di ALTRA booking su stesso ombrellone+fascia, con la data dentro l'intervallo.
    const others = await tx.bookingCoverage.findMany({
      where: { umbrellaId: booking.umbrellaId, status: 'confirmed', bookingId: { not: id } },
      include: { booking: { include: { timeSlot: true } } },
    });
    const resold = others.some(
      (c) => dateRangesOverlap(c.startDate, c.endDate, release.date, release.date) && slotsOverlap(c.booking.timeSlot, booking.timeSlot),
    );
    if (resold) return { error: 'RESOLD' as const };

    // Ricopre [date, date]. Il constraint coverage_no_overlap resta backstop di sola race.
    try {
      await tx.bookingCoverage.create({
        data: { bookingId: id, establishmentId: tenantId, umbrellaId: booking.umbrellaId,
          startDate: release.date, endDate: release.date, status: 'confirmed' },
      });
    } catch (e) {
      if (isBookingOverlapExclusion(e)) throw new ConflictException('Il giorno è stato rivenduto');
      throw e;
    }
    await tx.absenceRelease.update({ where: { id: releaseId }, data: { canceledAt: new Date() } });
    return { row: booking };
  });

  if ('error' in outcome) {
    const e = outcome.error;
    if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
    if (e === 'RELEASE_NOT_FOUND') throw new NotFoundException('Assenza non trovata');
    if (e === 'ALREADY_CANCELED') throw new ConflictException('Assenza già annullata');
    throw new ConflictException('Il giorno è stato rivenduto: annullo non consentito'); // RESOLD
  }
  return toBookingDTO(outcome.row);
}
```

- [ ] **Step 4: Endpoint**

In `bookings.controller.ts`:
```ts
@Post(':id/absence-releases/:rid/cancel')
@HttpCode(200)
@Roles(Role.Admin)
cancelAbsenceRelease(@Param('id') id: string, @Param('rid') rid: string): Promise<BookingDTO> {
  return this.bookings.cancelAbsenceRelease(id, rid);
}
```

- [ ] **Step 5: Unit verde + e2e (annullo happy + RESOLD 409 + 403 staff)**

Nel file e2e aggiungi un blocco `describe('POST /bookings/:id/absence-releases/:rid/cancel')` con: annullo di una release non rivenduta → 200; dopo aver creato una giornaliera nel buco → cancel → 409; staff → 403. (Riusa i pattern di Task 3; per ottenere il `releaseId` leggi la Scheda `GET /customers/:id/bookings` — disponibile dopo Task 5 — oppure, se Task 5 non ancora fatto, esegui questo e2e dopo Task 5. Ordine consigliato: implementa Task 5 e poi l'e2e di cancel che usa il DTO.)
Run:
```bash
corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t cancelAbsenceRelease
corepack pnpm --filter @coralyn/api run test:e2e -- -t "cancel"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings
git commit -m "feat(D-035): POST absence-releases/:rid/cancel — re-cover se non rivenduto"
```

---

### Task 5: Projection — `absenceReleases[]` + `absenceConsentAt` + `resold` su CustomerBookingDTO

**Files:**
- Create: `apps/api/src/bookings/absence-release.projection.ts`
- Modify: `apps/api/src/bookings/customer-booking.projection.ts` (enrichment + mapping)
- Modify: `apps/api/src/bookings/bookings.service.ts` (`listByCustomer`: include + resold + mapping)
- Test: `bookings.service.spec.ts` (o `customer-booking.projection.spec.ts` se esiste) · `bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: `AbsenceReleaseDTO` (Task 1), `slotsOverlap` (già importato in service).
- Produces: `toAbsenceReleaseDTO(r, resold): AbsenceReleaseDTO`; `CustomerBookingEnrichment.absenceConsentAt?: string | null`; `CustomerBookingEnrichment.absenceReleases?: AbsenceReleaseDTO[]`.

- [ ] **Step 1: Test (falla) — la Scheda espone consenso + release con `resold`**

Nel file spec del dominio (unit o e2e — mirror del test che verifica `suspensions[]` nella Scheda):
```ts
it('la Scheda cliente espone absenceConsentAt e absenceReleases con resold', async () => {
  const sub = await seedConfirmedSubscription();
  await service.setAbsenceConsent(sub.id, { consent: true });
  const day = midSeasonDate(sub);
  await service.releaseAbsence(sub.id, { date: day });

  const [dto] = (await service.listByCustomer(sub.customerId)).filter((b) => b.id === sub.id);
  expect(dto.absenceConsentAt).not.toBeNull();
  expect(dto.absenceReleases).toHaveLength(1);
  expect(dto.absenceReleases![0].date).toBe(day);
  expect(dto.absenceReleases![0].resold).toBe(false);

  await seedDailyBookingOn(sub.umbrellaId, sub.timeSlotId, day); // rivendita
  const [dto2] = (await service.listByCustomer(sub.customerId)).filter((b) => b.id === sub.id);
  expect(dto2.absenceReleases![0].resold).toBe(true);
});
```

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/api run test -- bookings.service.spec -t "absenceReleases con resold"`
Expected: FAIL — `dto.absenceReleases` undefined.

- [ ] **Step 3: Projection helper**

Crea `apps/api/src/bookings/absence-release.projection.ts`:
```ts
import type { AbsenceRelease } from '@prisma/client';
import type { AbsenceReleaseDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta un'assenza comunicata nel DTO della Scheda. `resold` = il giorno è occupato da altra booking. */
export function toAbsenceReleaseDTO(r: AbsenceRelease, resold: boolean): AbsenceReleaseDTO {
  return {
    id: r.id,
    date: formatDbDate(r.date),
    source: r.source,
    canceledAt: r.canceledAt ? r.canceledAt.toISOString() : null,
    resold,
    reason: r.reason ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Enrichment + mapping in customer-booking.projection.ts**

In `customer-booking.projection.ts`, aggiungi a `import type { … } from '@coralyn/contracts'` il tipo `AbsenceReleaseDTO`. In `CustomerBookingEnrichment` aggiungi:
```ts
  absenceConsentAt?: string | null;
  absenceReleases?: AbsenceReleaseDTO[];
```
In `toCustomerBookingDTO`, nel return, accanto a `transfers: e.transfers ?? [],`, aggiungi:
```ts
    absenceConsentAt: e.absenceConsentAt ?? null,
    absenceReleases: e.absenceReleases ?? [],
```

- [ ] **Step 5: `listByCustomer` — include + resold + mapping**

In `bookings.service.ts`, importa `toAbsenceReleaseDTO` da `./absence-release.projection`. Nel `tx.booking.findMany` di `listByCustomer`, estendi l'`include`:
```ts
          timeSlot: true,
          absenceReleases: { orderBy: { date: 'asc' } },
```
Dopo il calcolo di `seniorityById`/`campaigns` (prima del `return bookings.map(...)`), aggiungi il caricamento delle coperture altrui per il flag `resold`:
```ts
      const releaseUmbrellaIds = [
        ...new Set(bookings.filter((b) => b.absenceReleases.some((r) => r.canceledAt === null)).map((b) => b.umbrellaId)),
      ];
      const otherCoverages = releaseUmbrellaIds.length
        ? await tx.bookingCoverage.findMany({
            where: { umbrellaId: { in: releaseUmbrellaIds }, status: 'confirmed' },
            include: { booking: { include: { timeSlot: true } } },
          })
        : [];
      const isResold = (b: (typeof bookings)[number], r: (typeof b.absenceReleases)[number]): boolean =>
        r.canceledAt === null &&
        otherCoverages.some(
          (c) =>
            c.bookingId !== b.id &&
            c.umbrellaId === b.umbrellaId &&
            c.startDate <= r.date && r.date <= c.endDate &&
            slotsOverlap(c.booking.timeSlot, b.timeSlot),
        );
```
Nel `toCustomerBookingDTO(b, { … })`, aggiungi:
```ts
          absenceConsentAt: b.absenceConsentAt ? b.absenceConsentAt.toISOString() : null,
          absenceReleases: b.absenceReleases.map((r) => toAbsenceReleaseDTO(r, isResold(b, r))),
```

- [ ] **Step 6: Verde + e2e Scheda + commit**

Run:
```bash
corepack pnpm --filter @coralyn/api run test -- bookings.service.spec
corepack pnpm --filter @coralyn/api run typecheck
corepack pnpm --filter @coralyn/api run test:e2e -- -t "absence"
```
Expected: PASS (inclusi gli e2e di Task 4 che leggono il `releaseId` dalla Scheda).
```bash
git add apps/api/src/bookings
git commit -m "feat(D-035): projection absenceReleases[] + absenceConsentAt + resold su Scheda"
```

---

### Task 6: FE — hook mutations + queryKeys

**Files:**
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts` (3 hook)
- Test: `apps/web-staff/src/features/customers/useCustomers.spec.ts`

**Interfaces:**
- Consumes: `SetAbsenceConsentInput`, `ReleaseAbsenceInput`, `BookingDTO` (contracts); `queryKeys.customerBookings`.
- Produces: `useSetAbsenceConsent(customerId)`, `useReleaseAbsence(customerId)`, `useCancelAbsenceRelease(customerId)` — tutti invalidano `customerBookings`.

- [ ] **Step 1: Test (falla) — la mutation chiama l'endpoint e invalida**

In `useCustomers.spec.ts` (mirror del test di `useSuspendSubscription`; usa il `server.use(...)` MSW già in uso nel file):
```ts
import { describe, it, expect } from 'vitest';

it('useReleaseAbsence POSTa la release e invalida la Scheda', async () => {
  server.use(
    http.post('/api/bookings/:id/absence-releases', () => HttpResponse.json({ id: 'b1' })),
  );
  const { mutateAsync } = withSetup(() => useReleaseAbsence('c1')); // helper esistente nel file
  await mutateAsync({ id: 'b1', input: { date: '2026-07-20' } });
  // asserzione di invalidazione come negli altri test hook del file
});
```

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/web-staff run test -- useCustomers -t useReleaseAbsence`
Expected: FAIL — `useReleaseAbsence is not exported`.

- [ ] **Step 3: Implementare i 3 hook**

In `useCustomers.ts`, estendi l'import type con `SetAbsenceConsentInput, ReleaseAbsenceInput`. Aggiungi (mirror di `useSuspendSubscription`):
```ts
/** Grant/revoke consenso "assenze comunicate" (D-035, admin-only). Invalida la Scheda cliente. */
export function useSetAbsenceConsent(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SetAbsenceConsentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-consent`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Registra un'assenza comunicata (D-035, admin-only). Invalida la Scheda cliente. */
export function useReleaseAbsence(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: ReleaseAbsenceInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-releases`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Annulla un'assenza comunicata non rivenduta (D-035, admin-only). Invalida la Scheda cliente. */
export function useCancelAbsenceRelease(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, releaseId }: { id: string; releaseId: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-releases/${releaseId}/cancel`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}
```

- [ ] **Step 4: Verde + commit**

Run: `corepack pnpm --filter @coralyn/web-staff run test -- useCustomers`
Expected: PASS.
```bash
git add apps/web-staff/src/features/customers/useCustomers.ts apps/web-staff/src/features/customers/useCustomers.spec.ts
git commit -m "feat(D-035): FE hooks absence consent/release/cancel"
```

---

### Task 7: FE — `AbsenceReleaseModal`

**Files:**
- Create: `apps/web-staff/src/features/customers/AbsenceReleaseModal.vue`
- Test: `apps/web-staff/src/features/customers/AbsenceReleaseModal.spec.ts`

**Interfaces:**
- Consumes: `CustomerBookingDTO`, `useReleaseAbsence`, `addDays`/`todayIso` (`@/lib/dates`), `Modal`/`Field`/`Button` (ui-kit).
- Produces: componente con `v-model:open`, props `{ booking: CustomerBookingDTO | null; customerId: string }`; date-input `data-testid="absence-date"`, conferma `data-testid="absence-confirm"`.

- [ ] **Step 1: Test (falla) — bound data + submit del payload**

`AbsenceReleaseModal.spec.ts` (mirror di `SuspendSubscriptionModal.spec.ts`):
```ts
import { describe, it, expect, vi } from 'vitest';
// … monta il modale con un booking abbonamento, verifica:
//  - il date-input ha min = max(oggi, startDate) e max = endDate
//  - alla conferma chiama mutateAsync con { id, input: { date, reason? } }
//  - su 409 mostra il messaggio "Assenza già registrata per quel giorno"
```

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/web-staff run test -- AbsenceReleaseModal`
Expected: FAIL — file non esistente.

- [ ] **Step 3: Implementare il modale (mirror SuspendSubscriptionModal, senza rimborso)**

`AbsenceReleaseModal.vue`:
```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { todayIso } from '@/lib/dates';
import { useReleaseAbsence } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const release = useReleaseAbsence(props.customerId);

const date = ref('');
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => {
  const t = todayIso();
  const s = props.booking?.startDate ?? t;
  return s > t ? s : t; // max(oggi, inizio abbonamento)
});
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const releasedDates = computed(
  () => new Set((props.booking?.absenceReleases ?? []).filter((r) => !r.canceledAt).map((r) => r.date)),
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    date.value = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    reason.value = '';
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  if (releasedDates.value.has(date.value)) { error.value = 'Assenza già registrata per quel giorno.'; return; }
  error.value = '';
  submitting.value = true;
  try {
    await release.mutateAsync({ id: props.booking.id, input: { date: date.value, reason: reason.value || undefined } });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Assenza già registrata per quel giorno.'
      : status === 422 ? 'Dati non validi (consenso non attivo o data fuori periodo).'
      : 'Errore durante la registrazione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Segnala assenza" eyebrow="Assenze comunicate">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Giorno di assenza">
        <input v-model="date" data-testid="absence-date" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>
      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>
      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="absence-confirm" variant="primary" :disabled="submitting" @click="confirm">Segnala assenza</Button>
      </div>
    </div>
  </Modal>
</template>
```

- [ ] **Step 4: Verde + commit**

Run: `corepack pnpm --filter @coralyn/web-staff run test -- AbsenceReleaseModal`
Expected: PASS.
```bash
git add apps/web-staff/src/features/customers/AbsenceReleaseModal.vue apps/web-staff/src/features/customers/AbsenceReleaseModal.spec.ts
git commit -m "feat(D-035): FE AbsenceReleaseModal"
```

---

### Task 8: FE — Card (azione consenso + segnala assenza + sezione release) + wiring vista

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue` (stato modale + hook consenso/cancel + wiring)
- Test: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts` · `CustomerDetailView.spec.ts`

**Interfaces:**
- Consumes: `useSetAbsenceConsent`, `useCancelAbsenceRelease`, `AbsenceReleaseModal`, `CustomerBookingDTO.absenceConsentAt`/`.absenceReleases`.
- Produces: eventi/handler `emit('absence', b)` (apre il modale) + azioni consenso/annullo nella card.

- [ ] **Step 1: Test (falla) — la card mostra l'azione consenso e la sezione release**

In `CustomerSubscriptionsCard.spec.ts` (mirror dei test bottoni `suspend-`/`transfer-`):
```ts
it('mostra "Attiva assenze comunicate" per admin su abbonamento senza consenso', () => {
  const wrapper = mountCard({ bookings: [subWithoutConsent], isAdmin: true });
  expect(wrapper.find(`[data-testid="absence-consent-${subWithoutConsent.id}"]`).exists()).toBe(true);
});

it('mostra "Segnala assenza" solo con consenso attivo', () => {
  const wrapper = mountCard({ bookings: [subWithConsent], isAdmin: true });
  expect(wrapper.find(`[data-testid="absence-${subWithConsent.id}"]`).exists()).toBe(true);
});

it('elenca le release con stato e l’azione annulla se non rivenduta', () => {
  const wrapper = mountCard({ bookings: [subWithActiveRelease], isAdmin: true });
  expect(wrapper.text()).toContain('Assente il');
  expect(wrapper.find(`[data-testid="absence-cancel-${activeReleaseId}"]`).exists()).toBe(true);
});
```
> `subWithConsent`/`subWithActiveRelease`: costruiscili come `CustomerBookingDTO` con `absenceConsentAt` valorizzato e `absenceReleases: [{ …, canceledAt: null, resold: false }]`. Usa il factory di booking già presente nel file spec.

- [ ] **Step 2: Eseguire → falla**

Run: `corepack pnpm --filter @coralyn/web-staff run test -- CustomerSubscriptionsCard`
Expected: FAIL — testids assenti.

- [ ] **Step 3: Card — azione consenso + segnala assenza + sezione release**

In `CustomerSubscriptionsCard.vue`:
1. Estendi gli `emit` con `'absence'` e `'consent'` e `'cancelAbsence'` (mirror `emit('suspend', b)`), es. `const emit = defineEmits<{ …; absence: [CustomerBookingDTO]; consent: [CustomerBookingDTO]; cancelAbsence: [{ booking: CustomerBookingDTO; releaseId: string }] }>();` (allinea alla sintassi `defineEmits` già usata nel file).
2. Aggiungi un helper `canSuspend`-simile per l'azione consenso/assenza (abbonamento confermato, non disdetto):
```ts
const consentActive = (b: CustomerBookingDTO) => !!b.absenceConsentAt;
const activeReleases = (b: CustomerBookingDTO) => (b.absenceReleases ?? []).filter((r) => !r.canceledAt);
```
3. Nella riga delle azioni (accanto ai bottoni `Disdici`/`Sospendi`/`Cedi`), aggiungi:
```vue
<Button v-if="isAdmin && canSuspend(b)" variant="secondary" :data-testid="`absence-consent-${b.id}`" @click="emit('consent', b)">
  <Icon name="check" :size="15" />{{ consentActive(b) ? 'Revoca assenze' : 'Attiva assenze' }}
</Button>
<Button v-if="isAdmin && canSuspend(b) && consentActive(b)" variant="secondary" :data-testid="`absence-${b.id}`" @click="emit('absence', b)">
  <Icon name="calendar" :size="15" />Segnala assenza
</Button>
```
4. Sotto le sezioni sospensioni/cessioni, aggiungi la sezione release (mirror del `v-for` sospensioni passate):
```vue
<div v-for="r in (b.absenceReleases ?? [])" :key="r.id" class="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)] flex items-center justify-between">
  <span>Assente il {{ r.date }}<template v-if="r.canceledAt"> · annullata</template><template v-else-if="r.resold"> · rivenduta</template></span>
  <Button v-if="isAdmin && !r.canceledAt && !r.resold" variant="ghost" :data-testid="`absence-cancel-${r.id}`" @click="emit('cancelAbsence', { booking: b, releaseId: r.id })">Annulla</Button>
</div>
```
> Usa nomi icona presenti nel registro ui-kit (grep `name="` nel file card per quelli già usati; se `check`/`calendar` non esistono, scegli icone esistenti come `clock`/`renew`).

- [ ] **Step 4: Wiring in CustomerDetailView.vue**

In `CustomerDetailView.vue` (mirror del wiring di `SuspendSubscriptionModal`/`TransferSubscriptionModal`):
1. importa `AbsenceReleaseModal`, `useSetAbsenceConsent`, `useCancelAbsenceRelease`.
2. stato: `const absenceOpen = ref(false); const absenceBooking = ref<CustomerBookingDTO | null>(null);` + istanze hook `const setConsent = useSetAbsenceConsent(id); const cancelAbsence = useCancelAbsenceRelease(id);`
3. handler:
```ts
function onConsent(b: CustomerBookingDTO) { setConsent.mutateAsync({ id: b.id, input: { consent: !b.absenceConsentAt } }); }
function onAbsence(b: CustomerBookingDTO) { absenceBooking.value = b; absenceOpen.value = true; }
function onCancelAbsence(p: { booking: CustomerBookingDTO; releaseId: string }) { cancelAbsence.mutateAsync({ id: p.booking.id, releaseId: p.releaseId }); }
```
4. nel template, aggancia gli eventi alla card (`@consent="onConsent" @absence="onAbsence" @cancelAbsence="onCancelAbsence"`) e monta `<AbsenceReleaseModal v-model:open="absenceOpen" :booking="absenceBooking" :customer-id="id" />` accanto agli altri modali.

- [ ] **Step 5: Verde + typecheck (gate reale) + commit**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff run test -- CustomerSubscriptionsCard CustomerDetailView
corepack pnpm --filter @coralyn/web-staff run typecheck   # vue-tsc -b — gate reale
```
Expected: PASS (typecheck pulito).
```bash
git add apps/web-staff/src/features/customers
git commit -m "feat(D-035): FE card consenso + segnala assenza + sezione release"
```

---

### Task 9: ADR-0048 + design docs + deferred.md

**Files:**
- Create: `docs/architecture/decisions/0048-assenze-comunicate-release-occupazione.md`
- Modify: `docs/design/data-model.md` (ER += `AbsenceRelease`, nota `Booking.absenceConsentAt`)
- Modify: `docs/design/flows.md` (§ nuovo: consenso→release→carve→rivendita + guardie)
- Create: `docs/design/mockups/absence-release-modal.html`
- Modify: `docs/architecture/deferred.md` (voce D-035: S1+S2 fatte; S3/S4 con la decomposizione concordata)

**Interfaces:** nessuna (documentazione — Definition of Done ADR-0009).

- [ ] **Step 1: ADR-0048**

Scrivi l'ADR seguendo il template degli ADR esistenti (Status/Data/ADR correlati/Context/Decision/Consequences/Alternatives/Rubric check). Decisione: (a) release = carve giorno-singolo su `BookingCoverage` (mirror sospensione) che **non tocca span né cassa**; (b) principio *compensazione = rinuncia al diritto, non mancato uso* (distingue release da sospensione/cessione); (c) release **consenso-gated** e **vincolante** (nessuna presunzione d'assenza), `AbsenceRelease` storia RLS-FORCE con `source` predisposto per S4. Additivo su [ADR-0046]/[ADR-0011]; non tocca [ADR-0047]. (Contenuto già sintetizzato nella spec §5/§15 — riportalo.)

- [ ] **Step 2: data-model.md + flows.md + mockup**

- `data-model.md`: aggiungi `AbsenceRelease` all'ER Mermaid (FK Booking CASCADE, FK Establishment RESTRICT) + nota che `Booking.absenceConsentAt` è lo stato consenso. Marca "assenze comunicate" come *implementata* (non "in design").
- `flows.md`: nuovo § con il flusso consenso→release→carve giorno-singolo→rivendita, e l'elenco guardie (§6 della spec). Se sospensione/cessione sono ancora marcate "in design" in questi file (debito noto dall'handoff), NON allargare lo scope qui oltre l'aggiunta di questa slice.
- `absence-release-modal.html`: snapshot HTML self-contained del modale (mirror di `subscription-transfer-modal.html`).

- [ ] **Step 3: deferred.md — aggiornare la voce D-035**

Aggiorna la riga D-035 in `deferred.md`: S1 (consenso) + S2 (release operatore + rivendita) **IMPLEMENTATE e MERGIATE** (riferisci spec+piano di oggi, ADR-0048, tabella `AbsenceRelease`, `Booking.absenceConsentAt`); **restano** S3 (auth cliente: D-026/027/028/029) e S4 (PWA/QR + D-037) con la decomposizione concordata; prossimo D libero **D-049**, prossimo ADR libero **0049**.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/decisions/0048-assenze-comunicate-release-occupazione.md docs/design docs/architecture/deferred.md
git commit -m "docs(D-035): ADR-0048 + design docs + deferred (S1+S2 fatte)"
```

---

### Task 10: Verifica di regressione completa (baseline)

**Files:** nessuno (solo esecuzione).

- [ ] **Step 1: Suite intere + typecheck**

Run (dalla radice):
```bash
corepack pnpm --filter @coralyn/contracts run build
corepack pnpm --filter @coralyn/api run test
corepack pnpm --filter @coralyn/api run test:e2e
corepack pnpm --filter @coralyn/api run typecheck
corepack pnpm --filter @coralyn/web-staff run test
corepack pnpm --filter @coralyn/web-staff run typecheck
```
Expected: api unit **≥ 223 + nuovi**, e2e **≥ 273 + nuovi**, web-staff **≥ 348 + nuovi**, typecheck pulito. Nessuna regressione sui conteggi baseline.

- [ ] **Step 2: Verifica LIVE su Docker (`--profile full`)**

```bash
docker compose --profile full up -d --build
```
Con Postgres+auth reali, via UI/`curl` autenticato: attiva consenso su un abbonamento → registra una release (verifica: buco disponibile in mappa quel giorno; `amountCollected`/`refundedAmount` invariati sull'abbonamento) → prenota una giornaliera nel buco (rivendita, incasso a sé) → annulla una release non rivenduta (giorno torna occupato) → prova le guardie (no-consenso 422, data passata 422, fuori-span 422, doppia-release 409, cancel-dopo-rivendita 409, staff 403). Documenta l'esito.

- [ ] **Step 3: Nessun commit** (verifica). Se emergono difetti, correggili nel task pertinente e ripeti.

---

## Note di esecuzione (per il worker)

- **Ordine dei task:** 1→10 in sequenza. Gli e2e di Task 4 (cancel) dipendono dalla projection di Task 5 per leggere il `releaseId` dalla Scheda: se implementi 4 prima di 5, sposta l'e2e di cancel a valle di 5 (l'unit di Task 4 non dipende da 5).
- **Modello per task (suggerito):** Task 1–5 (API/dominio, rischio medio) e Task 9–10 su modello capace; Task 6–8 (FE, pattern-mirror) su modello economico. Da concordare con l'utente al momento del subagent-driven.
- **Gotcha ricorrenti:** rebuild contracts prima di ogni typecheck/e2e; `vue-tsc -b` come gate FE; ogni `.spec.ts` importa da `vitest`; e2e `--runInBand`; migrate deploy a dev **e** test.
- **Helper spec:** dove il piano cita helper (`seedConfirmedSubscription`, `rawBooking`, `createConfirmedSubscription`, `midSeasonDate`, `withSetup`, `mountCard`, …) usa quelli **già presenti** nei file spec del dominio (grep prima di crearne di nuovi). Sono i medesimi pattern usati dai test `suspend`/`transfer`.

[ADR-0011]: ../../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0046]: ../../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0047]: ../../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md
