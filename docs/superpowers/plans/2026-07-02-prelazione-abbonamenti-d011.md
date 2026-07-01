# Prelazione abbonamenti (D-011) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere la prelazione abbonamenti — finestre di rinnovo con scadenza, rilascio automatico (lazy) del posto, priorità per anzianità — realizzando la voce rimandata [D-011](../../architecture/deferred.md).

**Architecture:** Una nuova entità `RenewalCampaign` (una per stagione di destinazione) persiste **solo** la scadenza + le due stagioni; lo stato per-abbonato (`open|exercised|expired`) è **derivato** a valutazione lazy contro `todayInRome()`. Un **hold di disponibilità applicativo** dentro `BookingsService.priceAndWrite` riserva l'ombrellone dell'avente-diritto finché la finestra è aperta; alla scadenza (o alla chiusura campagna) il blocco cade da solo (nessun job/cron). La priorità è l'ordinamento per `seniority` (riuso di `computeSeniority`, estratto in un modulo condiviso). Spec: [2026-07-01-prelazione-abbonamenti-d011-design.md](../../specs/2026-07-01-prelazione-abbonamenti-d011-design.md). Decisione: [ADR-0034](../../architecture/decisions/0034-prelazione-finestre-lazy.md) (creato nel Task 7).

**Tech Stack:** NestJS + Prisma + PostgreSQL (RLS FORCE), `@coralyn/contracts` (tipi TS condivisi), Vue 3 + TanStack Query + `@coralyn/ui-kit` (FE), Jest (api unit + e2e supertest), Vitest + MSW (web-staff).

## Global Constraints

- **Lingua:** codice e DB in **inglese** (no `@@map`); UI e doc in **italiano** ([ADR-0030](../../architecture/decisions/0030-codice-e-db-in-inglese.md)).
- **Date operative:** date di calendario in **Europe/Rome**; round-trip **UTC** per `@db.Date` (`toDbDate`/`formatDbDate`); **vietati** i metodi locali (`getDate()`, `getHours()`) ([ADR-0031](../../architecture/decisions/0031-fuso-orario-e-date-operative.md)).
- **Tenant/RLS:** ogni query dentro `this.prisma.forTenant(tenantId, (tx) => …)`; `RenewalCampaign` ha RLS FORCE + policy `tenant_isolation` (SQL raw appeso alla migrazione — Prisma non la genera).
- **Server-autoritativo:** il client non invia mai prezzi/FK di dominio; l'apertura campagna riceve solo tre date; la scadenza è l'unico dato libero.
- **`ValidationPipe({ whitelist, transform })`** globale: ogni campo accettato **deve** essere dichiarato nel DTO (i campi non dichiarati sono scartati) — gotcha ricorrente.
- **Nessun nuovo `BookingStatus`**: l'enum `confirmed|cancelled` resta intatto.
- **Baseline test da NON regredire** (riverificare dal vivo nel Pre-flight): **ui-kit 41 · web-staff 93 · api unit 77 · api e2e 90.**
- **Commit-per-layer**, test-first (TDD). Branch: `feat/d011-prelazione` (già creato da `main`).

---

## Pre-flight (obbligatorio, prima del Task 1)

