# 5.6a — Informativa privacy Art. 13 al bagnante (multi-tenant) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Rendere disponibile un'informativa privacy Art. 13 parametrizzata per-lido, con i dati del
titolare gestiti per tenant e il contenuto tecnico reale dal codice, accessibile all'interessato
(bagnante) e all'operatore al momento della raccolta.

**Architecture:** Nuova entità 1:1 `EstablishmentLegalProfile` (RLS FORCE) coi dati del titolare per-lido;
un modulo api `legal` che espone un form staff (`/establishment/legal-profile`, admin-only), una lettura
pubblica (`/public/informativa/:id`) e una autenticata (`/customer/me/informativa`) tramite un unico
service condiviso. Il testo fisso dell'informativa vive come contenuto versionato in web-customer
(`PrivacyView`), l'unica parte dinamica è il blocco titolare. web-staff apre l'anteprima in deep-link a
web-customer (single source of truth, zero duplicazione).

**Tech Stack:** NestJS + Prisma (PostgreSQL, RLS via `set_config('app.current_tenant', …)`) · Vue 3 +
TanStack Query + ui-kit (Field/Input/Modal) · contracts in `@coralyn/contracts` · test: Jest (api,
`maxWorkers: 1`, calendario congelato 2026-07-15) + Vitest (FE, MSW in web-staff, `vi.mock` del composable
in web-customer).

## Global Constraints

- **RLS idiom** (copiare verbatim per ogni tabella tenant): `ENABLE` + `FORCE ROW LEVEL SECURITY` + policy
  `tenant_isolation` con `USING`/`WITH CHECK` = `nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"`.
- **Tenant nei service**: `this.tenant.require()` (da `TenantContext`, REQUEST-scoped) per lo staff;
  `customer.establishmentId` (da `@CurrentCustomer()`) per il canale cliente. Query RLS via
  `this.prisma.forTenant(tenantId, async (tx) => …)`.
- **Guard globali**: `JwtAuthGuard` + `RolesGuard` sono `APP_GUARD`. Rotte non-staff **devono** avere
  `@Public()` (da `../identity/public.decorator`); le customer aggiungono `@UseGuards(CustomerJwtGuard)`.
- **Migration**: generare con `prisma migrate dev --create-only`, **leggere l'SQL**, appendere il blocco
  RLS a mano (Prisma non lo genera). Dopo l'apply su `coralyn_dev`, **`migrate deploy` anche su
  `coralyn_test`** (`DATABASE_URL=…coralyn_test npx prisma migrate deploy`).
- **Ambiente host**: dopo un reinstall di node_modules rigira `prisma generate` prima del typecheck api.
- **Test**: gira l'**intera** suite del pacchetto toccato; suite di pacchetti diversi **una alla volta**.
- **Copy utente**: niente em dash `—`; en dash `–` solo come segnaposto di cella. Testo utente in
  italiano, chiaro e piano (Art. 12 GDPR).
- **DTO**: response = suffisso `DTO`; request body = `Input`; tutti i DTO sono `interface`/`type` inline in
  `packages/contracts/src/index.ts` (barrel unico). Date ISO string.
- **Marcatori legali nel testo dell'informativa**: `[COMPILARE]` per i dati mancanti del titolare;
  `⚖️ [DA VALIDARE CON LEGALE]` per i punti a giudizio. Chiusura con raccomandazione di revisione legale.

---

## File Structure

**apps/api** — *coerenza (dev-discipline §3): la form legal-profile è una sotto-feature establishment-admin
come `establishment-users`, quindi vive in `EstablishmentModule` (stesso precedente: `establishment-users.controller.ts`
sta in `src/establishment/`). Solo la lettura informativa (route diverse `/public/*` e `/customer/*`) sta in
un modulo `informativa` dedicato che riusa il service condiviso (DRY).*
- `prisma/schema.prisma` — Modify: nuovo model `EstablishmentLegalProfile` + relation su `Establishment`.
- `prisma/migrations/<ts>_add_establishment_legal_profile/migration.sql` — Create.
- `src/establishment/legal-profile.service.ts` — Create: `getForTenant()`, `upsert()`, `getTitolare(id)`
  (in `EstablishmentModule`, **esportato**).
- `src/establishment/legal-profile.controller.ts` — Create: staff `GET`/`PUT /establishment/legal-profile`.
- `src/establishment/dto/update-legal-profile.dto.ts` — Create: validazione body.
- `src/establishment/establishment.module.ts` — Modify: `providers += LegalProfileService` (+ `exports`),
  `controllers += LegalProfileController`.
- `src/informativa/informativa.module.ts` — Create: `imports: [EstablishmentModule, CustomerAuthModule]`.
- `src/informativa/public-informativa.controller.ts` — Create: `GET /public/informativa/:establishmentId`.
- `src/informativa/customer-informativa.controller.ts` — Create: `GET /customer/me/informativa`.
- `src/app.module.ts` — Modify: importare `InformativaModule` (`EstablishmentModule` è già importato).
- `src/customer-auth/customer-auth.module.ts` — Modify (se serve): esportare `CustomerJwtGuard`.
- `test/legal-profile.e2e-spec.ts`, `test/public-informativa.e2e-spec.ts`,
  `test/customer-informativa.e2e-spec.ts` — Create.

**packages/contracts**
- `src/index.ts` — Modify: `EstablishmentLegalProfileDTO`, `UpdateEstablishmentLegalProfileInput`,
  `PublicTitolareDTO`.

**apps/web-staff**
- `src/vite-env.d.ts` — Create: typing `ImportMetaEnv` + `VITE_WEB_CUSTOMER_URL`.
- `.env.example` — Create/Modify: documentare `VITE_WEB_CUSTOMER_URL`.
- `src/lib/privacyPreview.ts` — Create: helper `privacyPreviewUrl(establishmentId)`.
- `src/lib/queryKeys.ts` — Modify: `legalProfile(tenantId)`.
- `src/features/establishment/useEstablishment.ts` — Modify: `useLegalProfile`, `useUpdateLegalProfile`.
- `src/features/establishment/LegalProfileModal.vue` — Create.
- `src/features/establishment/EstablishmentView.vue` — Modify: card + bottone (admin-only) + modal.
- `src/features/customers/CustomersView.vue` — Modify: riga promemoria + link anteprima nel form.
- `src/features/customers/EditCustomerModal.vue` — Modify: idem.

**apps/web-customer**
- `src/router/index.ts` — Modify: rotta `/privacy` (public).
- `src/features/legal/informativa.content.ts` — Create: testo fisso + versione/data.
- `src/features/legal/useInformativa.ts` — Create: `useMyInformativa`, `usePublicInformativa`.
- `src/features/legal/PrivacyView.vue` — Create.
- `src/lib/queryKeys.ts` — Modify: chiavi informativa.
- `src/features/subscriptions/ActivationView.vue` — Modify: link `/privacy`.
- `src/features/subscriptions/MySubscriptionsView.vue` — Modify: footer link `/privacy`.

**docs**
- `docs/architecture/deferred.md` — Modify: D-024 + nuove voci 5.6b/5.6c.
- `docs/architecture/decisions/00XX-informativa-art13-multi-tenant.md` — Create: ADR.
- `docs/design/data-model.md`, `docs/design/flows.md` — Modify.

---

## Task 1: Prisma model `EstablishmentLegalProfile` + migration RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`model Establishment`, nuovo model in coda)
- Create: `apps/api/prisma/migrations/<ts>_add_establishment_legal_profile/migration.sql`

**Interfaces:**
- Produces: tabella `EstablishmentLegalProfile` (PK=FK `establishmentId`), colonne
  `legalName`/`registeredAddress`/`vatOrTaxId`/`contactEmail`/`pec`/`legalRepresentative`/`dataRightsContact`
  (tutte `String?`), `dpoNominated` (`Boolean @default(false)`), `dpoContact` (`String?`),
  `updatedAt` (`DateTime @updatedAt`); relation `Establishment.legalProfile?`.

- [ ] **Step 1: Aggiungere il model e la relation allo schema**