- [ ] **Sync + branch**: `git fetch --all --prune`; sei già su `feat/d011-prelazione` (partito da `main`, HEAD spec `d605539`). Verifica: `git log --oneline -1`.
- [ ] **Rebuild container API** (potrebbe non avere l'ultimo codice): `docker compose --profile full up -d --build api`. Verifica data: `docker inspect coralyn-api --format '{{.Created}}'`.
- [ ] **Riverifica baseline dal vivo** e annota i numeri (devono coincidere):
  - `corepack pnpm --filter @coralyn/ui-kit test` → **41**
  - `corepack pnpm --filter @coralyn/web-staff test` → **93**
  - `corepack pnpm --filter @coralyn/api test` → **unit 77**
  - `corepack pnpm --filter @coralyn/api test:e2e` → **e2e 90**
- [ ] Se un conteggio diverge dalla baseline, **fermati** e riconcilia prima di procedere (non costruire su una baseline ignota).

---

## File Structure

**Contracts**
- Modify `packages/contracts/src/index.ts` — aggiunge `OpenRenewalCampaignInput`, `RenewalCampaignDTO`, `RenewalWindowState`, `RenewalWindowItemDTO`, `RenewalCampaignDetailDTO`.

**Prisma**
- Modify `apps/api/prisma/schema.prisma` — modello `RenewalCampaign` + relazioni inverse su `Establishment`/`Season`.
- Create `apps/api/prisma/migrations/<ts>_renewal_campaign/migration.sql` — CREATE TABLE (Prisma) + blocco RLS raw appeso.

**Backend (`apps/api/src`)**
- Create `bookings/seniority.ts` — funzione condivisa `computeSeniority(tx, ids)` (estratta da `bookings.service.ts`).
- Modify `bookings/bookings.service.ts` — usa `computeSeniority` da `seniority.ts`; aggiunge l'hold in `priceAndWrite`.
- Modify `catalog/catalog.service.ts` — `SeasonRange` ramo `ok:true` += `id: string`.
- Create `bookings/renewal-campaigns.service.ts` — `open` / `getByDestinationDate` / `close`.
- Create `bookings/renewal-campaigns.controller.ts` — `POST` / `GET` / `DELETE /renewal-campaigns`.
- Create `bookings/renewal-window.projection.ts` — `toRenewalWindowItemDTO`.
- Create `bookings/dto/open-renewal-campaign.dto.ts`, `bookings/dto/renewal-campaign-query.dto.ts`.
- Modify `bookings/bookings.module.ts` — registra controller + service nuovi.

**Backend test (`apps/api/test`)**
- Create `apps/api/src/bookings/dto/open-renewal-campaign.dto.spec.ts`, `renewal-campaign-query.dto.spec.ts` (unit).
- Create `apps/api/test/renewal-campaigns.e2e-spec.ts` (e2e a 2 tenant).

**Frontend (`apps/web-staff/src`)**
- Modify `lib/queryKeys.ts` — `renewalCampaign(tenantId, destinationDate)`.
- Modify `features/renewals/useRenewals.ts` — `useRenewalCampaign` / `useOpenCampaign` / `useCloseCampaign`.
- Modify `features/renewals/RenewalsView.vue` — overlay campagna (apri/chiudi, badge stato, ordinamento).
- Modify `mocks/server.ts` — handler `GET/POST/DELETE /api/renewal-campaigns`.
- Modify `features/renewals/RenewalsView.spec.ts` — copertura estesa.

**Docs**
- Create `docs/architecture/decisions/0034-prelazione-finestre-lazy.md`.
- Modify `docs/architecture/deferred.md`, `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`.
- Create `docs/handoff/2026-07-02-d011-prelazione-handoff.md`.

---

## Task 1: Contratti (tipi condivisi)

**Files:**
- Modify: `packages/contracts/src/index.ts` (dopo il blocco A4.2 `SubscriptionListItemDTO`, righe ~170-182)

**Interfaces:**
- Produces: `OpenRenewalCampaignInput`, `RenewalCampaignDTO`, `RenewalWindowState`, `RenewalWindowItemDTO`, `RenewalCampaignDetailDTO` — consumati da BE (DTO/service/projection) e FE (composable/MSW).

- [ ] **Step 1: Aggiungere i tipi** in `packages/contracts/src/index.ts` (append in fondo o dopo `SubscriptionListItemDTO`):

```ts
// --- Prelazione abbonamenti (D-011) -----------------------------------------

/** Input per aprire una campagna di prelazione. Le stagioni sono identificate da una data al loro
 *  interno (coerente con RenewBookingInput/subscriptions). Server-autoritativo. */
export interface OpenRenewalCampaignInput {
  originDate: string;       // ISO yyyy-mm-dd: una data DENTRO la stagione di ORIGINE (aventi-diritto)
  destinationDate: string;  // ISO yyyy-mm-dd: una data DENTRO la stagione di DESTINAZIONE (da riservare)
  deadline: string;         // ISO yyyy-mm-dd: scadenza della finestra (uniforme per campagna)
}

/** Campagna di prelazione (una per stagione di destinazione). */
export interface RenewalCampaignDTO {
  id: string;
  originSeasonId: string;
  destinationSeasonId: string;
  deadline: string;         // ISO yyyy-mm-dd
}

/** Stato della finestra di un avente-diritto (derivato lazy). */
export type RenewalWindowState = 'open' | 'exercised' | 'expired';

/** Finestra di prelazione di un abbonato uscente, con priorità (anzianità) e stato derivato. */
export interface RenewalWindowItemDTO {
  sourceBookingId: string;  // l'abbonamento di ORIGINE (avente-diritto)
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  seniority: number;        // catena rinnovi (derivata, >= 1) — chiave d'ordinamento (priorità)
  state: RenewalWindowState;
}

/** Campagna + finestre (ordinate per anzianità decrescente). Ritorno di GET /renewal-campaigns. */
export interface RenewalCampaignDetailDTO extends RenewalCampaignDTO {
  windows: RenewalWindowItemDTO[];
}
```

- [ ] **Step 2: Buildare i contracts** (il BE/FE importano il dist):

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build ok, nessun errore TS.

- [ ] **Step 3: Type-check globale** (nessun consumatore rotto — sono solo aggiunte):

Run: `corepack pnpm -r build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): tipi prelazione abbonamenti (D-011)"
```

---

## Task 2: Schema Prisma + migrazione (nuova tabella + RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (modello `Booking` è a righe 153-184; `Establishment` 10-25; `Season` 203-213)
- Create: `apps/api/prisma/migrations/<ts>_renewal_campaign/migration.sql`

**Interfaces:**
- Produces: modello Prisma `RenewalCampaign { id, establishmentId, originSeasonId, destinationSeasonId, deadline, createdAt }` + relazioni; client Prisma con `tx.renewalCampaign`.

- [ ] **Step 1: Aggiungere il modello** in `schema.prisma` (dopo `Booking`, prima di `enum RateUnit`):

```prisma
model RenewalCampaign {
  id                  String        @id @default(uuid()) @db.Uuid
  establishmentId     String        @db.Uuid
  originSeasonId      String        @db.Uuid
  destinationSeasonId String        @db.Uuid
  deadline            DateTime      @db.Date
  createdAt           DateTime      @default(now())

  establishment       Establishment @relation(fields: [establishmentId], references: [id])
  originSeason        Season        @relation("CampaignOrigin", fields: [originSeasonId], references: [id])
  destinationSeason   Season        @relation("CampaignDestination", fields: [destinationSeasonId], references: [id])

  @@unique([establishmentId, destinationSeasonId])
  @@index([establishmentId])
}
```

- [ ] **Step 2: Aggiungere le relazioni inverse.** In `model Establishment` (dopo `rates Rate[]`):

```prisma
  renewalCampaigns RenewalCampaign[]
```

In `model Season` (dopo `pricings Pricing[]`):

```prisma
  campaignsAsOrigin      RenewalCampaign[] @relation("CampaignOrigin")
  campaignsAsDestination RenewalCampaign[] @relation("CampaignDestination")
```

- [ ] **Step 3: Generare la migrazione SENZA applicarla** (per poter appendere l'SQL RLS):

Run: `cd apps/api && corepack pnpm exec prisma migrate dev --create-only --name renewal_campaign`
Expected: crea `prisma/migrations/<ts>_renewal_campaign/migration.sql` con `CREATE TABLE "RenewalCampaign"` + FK + unique index. **Non** applica ancora.

- [ ] **Step 4: Appendere il blocco RLS** in fondo a quel `migration.sql` (stesso pattern di `20260630203447_pricing/migration.sql:107-129`):

```sql
-- RLS tenant_isolation (Prisma non la genera).
ALTER TABLE "RenewalCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RenewalCampaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RenewalCampaign"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 5: Applicare la migrazione + generare il client:**

Run: `corepack pnpm exec prisma migrate dev` (applica la migrazione pendente a `coralyn_dev`), poi `corepack pnpm exec prisma generate`.
Expected: migrazione applicata; client rigenerato con `renewalCampaign`.

- [ ] **Step 6: Applicare al DB di test** (gli e2e usano `coralyn_test`):

Run: `DATABASE_URL=<url coralyn_test> corepack pnpm exec prisma migrate deploy` (o il comando/script equivalente già usato dagli e2e; vedi `apps/api/test/helpers`). Se gli e2e ri-applicano le migrazioni da soli, questo step è implicito — verificarlo.
Expected: `RenewalCampaign` esiste in `coralyn_test`.

- [ ] **Step 7: Build (verifica che il client tipizzi la nuova tabella):**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): modello RenewalCampaign + migrazione con RLS (D-011)"
```

---

## Task 3: Refactor preparatorio — `computeSeniority` condiviso + `SeasonRange.id`

Refactor **senza cambio di comportamento**: gli e2e A4.2 restano verdi. Abilita il riuso nel Task 4.

**Files:**
- Create: `apps/api/src/bookings/seniority.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts` (rimuove il metodo privato `computeSeniority` :282-314, importa la funzione)
- Modify: `apps/api/src/catalog/catalog.service.ts` (`SeasonRange` :23-25 e il `return` :68)

**Interfaces:**
- Produces: `computeSeniority(tx: Prisma.TransactionClient, ids: string[]): Promise<Map<string, number>>`; `SeasonRange` ok-branch con `id: string`.
- Consumes: nessuno nuovo.

- [ ] **Step 1: Creare `seniority.ts`** con la funzione estratta (copia esatta della logica :282-314, ora standalone):

```ts
import type { Prisma } from '@prisma/client';

/**
 * Anzianità = lunghezza catena `previousBookingId`. Risalita iterativa per generazioni con la query API
 * Prisma (RLS via forTenant, niente SQL raw). Query bounded dalla profondità della catena (piccola: 1 per
 * stagione), non dal numero di abbonati.
 */
export async function computeSeniority(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const parentOf = new Map<string, string | null>();
  let toLoad = ids;
  while (toLoad.length > 0) {
    const gen = await tx.booking.findMany({
      where: { id: { in: toLoad } },
      select: { id: true, previousBookingId: true },
    });
    for (const r of gen) parentOf.set(r.id, r.previousBookingId);
    toLoad = gen
      .map((r) => r.previousBookingId)
      .filter((x): x is string => x !== null && !parentOf.has(x));
  }
  const seniority = new Map<string, number>();
  for (const id of ids) {
    let depth = 1;
    let cur = parentOf.get(id) ?? null;
    const seen = new Set<string>([id]);
    while (cur !== null && parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      depth += 1;
      cur = parentOf.get(cur) ?? null;
    }
    seniority.set(id, depth);
  }
  return seniority;
}
```

- [ ] **Step 2: In `bookings.service.ts`** rimuovere il metodo privato `computeSeniority` (:282-314) e importare la funzione:

```ts
import { computeSeniority } from './seniority';
```
E in `listSubscriptions` cambiare `this.computeSeniority(tx, ids)` → `computeSeniority(tx, ids)`.

- [ ] **Step 3: In `catalog.service.ts`** aggiungere `id` al ramo `ok:true` di `SeasonRange` e valorizzarlo:

```ts
export type SeasonRange =
  | { ok: true; id: string; startDate: string; endDate: string }
  | { ok: false; reason: 'NO_SEASON' };
```
E il `return` (:68):
```ts
return { ok: true, id: seasons[0].id, startDate: formatDbDate(seasons[0].startDate), endDate: formatDbDate(seasons[0].endDate) };
```

- [ ] **Step 4: Build + eslint:**

Run: `corepack pnpm --filter @coralyn/api build && corepack pnpm eslint apps/api/src/bookings/seniority.ts apps/api/src/bookings/bookings.service.ts apps/api/src/catalog/catalog.service.ts`
Expected: PASS (nessun `this.computeSeniority` residuo; nessun uso di `SeasonRange` rotto — `id` è additivo).

- [ ] **Step 5: Regressione A4.2 (comportamento invariato):**

Run: `corepack pnpm --filter @coralyn/api test:e2e -t "abbonati|rinnov|anzianità"` poi la suite unit completa `corepack pnpm --filter @coralyn/api test`.
Expected: verde, conteggi invariati (unit 77).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/seniority.ts apps/api/src/bookings/bookings.service.ts apps/api/src/catalog/catalog.service.ts
git commit -m "refactor(api): estrai computeSeniority + SeasonRange.id (prep D-011)"
```

---

## Task 4: Campagne — service + controller + DTO (open / get / close)

**Files:**
- Create: `apps/api/src/bookings/dto/open-renewal-campaign.dto.ts`, `apps/api/src/bookings/dto/renewal-campaign-query.dto.ts`
- Create: `apps/api/src/bookings/renewal-window.projection.ts`
- Create: `apps/api/src/bookings/renewal-campaigns.service.ts`
- Create: `apps/api/src/bookings/renewal-campaigns.controller.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`
- Test: `apps/api/src/bookings/dto/open-renewal-campaign.dto.spec.ts`, `renewal-campaign-query.dto.spec.ts` (unit); `apps/api/test/renewal-campaigns.e2e-spec.ts` (e2e)

**Interfaces:**
- Consumes: `computeSeniority` (Task 3), `CatalogService.resolveSeasonWithin` con `id` (Task 3), contracts (Task 1), `tx.renewalCampaign` (Task 2).
- Produces: `RenewalCampaignsService.open(input)`, `.getByDestinationDate(date)`, `.close(id)`; rotte `POST/GET/DELETE /api/renewal-campaigns`; `toRenewalWindowItemDTO(booking, seniority, state)`.

- [ ] **Step 1: DTO unit test (fallisce)** — `open-renewal-campaign.dto.spec.ts` (pattern dei DTO esistenti; validare i 3 campi calendariali obbligatori + whitelist). Esempio minimo:

```ts
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OpenRenewalCampaignDto } from './open-renewal-campaign.dto';

async function errs(obj: unknown) {
  return validate(plainToInstance(OpenRenewalCampaignDto, obj));
}

describe('OpenRenewalCampaignDto', () => {
  it('accetta 3 date calendariali', async () => {
    expect(await errs({ originDate: '2026-07-01', destinationDate: '2027-07-01', deadline: '2026-12-31' })).toHaveLength(0);
  });
  it('rifiuta data non calendariale', async () => {
    expect((await errs({ originDate: '2026-13-40', destinationDate: '2027-07-01', deadline: '2026-12-31' })).length).toBeGreaterThan(0);
  });
  it('rifiuta campo mancante', async () => {
    expect((await errs({ originDate: '2026-07-01', destinationDate: '2027-07-01' })).length).toBeGreaterThan(0);
  });
});
```
E `renewal-campaign-query.dto.spec.ts` analogo (`destinationDate` obbligatorio calendariale).

- [ ] **Step 2: Run → FAIL** (`Cannot find module './open-renewal-campaign.dto'`).

Run: `corepack pnpm --filter @coralyn/api test -t OpenRenewalCampaignDto`
Expected: FAIL.

- [ ] **Step 3: Creare i DTO:**

`open-renewal-campaign.dto.ts`:
```ts
import type { OpenRenewalCampaignInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

export class OpenRenewalCampaignDto implements OpenRenewalCampaignInput {
  @IsCalendarDate()
  originDate!: string;

  @IsCalendarDate()
  destinationDate!: string;

  @IsCalendarDate()
  deadline!: string;
}
```
`renewal-campaign-query.dto.ts`:
```ts
import { IsCalendarDate } from '../../common/is-calendar-date';

export class RenewalCampaignQueryDto {
  @IsCalendarDate()
  destinationDate!: string;
}
```

- [ ] **Step 4: Run → PASS** (DTO unit).

Run: `corepack pnpm --filter @coralyn/api test -t "OpenRenewalCampaignDto|RenewalCampaignQueryDto"`
Expected: PASS.

- [ ] **Step 5: Projection** — `renewal-window.projection.ts`:

```ts
import type { Booking } from '@prisma/client';
import type { RenewalWindowItemDTO, RenewalWindowState } from '@coralyn/contracts';

export function toRenewalWindowItemDTO(
  b: Booking,
  seniority: number,
  state: RenewalWindowState,
): RenewalWindowItemDTO {
  return {
    sourceBookingId: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    packageId: b.packageId ?? undefined,
    seniority,
    state,
  };
}
```

- [ ] **Step 6: Service** — `renewal-campaigns.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OpenRenewalCampaignInput, RenewalCampaignDTO, RenewalCampaignDetailDTO, RenewalWindowState } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { computeSeniority } from './seniority';
import { toRenewalWindowItemDTO } from './renewal-window.projection';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';

@Injectable()
export class RenewalCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  /** Apre una campagna di prelazione per la stagione di destinazione (server-autoritativo). */
  async open(input: OpenRenewalCampaignInput): Promise<RenewalCampaignDTO> {
    const tenantId = this.tenant.require();
    const row = await this.prisma.forTenant(tenantId, async (tx) => {
      const origin = await this.catalog.resolveSeasonWithin(tx, input.originDate);
      if (!origin.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      const dest = await this.catalog.resolveSeasonWithin(tx, input.destinationDate);
      if (!dest.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      if (origin.id === dest.id)
        throw new UnprocessableEntityException('Origine e destinazione devono differire');
      if (dest.startDate <= origin.startDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve seguire quella di origine');
      try {
        return await tx.renewalCampaign.create({
          data: {
            establishmentId: tenantId,
            originSeasonId: origin.id,
            destinationSeasonId: dest.id,
            deadline: toDbDate(input.deadline),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException('Campagna già aperta per questa stagione');
        throw e;
      }
    });
    return { id: row.id, originSeasonId: row.originSeasonId, destinationSeasonId: row.destinationSeasonId, deadline: formatDbDate(row.deadline) };
  }

  /** Campagna per la stagione che contiene `date` (o null), con le finestre ordinate per anzianità.
   *  Stub in questo step; corpo reale nello Step 7 (così il diff del calcolo finestre è isolato). */
  async getByDestinationDate(date: string): Promise<RenewalCampaignDetailDTO | null> {
    void date;
    return null;
  }

  /** Chiude/annulla una campagna: gli hold derivati cadono subito. */
  async close(id: string): Promise<void> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, (tx) => tx.renewalCampaign.deleteMany({ where: { id } }));
    if (removed.count === 0) throw new NotFoundException('Campagna non trovata');
  }
}
```

> **NB:** `getByDestinationDate` è uno **stub** in questo step (ritorna `null`) per isolare il diff. **Sostituisci l'intero corpo** nello Step 7 col codice reale prima di scrivere gli e2e delle finestre.

- [ ] **Step 7: Implementare `getByDestinationDate`** — sostituire **l'intero corpo dello stub** con:

```ts
  async getByDestinationDate(date: string): Promise<RenewalCampaignDetailDTO | null> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const dest = await this.catalog.resolveSeasonWithin(tx, date);
      if (!dest.ok) return null;
      const campaign = await tx.renewalCampaign.findFirst({ where: { destinationSeasonId: dest.id } });
      if (!campaign) return null;
      const origin = await tx.season.findFirst({ where: { id: campaign.originSeasonId } });
      if (!origin) return null;

      // Aventi-diritto: abbonati CONFERMATI della stagione di ORIGINE.
      const subs = await tx.booking.findMany({
        where: {
          type: 'subscription',
          status: 'confirmed',
          startDate: { lte: origin.endDate },
          endDate: { gte: origin.startDate },
        },
        include: { renewals: true },
      });
      const seniorityById = await computeSeniority(tx, subs.map((b) => b.id));

      const destStart = toDbDate(dest.startDate);
      const destEnd = toDbDate(dest.endDate);
      const deadlineIso = formatDbDate(campaign.deadline);
      const isExpired = todayInRome() > deadlineIso; // today > deadline → scaduta (giorno-scadenza incluso = aperta)

      const windows = subs
        .map((b) => {
          const exercised = b.renewals.some(
            (r) =>
              r.status === 'confirmed' &&
              r.startDate.getTime() <= destEnd.getTime() &&
              r.endDate.getTime() >= destStart.getTime(),
          );
          const state: RenewalWindowState = exercised ? 'exercised' : isExpired ? 'expired' : 'open';
          return toRenewalWindowItemDTO(b, seniorityById.get(b.id) ?? 1, state);
        })
        .sort((a, z) => z.seniority - a.seniority || (a.sourceBookingId < z.sourceBookingId ? -1 : 1));

      return {
        id: campaign.id,
        originSeasonId: campaign.originSeasonId,
        destinationSeasonId: campaign.destinationSeasonId,
        deadline: deadlineIso,
        windows,
      };
    });
  }
```

- [ ] **Step 8: Controller** — `renewal-campaigns.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { RenewalCampaignDTO, RenewalCampaignDetailDTO } from '@coralyn/contracts';
import { RenewalCampaignsService } from './renewal-campaigns.service';
import { OpenRenewalCampaignDto } from './dto/open-renewal-campaign.dto';
import { RenewalCampaignQueryDto } from './dto/renewal-campaign-query.dto';

@Controller('renewal-campaigns')
export class RenewalCampaignsController {
  constructor(private readonly campaigns: RenewalCampaignsService) {}

  @Post()
  open(@Body() body: OpenRenewalCampaignDto): Promise<RenewalCampaignDTO> {
    return this.campaigns.open(body);
  }

  @Get()
  get(@Query() query: RenewalCampaignQueryDto): Promise<RenewalCampaignDetailDTO | null> {
    return this.campaigns.getByDestinationDate(query.destinationDate);
  }

  @Delete(':id')
  async close(@Param('id') id: string): Promise<{ ok: true }> {
    await this.campaigns.close(id);
    return { ok: true };
  }
}
```

- [ ] **Step 9: Registrare in `bookings.module.ts`:**

```ts
import { RenewalCampaignsController } from './renewal-campaigns.controller';
import { RenewalCampaignsService } from './renewal-campaigns.service';

@Module({
  imports: [CatalogModule],
  controllers: [BookingsController, RenewalCampaignsController],
  providers: [BookingsService, RenewalCampaignsService],
})
export class BookingsModule {}
```

- [ ] **Step 10: e2e (fallisce prima di build)** — `apps/api/test/renewal-campaigns.e2e-spec.ts`. Riusa il bootstrap/seed dei bookings e2e (2 tenant, listino 2026+2027). Coprire:
  - **open felice**: `POST /api/renewal-campaigns { originDate:'2026-07-01', destinationDate:'2027-07-01', deadline:'2099-12-31' }` → 201; body con `originSeasonId`/`destinationSeasonId`/`deadline:'2099-12-31'`.
  - **validazioni → 422**: `originDate` in una stagione = destinazione; `destinationDate` che risolve a una stagione **precedente** all'origine (origine 2027, destinazione 2026); una data senza stagione (es. `'2030-01-10'`).
  - **duplicato → 409**: seconda open sulla stessa destinazione.
  - **get finestre**: creare un abbonamento 2026 (subscription) per un cliente; `GET /api/renewal-campaigns?destinationDate=2027-07-01` → `windows` non vuoto, `state:'open'` (deadline 2099), `seniority>=1`; ordinamento per anzianità desc con 2 abbonati di anzianità diversa.
  - **exercised**: dopo `POST /api/bookings/:id/renew` di quell'abbonato verso 2027 → la sua finestra `state:'exercised'`.
  - **expired**: campagna con `deadline:'2000-01-01'` (open con scadenza passata) → finestra non rinnovata `state:'expired'`.
  - **get null**: `destinationDate` senza campagna → `200` + `null`.
  - **close**: `DELETE /api/renewal-campaigns/:id` → 200 `{ok:true}`; poi `GET` → `null`. `DELETE` id inesistente → 404. `DELETE` cross-tenant (id del tenant A col token B) → 404.

  Usare i due token tenant già presenti negli e2e bookings (`token1`/`token2`). Deadline **fisse** `'2099-12-31'` (aperta) e `'2000-01-01'` (scaduta) — robuste rispetto alla data reale di esecuzione.

- [ ] **Step 11: Run e2e → FAIL/PASS ciclo**, poi build:

Run: `corepack pnpm --filter @coralyn/api build && corepack pnpm --filter @coralyn/api test:e2e -t "renewal-campaign|Campagna|prelazione"`
Expected: prima FAIL (rotte assenti), poi PASS dopo build. Nessuna regressione: `test:e2e` completo verde (90 + i nuovi).

- [ ] **Step 12: Lint + commit**

```bash
corepack pnpm eslint apps/api/src/bookings
git add apps/api/src/bookings apps/api/test/renewal-campaigns.e2e-spec.ts
git commit -m "feat(api): campagne di prelazione — open/get/close (D-011)"
```

---

## Task 5: Hold di disponibilità (nuova invariante in `priceAndWrite`)

Il cuore di D-011: mentre una finestra è aperta, l'ombrellone dell'avente-diritto non è prenotabile da altri; alla scadenza/chiusura il blocco cade (lazy).

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (`priceAndWrite` :108-169 — aggiunge il check dopo l'anti-overlap)
- Test: `apps/api/test/renewal-campaigns.e2e-spec.ts` (aggiunge i test di hold) **o** `apps/api/test/bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: `tx.renewalCampaign` (Task 2), `slotsOverlap`/`dateRangesOverlap` (già importati), `todayInRome`/`toDbDate` (già importati).
- Produces: comportamento 409 "Ombrellone riservato per prelazione" nel percorso di scrittura.

- [ ] **Step 1: e2e HOLD (fallisce)** — aggiungere in `renewal-campaigns.e2e-spec.ts`:
  - **hold attivo**: campagna 2026→2027 aperta (deadline `'2099-12-31'`), cliente A ha una subscription 2026 su ombrellone `uX`+fascia; cliente **B** prova a creare una subscription (o `daily`) 2027 su `uX`/stessa fascia → **409** "Ombrellone riservato per prelazione".
  - **il proprio rinnovo non è bloccato**: A rinnova la propria subscription su `uX` verso 2027 → **201**.
  - **rilascio lazy**: con campagna a deadline `'2000-01-01'` (scaduta), B crea la 2027 su `uX` → **201**.
  - **chiusura libera**: campagna aperta (`'2099-12-31'`) → `DELETE` → B crea la 2027 su `uX` → **201**.
  - **isolamento**: l'hold del tenant A non tocca il tenant B (ombrelloni/stagioni distinti) — B prenota liberamente.
  - **fascia diversa non è bloccata**: se A tiene la fascia Mattina, B prenota `uX` Pomeriggio (fascia non sovrapposta) → **201** (se il seed ha 2 fasce; altrimenti omettere e annotarlo).

- [ ] **Step 2: Run → FAIL** (nessun hold ancora).

Run: `corepack pnpm --filter @coralyn/api test:e2e -t "riservato|hold|prelazione"`
Expected: FAIL (B riesce a prenotare / A viene bloccato erroneamente).

- [ ] **Step 3: Implementare l'hold** in `priceAndWrite`, **dopo** il blocco anti-overlap esistente (`if (conflict) throw …`, riga ~140) e **prima** del calcolo prezzo:

```ts
    // Hold di prelazione (D-011, ADR-0034): mentre una finestra è APERTA, l'ombrellone+fascia
    // dell'avente-diritto è riservato a lui; un ALTRO cliente non può prenotarlo nella stagione di
    // destinazione. Valutazione lazy: alla scadenza (today > deadline) la campagna non è più "aperta"
    // e il blocco cade da solo (rilascio). Filtro in DB su scadenza + intersezione con la destinazione.
    const today = todayInRome();
    const openCampaigns = await tx.renewalCampaign.findMany({
      where: {
        deadline: { gte: toDbDate(today) },
        destinationSeason: { startDate: { lte: dbEnd }, endDate: { gte: dbStart } },
      },
      include: { originSeason: true, destinationSeason: true },
    });
    for (const c of openCampaigns) {
      const holders = await tx.booking.findMany({
        where: {
          type: 'subscription',
          status: 'confirmed',
          umbrellaId: p.umbrellaId,
          startDate: { lte: c.originSeason.endDate },
          endDate: { gte: c.originSeason.startDate },
          customerId: { not: p.customerId }, // il proprio rinnovo non confligge col proprio hold
        },
        include: { timeSlot: true, renewals: true },
      });
      const held = holders.some(
        (h) =>
          slotsOverlap(h.timeSlot, p.slot) &&
          !h.renewals.some(
            (r) =>
              r.status === 'confirmed' &&
              dateRangesOverlap(r.startDate, r.endDate, c.destinationSeason.startDate, c.destinationSeason.endDate),
          ),
      );
      if (held) throw new ConflictException('Ombrellone riservato per prelazione');
    }
```

> `dbStart`/`dbEnd` e `today` sono già calcolati in cima a `priceAndWrite`. `ConflictException`, `slotsOverlap`, `dateRangesOverlap`, `todayInRome`, `toDbDate` sono già importati.

- [ ] **Step 4: Run → PASS** (hold + rilascio + chiusura + isolamento).

Run: `corepack pnpm --filter @coralyn/api test:e2e`
Expected: PASS, nessuna regressione (i test anti-overlap/rinnovo A4.2 restano verdi: il rinnovo passa `customerId=source.customerId`, mai auto-bloccato).

- [ ] **Step 5: Lint + commit**

```bash
corepack pnpm eslint apps/api/src/bookings/bookings.service.ts
git add apps/api/src/bookings/bookings.service.ts apps/api/test/renewal-campaigns.e2e-spec.ts
git commit -m "feat(api): hold di prelazione nel percorso di scrittura (D-011)"
```

---

## Task 6: Frontend — vista Rinnovi estesa (campagna)

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/renewals/useRenewals.ts`
- Modify: `apps/web-staff/src/features/renewals/RenewalsView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts`
- Test: `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`

**Interfaces:**
- Consumes: contracts (Task 1); rotte `GET/POST/DELETE /api/renewal-campaigns` (Task 4).
- Produces: `useRenewalCampaign(destinationDate)`, `useOpenCampaign()`, `useCloseCampaign()`.

- [ ] **Step 1: queryKey** — in `queryKeys.ts` aggiungere:

```ts
  renewalCampaign: (tenantId: string, destinationDate: string) => ['renewalCampaign', tenantId, destinationDate] as const,
```

- [ ] **Step 2: MSW handlers** — in `mocks/server.ts` aggiungere uno stato campagna in-memory + handler (dopo i renew handler):

```ts
// --- Prelazione (D-011): stato campagna in-memory per i test ---
let campaign: RenewalCampaignDetailDTO | null = null;
export function resetCampaignSeed() { campaign = null; }
```
(importare `RenewalCampaignDetailDTO` dai contracts nel blocco import in alto), e nel `setupServer(...)`:
```ts
  http.get('/api/renewal-campaigns', ({ request }) => {
    const dest = new URL(request.url).searchParams.get('destinationDate') ?? '';
    return HttpResponse.json(campaign && dest.startsWith('2027') ? campaign : null);
  }),
  http.post('/api/renewal-campaigns', async ({ request }) => {
    const b = (await request.json()) as { originDate: string; destinationDate: string; deadline: string };
    campaign = {
      id: 'camp-1', originSeasonId: 'se-1', destinationSeasonId: 'se-2', deadline: b.deadline,
      windows: [
        { sourceBookingId: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 1, state: 'open' },
      ],
    };
    return HttpResponse.json({ id: campaign.id, originSeasonId: campaign.originSeasonId, destinationSeasonId: campaign.destinationSeasonId, deadline: campaign.deadline }, { status: 201 });
  }),
  http.delete('/api/renewal-campaigns/:id', () => { campaign = null; return HttpResponse.json({ ok: true }); }),
```
Aggiungere `resetCampaignSeed()` dove i test resettano gli altri seed (setup `beforeEach`).

- [ ] **Step 3: Composable test (fallisce)** — in `RenewalsView.spec.ts` aggiungere casi:
  - senza campagna (destinazione impostata, `GET` → null) la vista mostra il pannello **"Apri campagna"**;
  - dopo il click su **"Apri campagna"** (con una scadenza) compare la **scadenza** e il badge **"Aperta"** sulla riga;
  - il badge riflette `state` (`exercised` → "Rinnovato", `expired` → "Scaduta");
  - **"Chiudi campagna"** invoca `DELETE` e torna al pannello apertura.

  (Mantenere i test A4.2 esistenti: lista + azione Rinnova.)

- [ ] **Step 4: Run → FAIL.**

Run: `corepack pnpm --filter @coralyn/web-staff test -t Renewals`
Expected: FAIL.

- [ ] **Step 5: Composable** — in `useRenewals.ts` aggiungere:

```ts
import type { BookingDTO, RenewalCampaignDetailDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
// …
/** Campagna di prelazione per la stagione di destinazione (o null). */
export function useRenewalCampaign(destinationDate: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.renewalCampaign(session.establishmentId, destinationDate.value),
    queryFn: () => apiFetch<RenewalCampaignDetailDTO | null>(`/renewal-campaigns?destinationDate=${destinationDate.value}`),
    enabled: () => !!destinationDate.value,
  });
}

/** Apre una campagna (origine+destinazione+scadenza). */
export function useOpenCampaign() {
  return mutationResource({
    mutationFn: (input: { originDate: string; destinationDate: string; deadline: string }) =>
      apiFetch(`/renewal-campaigns`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [['renewalCampaign']],
  });
}

/** Chiude una campagna (rilascia gli hold). */
export function useCloseCampaign() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch(`/renewal-campaigns/${id}`, { method: 'DELETE' }),
    invalidates: () => [['renewalCampaign'], ['subscriptions'], ['map']],
  });
}
```
E in `useRenewBooking` aggiungere `['renewalCampaign']` agli `invalidates` (dopo un rinnovo la finestra diventa "esercitata").

- [ ] **Step 6: Vista** — estendere `RenewalsView.vue`:
  - importare `Badge` (già), `useRenewalCampaign/useOpenCampaign/useCloseCampaign`;
  - `const { data: campaign } = useRenewalCampaign(targetDate)`;
  - un `<input type="date">` per la **scadenza** (`ref deadline`) + bottone **"Apri campagna"** visibile quando `targetDate && !campaign`, che chiama `openCampaign.mutate({ originDate: sourceDate, destinationDate: targetDate, deadline })`;
  - quando `campaign` esiste: mostrare la **scadenza** + bottone **"Chiudi campagna"** (`closeCampaign.mutate(campaign.id)`); usare `campaign.windows` come righe (già ordinate); mappare lo stato:
    ```ts
    const stateBadge = (s: 'open'|'exercised'|'expired') =>
      s === 'exercised' ? { tone: 'success', label: 'Rinnovato' }
      : s === 'expired' ? { tone: 'warning', label: 'Scaduta' }
      : { tone: 'neutral', label: 'Aperta' };
    ```
  - il bottone **Rinnova** per riga resta: abilitato se `state !== 'exercised'` e `targetDate` presente; `doRenew(row.sourceBookingId)`.
  - **Fallback A4.2:** se `campaign` è null, mostrare la tabella `subs` esistente (comportamento invariato).

  > Verificare che il tono `warning` esista in `Badge` (ui-kit). Se manca, usare `danger` o aggiungerlo (additivo + test ui-kit, come `trash-2` in D-032); annotarlo nel commit.

- [ ] **Step 7: Pulire la cache Vite** (gotcha contratti) e **run → PASS:**

Run: `rm -rf apps/web-staff/node_modules/.vite && corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS, conteggio **≥ 93** (con i nuovi test).