In `apps/api/prisma/schema.prisma`, dentro `model Establishment { … }` aggiungere una riga tra le relation:
```prisma
  legalProfile       EstablishmentLegalProfile?
```
In coda al file aggiungere:
```prisma
/// Dati del titolare del trattamento per l'informativa privacy Art. 13 mostrata al bagnante
/// (5.6a). 1:1 con Establishment; tutti i campi nullable finché il lido non compila (→ [COMPILARE]).
model EstablishmentLegalProfile {
  establishmentId     String        @id @db.Uuid
  establishment       Establishment @relation(fields: [establishmentId], references: [id], onDelete: Cascade)
  legalName           String?
  registeredAddress   String?
  vatOrTaxId          String?
  contactEmail        String?
  pec                 String?
  legalRepresentative String?
  dataRightsContact   String?
  dpoNominated        Boolean       @default(false)
  dpoContact          String?
  updatedAt           DateTime      @updatedAt
}
```

- [ ] **Step 2: Generare la migration senza applicarla**

Run: `cd apps/api && npx prisma migrate dev --create-only --name add_establishment_legal_profile`
Expected: crea `prisma/migrations/<ts>_add_establishment_legal_profile/migration.sql` con `CREATE TABLE`
+ FK, **senza** RLS.

- [ ] **Step 3: Leggere l'SQL generato e appendere il blocco RLS**

Aprire il `migration.sql` generato, verificare che il `CREATE TABLE "EstablishmentLegalProfile"` e la FK
`onDelete: Cascade` ci siano, poi **appendere in fondo**:
```sql
-- RLS (Prisma non la genera): isolamento per tenant, come le altre tabelle tenant-scoped.
ALTER TABLE "EstablishmentLegalProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstablishmentLegalProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EstablishmentLegalProfile"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 4: Applicare la migration su dev e generare il client**

Run: `cd apps/api && npx prisma migrate dev && npx prisma generate`
Expected: applica la migration a `coralyn_dev`, client rigenerato (tipo `EstablishmentLegalProfile`
disponibile).

- [ ] **Step 5: Applicare la migration a coralyn_test**

Run: `cd apps/api && DATABASE_URL="postgresql://coralyn_app:app@127.0.0.1:5433/coralyn_test" npx prisma migrate deploy`
Expected: `1 migration applied` (adegua l'URL alla tua `.env` di test se differisce; vedi memoria host).

- [ ] **Step 6: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): EstablishmentLegalProfile (1:1, RLS) per informativa 5.6a"
```

---

## Task 2: Contracts DTO

**Files:**
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `EstablishmentLegalProfileDTO`, `UpdateEstablishmentLegalProfileInput`, `PublicTitolareDTO`.

- [ ] **Step 1: Aggiungere i tipi al barrel**

In `packages/contracts/src/index.ts` (in coda, vicino ai tipi establishment) aggiungere:
```ts
/** Dati del titolare del trattamento del lido (form staff dell'informativa, 5.6a). */
export interface EstablishmentLegalProfileDTO {
  legalName: string | null;
  registeredAddress: string | null;
  vatOrTaxId: string | null;
  contactEmail: string | null;
  pec: string | null;
  legalRepresentative: string | null;
  dataRightsContact: string | null;
  dpoNominated: boolean;
  dpoContact: string | null;
  updatedAt: string | null; // ISO; null se il profilo non è mai stato salvato
}

/** Upsert del profilo legale (tutti i campi opzionali; assenti = invariati). */
export interface UpdateEstablishmentLegalProfileInput {
  legalName?: string | null;
  registeredAddress?: string | null;
  vatOrTaxId?: string | null;
  contactEmail?: string | null;
  pec?: string | null;
  legalRepresentative?: string | null;
  dataRightsContact?: string | null;
  dpoNominated?: boolean;
  dpoContact?: string | null;
}

/** Dati del titolare esposti per il render dell'informativa (pubblici per natura). */
export interface PublicTitolareDTO {
  establishmentName: string;
  legalName: string | null;
  registeredAddress: string | null;
  vatOrTaxId: string | null;
  contactEmail: string | null;
  pec: string | null;
  legalRepresentative: string | null;
  dataRightsContact: string | null;
  dpoNominated: boolean;
  dpoContact: string | null;
}
```

- [ ] **Step 2: Buildare i contracts**

Run: `corepack pnpm -C packages/contracts build`
Expected: exit 0, `dist/index.d.ts` aggiornato coi tre tipi.

- [ ] **Step 3: Commit**
```bash
git add packages/contracts/src/index.ts packages/contracts/dist
git commit -m "feat(contracts): DTO informativa/legal-profile 5.6a"
```

---

## Task 3: `LegalProfileService` (in EstablishmentModule)

**Files:**
- Create: `apps/api/src/establishment/legal-profile.service.ts`
- Modify: `apps/api/src/establishment/establishment.module.ts`
- Test: `apps/api/src/establishment/legal-profile.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant`, `TenantContext.require()`.
- Produces: `LegalProfileService.getForTenant(): Promise<EstablishmentLegalProfileDTO>`,
  `.upsert(input: UpdateEstablishmentLegalProfileInput): Promise<EstablishmentLegalProfileDTO>`,
  `.getTitolare(establishmentId: string): Promise<PublicTitolareDTO>`.

- [ ] **Step 1: Scrivere i test del service**

Create `apps/api/src/establishment/legal-profile.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { LegalProfileService } from './legal-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

const TENANT = '11111111-1111-1111-1111-111111111111';

function makeTx() {
  return {
    establishment: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Lido Test' }) },
    establishmentLegalProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        legalName: 'Acme Srl', registeredAddress: null, vatOrTaxId: null, contactEmail: null,
        pec: null, legalRepresentative: null, dataRightsContact: null, dpoNominated: false,
        dpoContact: null, updatedAt: new Date('2026-07-24T10:00:00Z'),
      }),
    },
  };
}

describe('LegalProfileService', () => {
  let service: LegalProfileService;
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    const prisma = { forTenant: jest.fn((_id: string, fn: any) => fn(tx)) };
    const tenant = { require: jest.fn().mockReturnValue(TENANT) };
    const mod = await Test.createTestingModule({
      providers: [
        LegalProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
      ],
    }).compile();
    service = mod.get(LegalProfileService);
  });

  it('getForTenant ritorna un DTO a campi vuoti se il profilo non esiste', async () => {
    const dto = await service.getForTenant();
    expect(dto.legalName).toBeNull();
    expect(dto.dpoNominated).toBe(false);
    expect(dto.updatedAt).toBeNull();
  });

  it('upsert scrive establishmentId=tenant e ritorna il DTO', async () => {
    const dto = await service.upsert({ legalName: 'Acme Srl' });
    expect(tx.establishmentLegalProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { establishmentId: TENANT } }),
    );
    expect(dto.legalName).toBe('Acme Srl');
    expect(dto.updatedAt).toBe('2026-07-24T10:00:00.000Z');
  });

  it('getTitolare proietta nome lido + campi null quando manca il profilo', async () => {
    const dto = await service.getTitolare(TENANT);
    expect(dto.establishmentName).toBe('Lido Test');
    expect(dto.legalName).toBeNull();
    expect(dto.dpoNominated).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire i test (falliscono)**

Run: `corepack pnpm -C apps/api exec jest src/establishment/legal-profile.service.spec.ts`
Expected: FAIL — `Cannot find module './legal-profile.service'`.

- [ ] **Step 3: Implementare il service**

Create `apps/api/src/establishment/legal-profile.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type {
  EstablishmentLegalProfileDTO,
  PublicTitolareDTO,
  UpdateEstablishmentLegalProfileInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

const EMPTY: EstablishmentLegalProfileDTO = {
  legalName: null, registeredAddress: null, vatOrTaxId: null, contactEmail: null, pec: null,
  legalRepresentative: null, dataRightsContact: null, dpoNominated: false, dpoContact: null,
  updatedAt: null,
};

type Row = {
  legalName: string | null; registeredAddress: string | null; vatOrTaxId: string | null;
  contactEmail: string | null; pec: string | null; legalRepresentative: string | null;
  dataRightsContact: string | null; dpoNominated: boolean; dpoContact: string | null;
  updatedAt: Date;
};

function toDTO(row: Row): EstablishmentLegalProfileDTO {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class LegalProfileService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  async getForTenant(): Promise<EstablishmentLegalProfileDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const row = (await tx.establishmentLegalProfile.findUnique({
        where: { establishmentId: tenantId },
      })) as Row | null;
      return row ? toDTO(row) : { ...EMPTY };
    });
  }

  async upsert(input: UpdateEstablishmentLegalProfileInput): Promise<EstablishmentLegalProfileDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const data = { ...input };
      const row = (await tx.establishmentLegalProfile.upsert({
        where: { establishmentId: tenantId },
        create: { establishmentId: tenantId, ...data },
        update: data,
      })) as Row;
      return toDTO(row);
    });
  }

  async getTitolare(establishmentId: string): Promise<PublicTitolareDTO> {
    return this.prisma.forTenant(establishmentId, async (tx) => {
      const [est, row] = await Promise.all([
        tx.establishment.findUniqueOrThrow({ where: { id: establishmentId }, select: { name: true } }),
        tx.establishmentLegalProfile.findUnique({ where: { establishmentId } }) as Promise<Row | null>,
      ]);
      return {
        establishmentName: est.name,
        legalName: row?.legalName ?? null,
        registeredAddress: row?.registeredAddress ?? null,
        vatOrTaxId: row?.vatOrTaxId ?? null,
        contactEmail: row?.contactEmail ?? null,
        pec: row?.pec ?? null,
        legalRepresentative: row?.legalRepresentative ?? null,
        dataRightsContact: row?.dataRightsContact ?? null,
        dpoNominated: row?.dpoNominated ?? false,
        dpoContact: row?.dpoContact ?? null,
      };
    });
  }
}
```

- [ ] **Step 4: Registrare il service in EstablishmentModule (con export)**

In `apps/api/src/establishment/establishment.module.ts`: importare `LegalProfileService`, aggiungerlo
all'array `providers` **e** `exports` (l'export serve al futuro `InformativaModule`, T5/T6). Nessun nuovo
modulo: il service vive nel modulo establishment come gli altri service establishment-admin.

- [ ] **Step 5: Eseguire i test (passano) e il typecheck**

Run: `corepack pnpm -C apps/api exec jest src/establishment/legal-profile.service.spec.ts`
Expected: PASS (3 test).
Run: `corepack pnpm -C apps/api exec tsc -p tsconfig.json --noEmit` (o `corepack pnpm -C apps/api typecheck`)
Expected: exit 0 (dopo `prisma generate` del Task 1).

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/establishment/legal-profile.service.ts apps/api/src/establishment/legal-profile.service.spec.ts apps/api/src/establishment/establishment.module.ts
git commit -m "feat(api): LegalProfileService (get/upsert/getTitolare) in EstablishmentModule"
```