- [ ] **Step 8: Lint + build + commit**

```bash
corepack pnpm eslint apps/web-staff/src && corepack pnpm -r build
git add apps/web-staff/src
git commit -m "feat(web-staff): campagna di prelazione nella vista Rinnovi (D-011)"
```

---

## Task 7: ADR-0034 + documentazione + handoff

**Files:**
- Create: `docs/architecture/decisions/0034-prelazione-finestre-lazy.md`
- Modify: `docs/architecture/deferred.md` (D-011 → Risolte), `docs/architecture/README.md` (indice ADR + modulo bookings), `docs/design/data-model.md` (entità + invariante hold), `docs/architecture/glossary.md` (Prelazione → implementata), `docs/architecture/decisions/0012-gestione-abbonamenti.md` (correlati → ADR-0034)
- Create: `docs/handoff/2026-07-02-d011-prelazione-handoff.md`

- [ ] **Step 1: ADR-0034** — scrivere l'ADR (Status: Accepted; Data: 2026-07-02) col contenuto §7 della spec: decisione (campagna = unico stato persistito, finestre derivate, rilascio lazy, hold applicativo, no BookingStatus, priorità=ordinamento); alternative scartate (job schedulato; righe per-abbonato; scadenza da formula); conseguenze (no audit del rilascio; race come D-030; disciplina: ogni write passa da `priceAndWrite`); Rubric check.