---

## Task 4: Staff controller `GET`/`PUT /establishment/legal-profile`

**Files:**
- Create: `apps/api/src/establishment/dto/update-legal-profile.dto.ts`
- Create: `apps/api/src/establishment/legal-profile.controller.ts`
- Modify: `apps/api/src/establishment/establishment.module.ts` (registrare il controller)
- Test: `apps/api/test/legal-profile.e2e-spec.ts`

**Interfaces:**
- Consumes: `LegalProfileService`, `@Roles(Role.Admin)`, `RolesGuard` (globale).
- Produces: `GET /establishment/legal-profile` → `EstablishmentLegalProfileDTO`;
  `PUT /establishment/legal-profile` (body `UpdateLegalProfileDto`) → `EstablishmentLegalProfileDTO`.

- [ ] **Step 1: Scrivere la e2e (admin salva e rilegge; staff riceve 403)**

Create `apps/api/test/legal-profile.e2e-spec.ts`. **Per il bootstrap app + login**: apri prima
`apps/api/test/establishment-users.e2e-spec.ts` (o `customers.e2e-spec.ts`) e riusa **lo stesso** helper di
setup che già producono un token admin e uno staff nello stesso tenant (non reinventare il seed/login).
Asserzioni:
```ts
// admin: PUT poi GET round-trip
const put = await request(app.getHttpServer())
  .put('/api/establishment/legal-profile')
  .set('Authorization', `Bearer ${adminToken}`)
  .send({ legalName: 'Lido Acme Srl', contactEmail: 'info@acme.it', dpoNominated: false })
  .expect(200);
expect(put.body.legalName).toBe('Lido Acme Srl');

const get = await request(app.getHttpServer())
  .get('/api/establishment/legal-profile')
  .set('Authorization', `Bearer ${adminToken}`)
  .expect(200);
expect(get.body.contactEmail).toBe('info@acme.it');

// staff: 403
await request(app.getHttpServer())
  .put('/api/establishment/legal-profile')
  .set('Authorization', `Bearer ${staffToken}`)
  .send({ legalName: 'x' })
  .expect(403);

// email malformata: 400
await request(app.getHttpServer())
  .put('/api/establishment/legal-profile')
  .set('Authorization', `Bearer ${adminToken}`)
  .send({ contactEmail: 'non-una-email' })
  .expect(400);
```

- [ ] **Step 2: Eseguire la e2e (fallisce)**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json legal-profile`
Expected: FAIL — 404 sulle rotte (controller assente).

- [ ] **Step 3: Scrivere il DTO di validazione**

Create `apps/api/src/establishment/dto/update-legal-profile.dto.ts`:
```ts
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { UpdateEstablishmentLegalProfileInput } from '@coralyn/contracts';

// Consente null esplicito (azzeramento campo) accanto a stringa valida.
const optionalEmail = () => ValidateIf((_o, v) => v !== null && v !== undefined);

export class UpdateLegalProfileDto implements UpdateEstablishmentLegalProfileInput {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string | null;
  @IsOptional() @IsString() @MaxLength(300) registeredAddress?: string | null;
  @IsOptional() @IsString() @MaxLength(60) vatOrTaxId?: string | null;
  @optionalEmail() @IsEmail() contactEmail?: string | null;
  @optionalEmail() @IsEmail() pec?: string | null;
  @IsOptional() @IsString() @MaxLength(200) legalRepresentative?: string | null;
  @optionalEmail() @IsEmail() dataRightsContact?: string | null;
  @IsOptional() @IsBoolean() dpoNominated?: boolean;
  @IsOptional() @IsString() @MaxLength(300) dpoContact?: string | null;
}
```

- [ ] **Step 4: Scrivere il controller**

Create `apps/api/src/establishment/legal-profile.controller.ts`:
```ts
import { Body, Controller, Get, Put } from '@nestjs/common';
import type { EstablishmentLegalProfileDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { LegalProfileService } from './legal-profile.service';
import { UpdateLegalProfileDto } from './dto/update-legal-profile.dto';

@Controller('establishment/legal-profile')
export class LegalProfileController {
  constructor(private readonly legal: LegalProfileService) {}

  @Get()
  @Roles(Role.Admin)
  get(): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.getForTenant();
  }

  @Put()
  @Roles(Role.Admin)
  update(@Body() body: UpdateLegalProfileDto): Promise<EstablishmentLegalProfileDTO> {
    return this.legal.upsert(body);
  }
}
```
In `establishment.module.ts` aggiungere `LegalProfileController` all'array `controllers`.

- [ ] **Step 5: Eseguire la e2e (passa) + l'intera suite e2e**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json legal-profile`
Expected: PASS.
Run: `corepack pnpm -C apps/api test:e2e`
Expected: tutte verdi (baseline + la nuova suite).

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/establishment/legal-profile.controller.ts apps/api/src/establishment/dto/update-legal-profile.dto.ts apps/api/src/establishment/establishment.module.ts apps/api/test/legal-profile.e2e-spec.ts
git commit -m "feat(api): staff GET/PUT /establishment/legal-profile (admin-only)"
```

---

## Task 5: `InformativaModule` + public controller `GET /public/informativa/:establishmentId`

**Files:**
- Create: `apps/api/src/informativa/informativa.module.ts`
- Create: `apps/api/src/informativa/public-informativa.controller.ts`
- Modify: `apps/api/src/app.module.ts` (importare `InformativaModule`)
- Test: `apps/api/test/public-informativa.e2e-spec.ts`

**Interfaces:**
- Consumes: `LegalProfileService.getTitolare` (esportato da `EstablishmentModule`), `@Public()`.
- Produces: `InformativaModule`; `GET /public/informativa/:establishmentId` → `PublicTitolareDTO` (nessuna auth).

- [ ] **Step 1: Scrivere la e2e (pubblico, senza token)**
```ts
// nessun Authorization header
const res = await request(app.getHttpServer())
  .get(`/api/public/informativa/${establishmentId}`)
  .expect(200);
expect(res.body.establishmentName).toBeDefined();
expect(res.body).toHaveProperty('legalName'); // null se non compilato
// id inesistente → 404 (findUniqueOrThrow)
await request(app.getHttpServer())
  .get('/api/public/informativa/00000000-0000-0000-0000-000000000000')
  .expect(404);
```

- [ ] **Step 2: Eseguire la e2e (fallisce)**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json public-informativa`
Expected: FAIL — 404 su rotta assente / oppure 401 (guard globale) se il `@Public()` mancasse.