- [ ] **Step 2: `deferred.md`** — rimuovere la riga **D-011** dalla tabella e aggiungerla in **## Risolte**:
```
- **D-011** — Prelazione abbonamenti → **implementata** (branch `feat/d011-prelazione`, spec [2026-07-01-prelazione-abbonamenti-d011-design.md](../specs/2026-07-01-prelazione-abbonamenti-d011-design.md), piano [2026-07-02-prelazione-abbonamenti-d011.md](../superpowers/plans/2026-07-02-prelazione-abbonamenti-d011.md)). Nuovo **[ADR-0034](decisions/0034-prelazione-finestre-lazy.md)** (finestre derivate lazy; `RenewalCampaign` unico stato persistito; hold applicativo in `priceAndWrite`; nessun `BookingStatus` nuovo). Test: api unit …, e2e …; web-staff ….
```
(compilare i conteggi finali reali).

- [ ] **Step 3: `README.md`** — indice ADR `+= 0034`; nel modulo `bookings` citare la prelazione (finestre lazy).

- [ ] **Step 4: `data-model.md`** — aggiungere l'entità `RenewalCampaign` (campi + relazioni origine/destinazione) e l'**invariante di hold** (posto riservato durante la finestra, rilascio lazy).

- [ ] **Step 5: `glossary.md`** — voce **Prelazione**: da "(futuro)" a **implementata (D-011)**; citare `RenewalCampaign`, finestra derivata, rilascio lazy.

- [ ] **Step 6: `0012-gestione-abbonamenti.md`** — in "ADR correlati" e nel "Fuori MVP", segnare D-011 come **realizzata da [ADR-0034]**.

- [ ] **Step 7: Handoff** — `docs/handoff/2026-07-02-d011-prelazione-handoff.md`: stato finale, conteggi test, ancore di codice nuove (`renewal-campaigns.service.ts`, hold in `priceAndWrite`, `seniority.ts`), gotcha (migrazione+RLS, deadline fisse negli e2e), prossimo slice candidato.

- [ ] **Step 8: Verifica doc + commit**

```bash
git add docs
git commit -m "docs(D-011): ADR-0034 + deferred/README/data-model/glossary + handoff"
```

---

## Task 8: Verifica finale (DoD) — nessun commit di codice, solo gate

- [ ] **Suite complete verdi** (annotare i conteggi finali, tutti **≥** baseline):
  - `corepack pnpm --filter @coralyn/api test` (unit) · `test:e2e`
  - `corepack pnpm --filter @coralyn/web-staff test` · `corepack pnpm --filter @coralyn/ui-kit test`
- [ ] **Build + lint globali:** `corepack pnpm -r build` · `corepack pnpm eslint .` → verdi.
- [ ] **Rebuild container API** e **verifica live** (login `admin@coralyn.dev` / `coralyn-admin-8473`):
  - `docker compose --profile full up -d --build api` (senza il rebuild il container non ha il codice nuovo).
  - Nella vista **Rinnovi**: origine 2026 + destinazione 2027 → **Apri campagna** con una scadenza futura → i badge mostrano **Aperta**; un tentativo di prenotare l'ombrellone riservato da un altro cliente dà 409; il **Rinnovo** porta la riga a **Rinnovato**; **Chiudi campagna** libera il posto.
  - *(Gotcha preview: se il proxy autoPort è morto, navigare direttamente alla porta Vite reale via `location.replace('http://localhost:<porta>/…')`.)*