- [ ] **Step 3: Scrivere il controller e il modulo**

Create `apps/api/src/informativa/public-informativa.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { LegalProfileService } from '../establishment/legal-profile.service';

@Controller('public/informativa')
export class PublicInformativaController {
  constructor(private readonly legal: LegalProfileService) {}

  @Public()
  @Get(':establishmentId')
  get(@Param('establishmentId', ParseUUIDPipe) establishmentId: string): Promise<PublicTitolareDTO> {
    return this.legal.getTitolare(establishmentId);
  }
}
```
Create `apps/api/src/informativa/informativa.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { EstablishmentModule } from '../establishment/establishment.module';
import { PublicInformativaController } from './public-informativa.controller';

@Module({
  imports: [EstablishmentModule],
  controllers: [PublicInformativaController],
})
export class InformativaModule {}
```
In `apps/api/src/app.module.ts` aggiungere `InformativaModule` all'array `imports` (import in testa).

- [ ] **Step 4: Eseguire la e2e (passa) + suite e2e completa**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json public-informativa`
Expected: PASS.
Run: `corepack pnpm -C apps/api test:e2e`
Expected: tutte verdi.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/informativa apps/api/src/app.module.ts apps/api/test/public-informativa.e2e-spec.ts
git commit -m "feat(api): GET /public/informativa/:id (pubblico, dentro RLS via id)"
```

---

## Task 6: Customer endpoint `GET /customer/me/informativa`

**Files:**
- Create: `apps/api/src/informativa/customer-informativa.controller.ts`
- Modify: `apps/api/src/informativa/informativa.module.ts` (import `CustomerAuthModule`, registrare controller)
- Modify: `apps/api/src/customer-auth/customer-auth.module.ts` (esportare `CustomerJwtGuard` se non già)
- Test: `apps/api/test/customer-informativa.e2e-spec.ts`

**Interfaces:**
- Consumes: `LegalProfileService.getTitolare`, `@Public()`, `CustomerJwtGuard`, `@CurrentCustomer()`.
- Produces: `GET /customer/me/informativa` → `PublicTitolareDTO` (customer JWT).

- [ ] **Step 1: Scrivere la e2e (customer token → 200; senza token → 401)**

Riusa il flusso di provisioning+activate delle e2e del canale cliente (vedi
`test/customer-subscriptions.e2e-spec.ts` per ottenere un `customerAccessToken`). Asserzioni:
```ts
const res = await request(app.getHttpServer())
  .get('/api/customer/me/informativa')
  .set('Authorization', `Bearer ${customerAccessToken}`)
  .expect(200);
expect(res.body.establishmentName).toBeDefined();

await request(app.getHttpServer())
  .get('/api/customer/me/informativa')
  .expect(401); // nessun token → CustomerJwtGuard rifiuta
```

- [ ] **Step 2: Eseguire la e2e (fallisce)**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json customer-informativa`
Expected: FAIL — 404/route assente.

- [ ] **Step 3: Assicurare l'export di `CustomerJwtGuard`**

In `apps/api/src/customer-auth/customer-auth.module.ts`, verificare che `CustomerJwtGuard` sia nei
`providers` e aggiungerlo agli `exports` se assente (serve a `InformativaModule` per `@UseGuards`).

- [ ] **Step 4: Scrivere il controller**

Create `apps/api/src/informativa/customer-informativa.controller.ts`:
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { Public } from '../identity/public.decorator';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import type { CustomerPrincipal } from '../customer-auth/customer-principal';
import { LegalProfileService } from '../establishment/legal-profile.service';

@Controller('customer/me')
export class CustomerInformativaController {
  constructor(private readonly legal: LegalProfileService) {}

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('informativa')
  get(@CurrentCustomer() customer: CustomerPrincipal): Promise<PublicTitolareDTO> {
    return this.legal.getTitolare(customer.establishmentId);
  }
}
```
In `informativa.module.ts`: aggiungere `CustomerAuthModule` agli `imports` e
`CustomerInformativaController` ai `controllers`.

- [ ] **Step 5: Eseguire la e2e (passa) + suite e2e completa**

Run: `corepack pnpm -C apps/api exec jest --config test/jest-e2e.json customer-informativa`
Expected: PASS.
Run: `corepack pnpm -C apps/api test:e2e && corepack pnpm -C apps/api test`
Expected: e2e + unit tutte verdi.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/informativa apps/api/src/customer-auth/customer-auth.module.ts apps/api/test/customer-informativa.e2e-spec.ts
git commit -m "feat(api): GET /customer/me/informativa (customer JWT)"
```

---

## Task 7: web-staff — env typing + helper anteprima

**Files:**
- Create: `apps/web-staff/src/vite-env.d.ts`
- Create/Modify: `apps/web-staff/.env.example`
- Create: `apps/web-staff/src/lib/privacyPreview.ts`
- Test: `apps/web-staff/src/lib/privacyPreview.spec.ts`

**Interfaces:**
- Produces: `privacyPreviewUrl(establishmentId: string): string`.

- [ ] **Step 1: Scrivere il test dell'helper**

Create `apps/web-staff/src/lib/privacyPreview.spec.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { privacyPreviewUrl } from './privacyPreview';

afterEach(() => vi.unstubAllEnvs());

describe('privacyPreviewUrl', () => {
  it('compone base URL + /privacy?e=<id>', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', 'https://clienti.coralyn.it');
    expect(privacyPreviewUrl('abc')).toBe('https://clienti.coralyn.it/privacy?e=abc');
  });
  it('senza base URL usa un percorso relativo', () => {
    vi.stubEnv('VITE_WEB_CUSTOMER_URL', '');
    expect(privacyPreviewUrl('abc')).toBe('/privacy?e=abc');
  });
});
```

- [ ] **Step 2: Eseguire il test (fallisce)**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/lib/privacyPreview.spec.ts`
Expected: FAIL — modulo assente.

- [ ] **Step 3: Creare typing env + helper + .env.example**

Create `apps/web-staff/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Origin dell'app web-customer, per il deep-link all'anteprima informativa (5.6a). */
  readonly VITE_WEB_CUSTOMER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```
Create `apps/web-staff/src/lib/privacyPreview.ts`:
```ts
/** URL dell'informativa pubblicata da web-customer per un lido (deep-link, no duplicazione). */
export function privacyPreviewUrl(establishmentId: string): string {
  const base = (import.meta.env.VITE_WEB_CUSTOMER_URL ?? '').replace(/\/$/, '');
  return `${base}/privacy?e=${establishmentId}`;
}
```
Create/append `apps/web-staff/.env.example`:
```
# Origin dell'app clienti (web-customer), per il deep-link all'anteprima informativa privacy.
VITE_WEB_CUSTOMER_URL=http://localhost:5174
```

- [ ] **Step 4: Eseguire il test (passa)**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/lib/privacyPreview.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web-staff/src/vite-env.d.ts apps/web-staff/src/lib/privacyPreview.ts apps/web-staff/src/lib/privacyPreview.spec.ts apps/web-staff/.env.example
git commit -m "feat(web-staff): helper privacyPreviewUrl + typing VITE_WEB_CUSTOMER_URL"
```

---

## Task 8: web-staff — hooks legal profile

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/establishment/useEstablishment.ts`

**Interfaces:**
- Consumes: `apiFetch`, `queryResource`, `mutationResource`, `queryKeys`.
- Produces: `useLegalProfile()` (query), `useUpdateLegalProfile()` (mutation).

- [ ] **Step 1: Aggiungere la query key**

In `apps/web-staff/src/lib/queryKeys.ts` aggiungere all'oggetto:
```ts
  legalProfile: (tenantId: string) => ['legal-profile', tenantId] as const,
```

- [ ] **Step 2: Aggiungere gli hook**

In `apps/web-staff/src/features/establishment/useEstablishment.ts` aggiungere (adeguando gli import di
`EstablishmentLegalProfileDTO`/`UpdateEstablishmentLegalProfileInput` da `@coralyn/contracts`):
```ts
export function useLegalProfile() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.legalProfile(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentLegalProfileDTO>('/establishment/legal-profile'),
  });
}

export function useUpdateLegalProfile() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateEstablishmentLegalProfileInput) =>
      apiFetch<EstablishmentLegalProfileDTO>('/establishment/legal-profile', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    invalidates: () => [queryKeys.legalProfile(session.establishmentId)],
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm -C apps/web-staff exec vue-tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/establishment/useEstablishment.ts
git commit -m "feat(web-staff): hook useLegalProfile/useUpdateLegalProfile"
```