- [ ] **Aggiornare i conteggi reali** nel commit doc del Task 7 (se annotati come placeholder).
- [ ] **Whole-branch review** (opus) prima del merge; correggere e ri-revisionare.

---

## Self-Review (esito)

- **Copertura spec:** §2 modello → Task 2; §3 contratti → Task 1; §4 endpoint → Task 4; §5.1 refactor → Task 3; §5.2 hold → Task 5; §5.3 service finestre → Task 4; §6 FE → Task 6; §7 ADR-0034 → Task 7; §8 test → Task 4/5/6; §9 DoD → Task 8; §10-11 casi limite → coperti dagli e2e Task 4/5. **Nessuna sezione scoperta.**
- **Type consistency:** `computeSeniority(tx, ids)` (Task 3) usata identica in Task 4; `SeasonRange.id` (Task 3) usata in `open`/`getByDestinationDate` (Task 4); `RenewalWindowItemDTO`/`RenewalCampaignDetailDTO` (Task 1) usati in projection/service/controller/FE/MSW con gli stessi nomi campo; hold usa `slotsOverlap`/`dateRangesOverlap` con le firme esistenti.
- **Placeholder:** l'unico placeholder **intenzionale** è lo scheletro di `getByDestinationDate` nello Step 6 del Task 4, **sostituito** dal codice reale nello Step 7 dello stesso task (esplicitato). Nessun altro TBD.
```