---

## Task 9: web-staff — form titolare (card + modal, admin-only)

**Files:**
- Create: `apps/web-staff/src/features/establishment/LegalProfileModal.vue`
- Modify: `apps/web-staff/src/features/establishment/EstablishmentView.vue`
- Test: `apps/web-staff/src/features/establishment/LegalProfileModal.spec.ts`

**Interfaces:**
- Consumes: `useLegalProfile`, `useUpdateLegalProfile`, ui-kit `Modal/Field/Input/Select/Option/Button`.
- Produces: `LegalProfileModal` (`v-model:open`), form con i 9 campi + `dpoNominated` (Select sì/no).

- [ ] **Step 1: Scrivere lo spec del modal**

Create `apps/web-staff/src/features/establishment/LegalProfileModal.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import LegalProfileModal from './LegalProfileModal.vue';

describe('LegalProfileModal', () => {
  it('carica il profilo e salva le modifiche via PUT', async () => {
    let putBody: any = null;
    server.use(
      http.get('/api/establishment/legal-profile', () =>
        HttpResponse.json({
          legalName: 'Acme Srl', registeredAddress: null, vatOrTaxId: null, contactEmail: null,
          pec: null, legalRepresentative: null, dataRightsContact: null, dpoNominated: false,
          dpoContact: null, updatedAt: null,
        }),
      ),
      http.put('/api/establishment/legal-profile', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({ ...(putBody as object), updatedAt: '2026-07-24T10:00:00.000Z' });
      }),
    );
    const w = mountApp(LegalProfileModal, { attachTo: document.body, props: { open: true } });
    await flushPromises();
    expect((w.get('[data-test="legal-legalName"]').element as HTMLInputElement).value).toBe('Acme Srl');
    w.get('[data-test="legal-legalName"]').setValue('Lido Acme Srl');
    (document.querySelector('[data-test="form-legal-profile"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(putBody.legalName).toBe('Lido Acme Srl');
    w.unmount();
  });
});
```

- [ ] **Step 2: Aggiungere l'handler MSW di default**

In `apps/web-staff/src/mocks/server.ts` aggiungere ai default handler un GET che ritorna un profilo vuoto
(così le viste che montano l'establishment non falliscono):
```ts
http.get('/api/establishment/legal-profile', () =>
  HttpResponse.json({
    legalName: null, registeredAddress: null, vatOrTaxId: null, contactEmail: null, pec: null,
    legalRepresentative: null, dataRightsContact: null, dpoNominated: false, dpoContact: null,
    updatedAt: null,
  }),
),
```

- [ ] **Step 3: Eseguire lo spec (fallisce)**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/features/establishment/LegalProfileModal.spec.ts`
Expected: FAIL — componente assente.

- [ ] **Step 4: Implementare il modal**

Create `apps/web-staff/src/features/establishment/LegalProfileModal.vue`:
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, Field, Input, Textarea, Select, Option, Button } from '@coralyn/ui-kit';
import { pushToast } from '@/lib/toasts';
import { useLegalProfile, useUpdateLegalProfile } from './useEstablishment';

const open = defineModel<boolean>('open', { required: true });
const { data } = useLegalProfile();
const update = useUpdateLegalProfile();

const legalName = ref('');
const registeredAddress = ref('');
const vatOrTaxId = ref('');
const contactEmail = ref('');
const pec = ref('');
const legalRepresentative = ref('');
const dataRightsContact = ref('');
const dpoNominated = ref<'no' | 'si'>('no');
const dpoContact = ref('');

watch(
  () => [open.value, data.value] as const,
  ([isOpen]) => {
    if (!isOpen || !data.value) return;
    legalName.value = data.value.legalName ?? '';
    registeredAddress.value = data.value.registeredAddress ?? '';
    vatOrTaxId.value = data.value.vatOrTaxId ?? '';
    contactEmail.value = data.value.contactEmail ?? '';
    pec.value = data.value.pec ?? '';
    legalRepresentative.value = data.value.legalRepresentative ?? '';
    dataRightsContact.value = data.value.dataRightsContact ?? '';
    dpoNominated.value = data.value.dpoNominated ? 'si' : 'no';
    dpoContact.value = data.value.dpoContact ?? '';
  },
  { immediate: true },
);

function n(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function submit(): void {
  update.mutate(
    {
      legalName: n(legalName.value),
      registeredAddress: n(registeredAddress.value),
      vatOrTaxId: n(vatOrTaxId.value),
      contactEmail: n(contactEmail.value),
      pec: n(pec.value),
      legalRepresentative: n(legalRepresentative.value),
      dataRightsContact: n(dataRightsContact.value),
      dpoNominated: dpoNominated.value === 'si',
      dpoContact: dpoNominated.value === 'si' ? n(dpoContact.value) : null,
    },
    {
      onSuccess: () => {
        pushToast({ tone: 'success', message: 'Dati per l’informativa salvati.' });
        open.value = false;
      },
    },
  );
}
</script>

<template>
  <Modal v-model:open="open" title="Dati per l'informativa privacy">
    <form id="form-legal-profile" data-test="form-legal-profile" class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-xs leading-relaxed text-[var(--color-text-muted)]">
        Questi dati compaiono nell'informativa privacy mostrata ai tuoi clienti come titolare del
        trattamento. I campi lasciati vuoti appariranno come da compilare.
      </p>
      <Field label="Denominazione / ragione sociale"><Input data-test="legal-legalName" v-model="legalName" /></Field>
      <Field label="Sede legale"><Input data-test="legal-registeredAddress" v-model="registeredAddress" /></Field>
      <Field label="P.IVA / Codice Fiscale"><Input data-test="legal-vatOrTaxId" v-model="vatOrTaxId" /></Field>
      <div class="flex gap-3.5">
        <div class="flex-1"><Field label="Email di contatto"><Input data-test="legal-contactEmail" v-model="contactEmail" type="email" /></Field></div>
        <div class="flex-1"><Field label="PEC"><Input data-test="legal-pec" v-model="pec" type="email" /></Field></div>
      </div>
      <Field label="Legale rappresentante"><Input data-test="legal-legalRepresentative" v-model="legalRepresentative" /></Field>
      <Field label="Contatto per l'esercizio dei diritti"><Input data-test="legal-dataRightsContact" v-model="dataRightsContact" type="email" /></Field>
      <Field label="DPO nominato?">
        <Select data-testid="legal-dpoNominated" v-model="dpoNominated">
          <Option value="no">No</Option>
          <Option value="si">Sì</Option>
        </Select>
      </Field>
      <Field v-if="dpoNominated === 'si'" label="Contatti DPO"><Input data-test="legal-dpoContact" v-model="dpoContact" /></Field>
    </form>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit" form="form-legal-profile" :loading="update.isPending.value">Salva</Button>
      </div>
    </template>
  </Modal>
</template>
```

- [ ] **Step 5: Agganciare card + bottone in EstablishmentView (admin-only)**

In `apps/web-staff/src/features/establishment/EstablishmentView.vue`:
1. import: `import LegalProfileModal from './LegalProfileModal.vue';`
2. stato: `const legalOpen = ref(false);`
3. nella colonna delle card (accanto a "Informazioni stabilimento"), aggiungere una `<Card>` admin-only:
```vue
<Card v-if="isAdmin" class="mb-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-[var(--color-text)]">Informativa privacy</h3>
      <p class="text-xs text-[var(--color-text-muted)]">Dati del titolare mostrati ai clienti.</p>
    </div>
    <Button variant="secondary" data-test="edit-legal-profile" @click="legalOpen = true">Compila</Button>
  </div>
</Card>
```
4. in coda al template, accanto agli altri dialog: `<LegalProfileModal v-model:open="legalOpen" />`

- [ ] **Step 6: Eseguire lo spec del modal + l'intera suite web-staff**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/features/establishment/LegalProfileModal.spec.ts`
Expected: PASS.
Run: `corepack pnpm -C apps/web-staff test`
Expected: tutte verdi (baseline + nuovo spec; EstablishmentView spec resta verde grazie all'handler MSW di default).

- [ ] **Step 7: Commit**
```bash
git add apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): form titolare informativa (card + modal, admin-only)"
```

---

## Task 10: web-staff — touchpoint di raccolta (promemoria + link anteprima)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomersView.vue`
- Modify: `apps/web-staff/src/features/customers/EditCustomerModal.vue`
- Test: `apps/web-staff/src/features/customers/CustomersView.spec.ts` (aggiungere un caso)

**Interfaces:**
- Consumes: `privacyPreviewUrl`, `useSessionStore().establishmentId`.

- [ ] **Step 1: Aggiungere l'asserzione allo spec**

In `apps/web-staff/src/features/customers/CustomersView.spec.ts` aggiungere un test che, aperto il modal
"Nuovo cliente", verifica la presenza del link con l'href atteso:
```ts
it('mostra il promemoria informativa con link anteprima nel form nuovo cliente', async () => {
  const w = mountApp(CustomersView, { attachTo: document.body });
  await flushPromises();
  await w.get('[data-test="new-customer"]').trigger('click');
  const link = w.get('[data-test="privacy-reminder-link"]');
  expect(link.attributes('href')).toContain('/privacy?e=');
  w.unmount();
});
```

- [ ] **Step 2: Eseguire (fallisce)**

Run: `corepack pnpm -C apps/web-staff exec vitest run src/features/customers/CustomersView.spec.ts`
Expected: FAIL — selettore assente.

- [ ] **Step 3: Aggiungere la riga promemoria nei due form**

In `CustomersView.vue` (script): `import { privacyPreviewUrl } from '@/lib/privacyPreview'; import { useSessionStore } from '@/stores/session';` e `const session = useSessionStore();` (se non presente).
Dentro il `<form id="form-new-customer">`, **dopo** il `<Field label="Note">`, aggiungere:
```vue
<p class="text-xs leading-relaxed text-[var(--color-text-muted)]">
  Informa il cliente e forniscigli l'informativa privacy:
  <a
    :href="privacyPreviewUrl(session.establishmentId)"
    target="_blank"
    rel="noopener"
    data-test="privacy-reminder-link"
    class="underline"
  >apri anteprima</a>.
</p>
```
Ripetere identico in `EditCustomerModal.vue` dentro il suo `<form id="form-edit-customer">` dopo il campo
Note (stessi import; `data-test="privacy-reminder-link"`).

- [ ] **Step 4: Eseguire lo spec + l'intera suite web-staff**

Run: `corepack pnpm -C apps/web-staff test`
Expected: tutte verdi.

- [ ] **Step 5: Commit**
```bash
git add apps/web-staff/src/features/customers
git commit -m "feat(web-staff): promemoria informativa + link anteprima al punto di raccolta"
```

---

## Task 11: web-customer — rotta /privacy + contenuto informativa

**Files:**
- Modify: `apps/web-customer/src/router/index.ts`
- Create: `apps/web-customer/src/features/legal/informativa.content.ts`

**Interfaces:**
- Produces: costante `INFORMATIVA` (versione, data, sezioni ordinate con testo fisso); rotta `/privacy`.

- [ ] **Step 1: Registrare la rotta pubblica**

In `apps/web-customer/src/router/index.ts` aggiungere all'array `routes`:
```ts
{ path: '/privacy', name: 'privacy', component: () => import('@/features/legal/PrivacyView.vue'), meta: { public: true, title: 'Informativa privacy' } },
```

- [ ] **Step 2: Scrivere il modulo di contenuto (testo reale Art. 13)**

Create `apps/web-customer/src/features/legal/informativa.content.ts`:
```ts
// Informativa privacy Art. 13 GDPR mostrata al bagnante (5.6a). Testo FISSO versionato in git; l'unica
// parte dinamica è il blocco titolare (dai dati del lido). Bozza tecnica, non parere legale: i punti
// [DA VALIDARE CON LEGALE] vanno rivisti da un DPO/legale prima della pubblicazione.
export const INFORMATIVA_VERSION = '1.0';
export const INFORMATIVA_UPDATED = '2026-07-24';

export interface InformativaSection {
  id: string;
  heading: string;
  paragraphs: string[];
  legalReview?: boolean; // ⚖️ da validare con legale
}

export const INFORMATIVA_SECTIONS: InformativaSection[] = [
  {
    id: 'finalita',
    heading: 'Perché trattiamo i tuoi dati',
    paragraphs: [
      'Lo stabilimento tratta i tuoi dati (nome, cognome, eventuali telefono, email e note) per gestire le prenotazioni, gli abbonamenti e i noleggi, e per erogare il servizio richiesto. La base giuridica è l’esecuzione del contratto o delle misure precontrattuali che richiedi (art. 6.1.b GDPR).',
      'Alcune note operative possono essere trattate per il legittimo interesse dello stabilimento a gestire il rapporto con te (art. 6.1.f GDPR).',
      'I dati contenuti nelle registrazioni contabili sono conservati per adempiere a un obbligo di legge (art. 6.1.c GDPR; art. 2220 del Codice Civile).',
    ],
    legalReview: true,
  },
  {
    id: 'canale-cliente',
    heading: 'Il tuo accesso personale',
    paragraphs: [
      'Se lo stabilimento ti fornisce un accesso personale (link e PIN), trattiamo i dati tecnici necessari a farti entrare in modo sicuro e a mostrarti i tuoi abbonamenti, incluse le eventuali segnalazioni di assenza che decidi di comunicare.',
    ],
  },
  {
    id: 'categorie',
    heading: 'Quali dati',
    paragraphs: [
      'Dati anagrafici e di contatto: nome, cognome e, se forniti, telefono ed email. Eventuali note inserite dallo stabilimento. Dati relativi a prenotazioni, abbonamenti e noleggi. Credenziali tecniche del tuo accesso personale (identificativi e PIN in forma protetta).',
    ],
  },
  {
    id: 'destinatari',
    heading: 'Chi tratta i dati per conto dello stabilimento',
    paragraphs: [
      'Il gestionale è fornito da Coralyn, che agisce come responsabile del trattamento per conto dello stabilimento (art. 28 GDPR). I dati sono ospitati presso il fornitore di hosting indicato di seguito. Non vendiamo i tuoi dati e non li comunichiamo a terzi per finalità di marketing.',
      'Fornitore di hosting e ubicazione dei server: [COMPILARE].',
    ],
    legalReview: true,
  },
  {
    id: 'sicurezza',
    heading: 'Come proteggiamo i dati',
    paragraphs: [
      'Adottiamo misure tecniche adeguate (art. 32 GDPR): separazione rigorosa dei dati tra stabilimenti diversi a livello di database, password protette con algoritmi di hashing robusti, accessi regolati da token temporanei, isolamento per stabilimento e cancellazione o anonimizzazione irreversibile dei dati su richiesta.',
    ],
  },
  {
    id: 'conservazione',
    heading: 'Per quanto tempo',
    paragraphs: [
      'Conserviamo i dati per il tempo necessario a gestire il rapporto e, per i dati contabili, per 10 anni come richiesto dalla legge (art. 2220 Codice Civile). Su richiesta di cancellazione, i dati anagrafici vengono rimossi o resi anonimi in modo irreversibile, mantenendo lo storico contabile in forma anonima.',
    ],
  },
  {
    id: 'diritti',
    heading: 'I tuoi diritti',
    paragraphs: [
      'Puoi chiedere in qualsiasi momento l’accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e l’opposizione (artt. 15-22 GDPR). Per esercitarli, contatta lo stabilimento titolare ai recapiti indicati sopra.',
      'Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).',
    ],
  },
  {
    id: 'trasferimenti',
    heading: 'Trasferimenti fuori dall’Unione Europea',
    paragraphs: [
      'Eventuali trasferimenti di dati fuori dallo Spazio Economico Europeo, e le relative garanzie, dipendono dal fornitore di hosting: [COMPILARE].',
    ],
    legalReview: true,
  },
  {
    id: 'cookie',
    heading: 'Cookie e strumenti tecnici',
    paragraphs: [
      'Questa applicazione non utilizza cookie di profilazione né strumenti di analisi o tracciamento. Per farti restare autenticato utilizziamo esclusivamente una memoria tecnica del tuo dispositivo, necessaria al funzionamento del servizio: per questa non è richiesto il tuo consenso.',
    ],
  },
  {
    id: 'conferimento',
    heading: 'Se non fornisci i dati',
    paragraphs: [
      'Il conferimento dei dati di contatto è necessario per gestire prenotazioni e abbonamenti: senza di essi lo stabilimento non può erogarti il servizio.',
    ],
  },
  {
    id: 'automatizzati',
    heading: 'Decisioni automatizzate',
    paragraphs: [
      'Non effettuiamo processi decisionali automatizzati né profilazione ai sensi dell’art. 22 GDPR.',
    ],
  },
];
```

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm -C apps/web-customer exec vue-tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add apps/web-customer/src/router/index.ts apps/web-customer/src/features/legal/informativa.content.ts
git commit -m "feat(web-customer): rotta /privacy + contenuto informativa Art. 13"
```

---

## Task 12: web-customer — hooks informativa

**Files:**
- Modify: `apps/web-customer/src/lib/queryKeys.ts`
- Create: `apps/web-customer/src/features/legal/useInformativa.ts`

**Interfaces:**
- Consumes: `apiFetch`, `queryResource`.
- Produces: `useMyInformativa()` (autenticato), `usePublicInformativa(establishmentId: string)`.

- [ ] **Step 1: Aggiungere le query key**

In `apps/web-customer/src/lib/queryKeys.ts` estendere l'oggetto `queryKeys`:
```ts
  myInformativa: () => ['customer', 'informativa'] as const,
  publicInformativa: (establishmentId: string) => ['public', 'informativa', establishmentId] as const,
```

- [ ] **Step 2: Scrivere gli hook**

Create `apps/web-customer/src/features/legal/useInformativa.ts`:
```ts
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryResource } from '@/lib/useQueryResource';
import { queryKeys } from '@/lib/queryKeys';

export function useMyInformativa() {
  return queryResource({
    queryKey: () => queryKeys.myInformativa(),
    queryFn: () => apiFetch<PublicTitolareDTO>('/customer/me/informativa'),
  });
}

export function usePublicInformativa(establishmentId: string) {
  return queryResource({
    queryKey: () => queryKeys.publicInformativa(establishmentId),
    queryFn: () => apiFetch<PublicTitolareDTO>(`/public/informativa/${establishmentId}`, {}, { retryOn401: false }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm -C apps/web-customer exec vue-tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add apps/web-customer/src/lib/queryKeys.ts apps/web-customer/src/features/legal/useInformativa.ts
git commit -m "feat(web-customer): hook useMyInformativa/usePublicInformativa"
```

---

## Task 13: web-customer — `PrivacyView.vue`

**Files:**
- Create: `apps/web-customer/src/features/legal/PrivacyView.vue`
- Modify: `apps/web-customer/src/router/index.ts` (registrare la rotta `/privacy` — spostata qui da T11
  perché la rotta e la view devono nascere insieme, altrimenti `vue-tsc` va rosso su un componente
  inesistente; l'app non ha lo shim `declare module '*.vue'`).
- Modify: `apps/web-customer/src/features/legal/useInformativa.ts` — aggiungere un parametro opzionale
  `enabled?: () => boolean` a **entrambi** gli hook e passarlo a `queryResource` (che lo supporta), così
  la view può gateare quale fonte fetcha (vedi il commento nel codice `PrivacyView` sotto: evita il
  401→refresh→logout da sloggati e il 400 su id vuoto). Firme risultanti:
  `useMyInformativa(enabled?: () => boolean)` e `usePublicInformativa(establishmentId: string, enabled?: () => boolean)`.
- Test: `apps/web-customer/src/features/legal/PrivacyView.spec.ts`

**Interfaces:**
- Consumes: `INFORMATIVA_SECTIONS`, `INFORMATIVA_VERSION`, `INFORMATIVA_UPDATED`, `useMyInformativa`,
  `usePublicInformativa`, `useSessionStore`, `useRoute`.

**Registrazione rotta** (dopo aver creato la view, prima del typecheck finale): in
`apps/web-customer/src/router/index.ts` aggiungere all'array `routes`:
```ts
{ path: '/privacy', name: 'privacy', component: () => import('@/features/legal/PrivacyView.vue'), meta: { public: true, title: 'Informativa privacy' } },
```

- [ ] **Step 1: Scrivere lo spec (risoluzione + [COMPILARE])**

Create `apps/web-customer/src/features/legal/PrivacyView.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import PrivacyView from './PrivacyView.vue';
import { useMyInformativa, usePublicInformativa } from './useInformativa';

vi.mock('./useInformativa', () => ({
  useMyInformativa: vi.fn(),
  usePublicInformativa: vi.fn(),
}));

const TITOLARE = {
  establishmentName: 'Lido Test', legalName: null, registeredAddress: null, vatOrTaxId: null,
  contactEmail: null, pec: null, legalRepresentative: null, dataRightsContact: null,
  dpoNominated: false, dpoContact: null,
};

beforeEach(() => {
  vi.mocked(usePublicInformativa).mockReturnValue({ data: ref(TITOLARE) } as any);
  vi.mocked(useMyInformativa).mockReturnValue({ data: ref(null) } as any);
});

describe('PrivacyView', () => {
  it('mostra le sezioni fisse e [COMPILARE] sui campi mancanti del titolare', async () => {
    const w = mountApp(PrivacyView, { attachTo: document.body });
    await flushPromises();
    expect(w.text()).toContain('I tuoi diritti');
    expect(w.text()).toContain('[COMPILARE]'); // legalName null
    expect(w.get('[data-testid="informativa-version"]').text()).toContain('1.0');
    w.unmount();
  });
});
```
Nota: `mountApp` fornisce un memory router; per far leggere `?e=` allo spec, il componente deve gestire
l'assenza di query gracefully (ramo autenticato/fallback). Il test sopra copre il ramo pubblico via mock.

- [ ] **Step 2: Eseguire (fallisce)**

Run: `corepack pnpm -C apps/web-customer exec vitest run src/features/legal/PrivacyView.spec.ts`
Expected: FAIL — componente assente.

- [ ] **Step 3: Implementare la view**

Create `apps/web-customer/src/features/legal/PrivacyView.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { INFORMATIVA_SECTIONS, INFORMATIVA_VERSION, INFORMATIVA_UPDATED } from './informativa.content';
import { useMyInformativa, usePublicInformativa } from './useInformativa';

const route = useRoute();
const session = useSessionStore();
const eid = computed(() => (typeof route.query.e === 'string' ? route.query.e : ''));

// Priorità: ?e=<id> (deep-link) → pubblico; altrimenti autenticato; altrimenti solo testo fisso.
// Gating (queryResource.enabled): parte SOLO la fonte pertinente. Senza gating, un /privacy da
// sloggati farebbe partire /customer/me/informativa → 401 → l'interceptor tenta un refresh → logout
// + redirect a /attiva (bug), e /public/informativa/ con id vuoto → 400. Il gating lo evita.
const publicRes = usePublicInformativa(eid.value, () => eid.value.length > 0);
const myRes = useMyInformativa(() => eid.value.length === 0 && session.authenticated);
const titolare = computed<PublicTitolareDTO | null>(() => {
  if (eid.value) return publicRes.data.value ?? null;
  if (session.authenticated) return myRes.data.value ?? null;
  return null;
});

const TODO = '[COMPILARE]';
function v(field: keyof PublicTitolareDTO): string {
  const t = titolare.value;
  if (!t) return TODO;
  const raw = t[field];
  return raw === null || raw === '' ? TODO : String(raw);
}
const titolareName = computed(() => (titolare.value ? titolare.value.establishmentName : 'lo stabilimento presso cui ti sei registrato'));
</script>

<template>
  <section class="mx-auto max-w-[640px] px-5 py-8">
    <h1 class="mb-1 text-[22px] font-bold tracking-[-.02em] text-[var(--color-text)]">Informativa privacy</h1>
    <p data-testid="informativa-version" class="mb-6 text-xs text-[var(--color-text-muted)]">
      Versione {{ INFORMATIVA_VERSION }} · aggiornata il {{ INFORMATIVA_UPDATED }}
    </p>

    <div class="mb-6 rounded-lg border border-[var(--color-border)] p-4">
      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">Titolare del trattamento</h2>
      <p class="text-sm text-[var(--color-text-muted)]">{{ titolareName }}</p>
      <dl class="mt-2 grid grid-cols-1 gap-1 text-sm text-[var(--color-text-muted)]">
        <div><span class="font-medium">Denominazione:</span> {{ v('legalName') }}</div>
        <div><span class="font-medium">Sede legale:</span> {{ v('registeredAddress') }}</div>
        <div><span class="font-medium">P.IVA / C.F.:</span> {{ v('vatOrTaxId') }}</div>
        <div><span class="font-medium">Email:</span> {{ v('contactEmail') }}</div>
        <div><span class="font-medium">PEC:</span> {{ v('pec') }}</div>
        <div><span class="font-medium">Legale rappresentante:</span> {{ v('legalRepresentative') }}</div>
        <div><span class="font-medium">Contatto per i diritti:</span> {{ v('dataRightsContact') }}</div>
        <div v-if="titolare?.dpoNominated"><span class="font-medium">DPO:</span> {{ v('dpoContact') }}</div>
      </dl>
    </div>

    <div v-for="s in INFORMATIVA_SECTIONS" :key="s.id" class="mb-5">
      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">{{ s.heading }}</h2>
      <p v-for="(p, i) in s.paragraphs" :key="i" class="mb-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{{ p }}</p>
    </div>

    <p class="mt-8 border-t border-[var(--color-border)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
      Questo testo è una bozza tecnica e non costituisce un parere legale. Prima della pubblicazione deve
      essere validato da un professionista legale o dal responsabile della protezione dei dati.
    </p>
  </section>
</template>
```

- [ ] **Step 4: Eseguire lo spec + l'intera suite web-customer**

Run: `corepack pnpm -C apps/web-customer exec vitest run src/features/legal/PrivacyView.spec.ts`
Expected: PASS.
Run: `corepack pnpm -C apps/web-customer test`
Expected: tutte verdi.

- [ ] **Step 5: Commit**
```bash
git add apps/web-customer/src/features/legal/PrivacyView.vue apps/web-customer/src/features/legal/PrivacyView.spec.ts
git commit -m "feat(web-customer): PrivacyView (informativa parametrizzata + [COMPILARE])"
```

---

## Task 14: web-customer — link all'informativa (attivazione + abbonamenti)

**Files:**
- Modify: `apps/web-customer/src/features/subscriptions/ActivationView.vue`
- Modify: `apps/web-customer/src/features/subscriptions/MySubscriptionsView.vue`
- Test: aggiornare i rispettivi spec.

**Interfaces:**
- Consumes: `RouterLink` (`vue-router`).

- [ ] **Step 1: Aggiungere le asserzioni agli spec**

In `ActivationView.spec.ts` aggiungere un test: dopo il mount con `?token=` presente, esiste un link a
`/privacy` (`data-testid="privacy-link"`). In `MySubscriptionsView.spec.ts` idem (link `/privacy` nel
footer). Con `RouterLink` stubbato in `mountApp`, asserire su `data-testid` e sul testo:
```ts
expect(w.find('[data-testid="privacy-link"]').exists()).toBe(true);
```

- [ ] **Step 2: Eseguire (falliscono)**

Run: `corepack pnpm -C apps/web-customer exec vitest run src/features/subscriptions`
Expected: FAIL sui nuovi casi.

- [ ] **Step 3: Aggiungere i link**

In `ActivationView.vue`: import `RouterLink` da `vue-router`; dentro il `<div>` esterno (dopo il
`</template>` del ramo token, quindi visibile sempre), aggiungere:
```vue
<RouterLink to="/privacy" data-testid="privacy-link" class="mt-6 block text-center text-xs text-[var(--color-text-muted)] underline">
  Informativa privacy
</RouterLink>
```
In `MySubscriptionsView.vue`: import `RouterLink`; in fondo alla `<section>`, aggiungere un footer:
```vue
<footer class="mt-8 border-t border-[var(--color-border)] pt-4 text-center">
  <RouterLink to="/privacy" data-testid="privacy-link" class="text-xs text-[var(--color-text-muted)] underline">Informativa privacy</RouterLink>
</footer>
```

- [ ] **Step 4: Eseguire gli spec + l'intera suite**

Run: `corepack pnpm -C apps/web-customer test`
Expected: tutte verdi.

- [ ] **Step 5: Commit**
```bash
git add apps/web-customer/src/features/subscriptions
git commit -m "feat(web-customer): link informativa in attivazione e abbonamenti"
```

---

## Task 15: Docs — deferred.md, ADR, design docs

**Files:**
- Modify: `docs/architecture/deferred.md`
- Create: `docs/architecture/decisions/00XX-informativa-art13-multi-tenant.md`
- Modify: `docs/design/data-model.md`, `docs/design/flows.md`

- [ ] **Step 1: Aggiornare deferred.md**

In `docs/architecture/deferred.md`, voce **D-024**: aggiungere un aggiornamento datato 2026-07-24 che il
residuo "informativa Art. 13 alla raccolta" è **realizzato per il piano A** (informativa al bagnante
parametrizzata per-lido, ADR nuovo), e che **restano** i piani B/C. Aggiungere due voci nuove:
- **5.6b** — Privacy policy operatori (Coralyn titolare) + cookie/imprint per web-staff/web-platform.
- **5.6c** — DPA Coralyn↔lido (art. 28) + registro trattamenti (art. 30) come documenti in `docs/legal/`.

- [ ] **Step 2: Scrivere l'ADR**

Determinare il prossimo numero ADR (Run: `ls docs/architecture/decisions | tail`). Create
`docs/architecture/decisions/00XX-informativa-art13-multi-tenant.md` con: Context (ruoli titolare/
responsabile multi-tenant, D-024 residuo), Decision (informativa parametrizzata per-lido via
`EstablishmentLegalProfile`; base = contratto/obbligo legale, **no consenso**; testo come codice, titolare
come dato; endpoint pubblico dentro RLS + endpoint customer via JWT; deep-link operatore), Alternatives
(consenso versionato — scartato; colonne su Establishment — scartato; package legale condiviso — rimandato
a 5.6b), Consequences (disclaimer di validazione legale, punti `⚖️`), Rubric check. Riferire ADR-0043,
ADR-0026, ADR-0028.

- [ ] **Step 3: Aggiornare i design docs**

`docs/design/data-model.md`: aggiungere `EstablishmentLegalProfile` al diagramma ER (1:1 con
Establishment, RLS). `docs/design/flows.md`: aggiungere dove il bagnante/operatore accede all'informativa
(attivazione, abbonamenti, deep-link operatore) e la risoluzione del titolare.

- [ ] **Step 4: Commit**
```bash
git add docs/architecture/deferred.md docs/architecture/decisions docs/design
git commit -m "docs: ADR informativa Art. 13 multi-tenant + deferred 5.6b/5.6c + design docs"
```

---

## Self-Review (svolto in fase di scrittura)

1. **Spec coverage**: §4 modello → T1; §2 DTO → T2; §5 API (staff/pubblico/customer) → T3-T6; §6 web-staff
   (form + touchpoint + anteprima) → T7-T10; §7 web-customer (/privacy + risoluzione + link) → T11-T14;
   §8 contenuto → T11; §11 deferred/ADR/design → T15. Nessun requisito scoperto.
2. **Placeholder scan**: gli unici `[COMPILARE]`/`⚖️` sono **contenuto voluto** dell'informativa (dati del
   titolare mancanti / punti a giudizio legale), non lacune del piano. Nessun "TBD/TODO" di piano. Il
   numero ADR è `00XX` **deliberatamente da risolvere in T15 Step 2** (dipende dallo stato dei file).
3. **Type consistency**: `PublicTitolareDTO`/`EstablishmentLegalProfileDTO`/`UpdateEstablishmentLegalProfileInput`
   usati coerentemente tra contracts (T2), service (T3), controller (T4-T6) e hook FE (T8/T12);
   `getTitolare(establishmentId)` firma identica in T3/T5/T6; `privacyPreviewUrl` identico T7/T10.

## Note di rischio per l'esecutore

- **e2e**: riusa gli helper di bootstrap/login esistenti (non reinventare il seed); il calendario è
  congelato al 2026-07-15 ma qui non c'è logica temporale. Gira le e2e in sequenza (`maxWorkers: 1` già
  in config). Dopo la migration, `migrate deploy` su `coralyn_test` (T1 Step 5) o le e2e falliscono.
- **Wiring Nest**: se `@UseGuards(CustomerJwtGuard)` in `InformativaModule` non risolve, verifica che
  `CustomerAuthModule` **esporti** `CustomerJwtGuard` (T6 Step 3) e sia negli `imports` di
  `InformativaModule`. `EstablishmentModule` deve **esportare** `LegalProfileService` (T3 Step 4) perché
  `InformativaModule` lo consumi.
- **MSW web-staff**: l'handler di default `GET /establishment/legal-profile` (T9 Step 2) evita che gli
  spec di `EstablishmentView` esistenti si rompano quando la card monta il modal.
- **Reinstall host**: se `pnpm` re-triggera il wipe di node_modules, rigira `prisma generate` prima del
  typecheck api.
- **Nessun merge su `main`** senza ok esplicito dell'utente.
</content>
