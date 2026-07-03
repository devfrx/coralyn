# Equipment personalizzato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il `Package.equipment` JSONB free-form con un catalogo tenant-scoped `EquipmentType` + una composizione normalizzata `PackageEquipment`, chiudendo il bug del "clobber" dell'editor e il debito del JSONB opaco.

**Architecture:** Nuova entità `EquipmentType` (catalogo, mirror di `Package` per archiviazione/hard-delete) + join `PackageEquipment` (qty ≥ 1, un tipo per pacchetto). Una migrazione Prisma con step SQL converte il JSONB esistente in catalogo + link (mappa nomi, `SUM`/`GROUP BY` per collisioni) e rimuove la colonna. La composizione del pacchetto diventa una scrittura **set-assoluto** in transazione. FE: sezione catalogo tipi + compositore multi-riga con creazione al volo.

**Tech Stack:** Prisma 6 / PostgreSQL 16 (RLS FORCE), NestJS (`class-validator`), Vue 3 + Vue Query + MSW, Vitest/Jest, `@coralyn/contracts` (tipi condivisi).

## Global Constraints

- **Codice/DB in inglese; UI/documentazione in italiano.** (convenzione di progetto)
- **Baseline test da NON regredire (verificata su `main`):** api unit **94** · api e2e **130** · web-staff **148** (globa i 55 di ui-kit) · ui-kit standalone **55**. Typecheck web-staff pulito. Ogni suite può solo **crescere**.
- **RLS FORCE su ogni tabella tenant-scoped** (ADR-0010): ogni nuova tabella tenant porta `establishmentId` + policy `tenant_isolation` identica + `@@index([establishmentId])`. **Vale anche per `PackageEquipment`** (raffina lo sketch della spec §3.1, che ometteva l'`establishmentId` sul join: necessario perché il ruolo applicativo `coralyn_app` è `NOBYPASSRLS` e possiede le tabelle con `FORCE`).
- **Il ruolo di migrazione (`coralyn_app`) è soggetto a RLS FORCE.** Qualsiasi step-dati che LEGGE `"Package"` deve prima `ALTER TABLE "Package" NO FORCE ROW LEVEL SECURITY` e ripristinare `FORCE` dopo, altrimenti legge **zero righe** (GUC `app.current_tenant` non impostata in `migrate deploy`).
- **`quantity` ≥ 1** validato lato applicativo (DTO/service), non CHECK DB (coerente con lo stile del progetto).
- **Un commit per Task.** Test-first. Ogni implementer fa il lavoro con i propri tool, **non** spawna subagent.
- **Nomi/tipi condivisi** (da usare identici in tutti i Task):
  - `EquipmentTypeDTO { id: string; name: string; archived?: true }`
  - `CreateEquipmentTypeInput { name: string }` · `UpdateEquipmentTypeInput { name?: string }`
  - `PackageEquipmentDTO { equipmentTypeId: string; name: string; quantity: number }`
  - `PackageDTO.equipment: PackageEquipmentDTO[]`
  - `CreatePackageInput.equipment: { equipmentTypeId: string; quantity: number }[]`
  - Endpoint catalogo: `GET/POST /equipment-types`, `PATCH /equipment-types/:id`, `POST /equipment-types/:id/archive|restore`, `DELETE /equipment-types/:id`.

## File Structure

**Backend**
- `apps/api/prisma/schema.prisma` — MODIFY: `model EquipmentType`, `model PackageEquipment`; rimuovi `Package.equipment`; relazioni inverse su `Establishment` e `Package`.
- `apps/api/prisma/migrations/<ts>_add_equipment_type_and_package_equipment/migration.sql` — CREATE (hand-authored: DDL + data-copy + RLS).
- `apps/api/prisma/seed.ts` — MODIFY: crea `EquipmentType` + `PackageEquipment` invece del JSONB.
- `apps/api/test/helpers/seed-pricing.ts` — MODIFY: idem per gli e2e.
- `packages/contracts/src/index.ts` — MODIFY: nuovi DTO/input equipment; cambia `PackageDTO.equipment` e `CreatePackageInput.equipment`.
- `apps/api/src/catalog/equipment-type.projection.ts` — CREATE: `toEquipmentTypeDTO`.
- `apps/api/src/catalog/package.projection.ts` — MODIFY: proietta l'array `equipment` risolto e ordinato.
- `apps/api/src/catalog/dto/create-equipment-type.dto.ts`, `update-equipment-type.dto.ts` — CREATE.
- `apps/api/src/catalog/dto/create-package.dto.ts`, `update-package.dto.ts` — MODIFY: `equipment` = array validato (`@ValidateNested`).
- `apps/api/src/catalog/equipment-types.controller.ts` — CREATE (mirror `packages.controller.ts`).
- `apps/api/src/catalog/catalog.service.ts` — MODIFY: metodi EquipmentType CRUD + composizione pacchetto (create/update/list).
- `apps/api/src/catalog/catalog.module.ts` — MODIFY: registra `EquipmentTypesController`.
- Test: `apps/api/src/catalog/equipment-type.projection.spec.ts`, `package.projection.spec.ts` (MODIFY); `apps/api/test/equipment-types.e2e-spec.ts` (CREATE); `apps/api/test/packages.e2e-spec.ts` (MODIFY, composizione).

**Frontend**
- `apps/web-staff/src/features/pricing/useEquipmentTypes.ts` — CREATE: query + mutation.
- `apps/web-staff/src/lib/queryKeys.ts` — MODIFY: `equipmentTypes`.
- `apps/web-staff/src/features/pricing/PricingView.vue` — MODIFY: sezione catalogo + compositore + `equipmentLabel`.
- `apps/web-staff/src/mocks/server.ts` — MODIFY: handler `/api/equipment-types` + shape `equipment` array.
- `apps/web-staff/src/features/pricing/PricingView.spec.ts` — MODIFY: catalogo + compositore.
- `apps/web-staff/src/lib/useEntityLabels.spec.ts`, `apps/web-staff/src/features/bookings/BookingsView.spec.ts` — MODIFY: shape `equipment` array nei mock.

**Docs**
- `docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md` — CREATE.
- `docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md` — MODIFY: riga di rimando.

---

## Task 1: Schema + migrazione dati + seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma:203-214` (`model Package`, `model Establishment:10-26`)
- Create: `apps/api/prisma/migrations/<ts>_add_equipment_type_and_package_equipment/migration.sql`
- Modify: `apps/api/prisma/seed.ts:124-128`
- Modify: `apps/api/test/helpers/seed-pricing.ts:16-19,79-86`

**Interfaces:**
- Produces: tabelle `"EquipmentType"`(id, establishmentId, name, archivedAt) e `"PackageEquipment"`(establishmentId, packageId, equipmentTypeId, quantity); `Package` senza colonna `equipment`; client Prisma con `prisma.equipmentType` e `prisma.packageEquipment`. Seed dev/test creano i link (dev: `Standard` → 2×Lettino, 1×Sdraio; test: `Standard` → 2×Lettino).

- [ ] **Step 1: Aggiorna `schema.prisma`**

In `model Establishment` aggiungi la relazione inversa (dopo `packages Package[]`):
```prisma
  equipmentTypes   EquipmentType[]
```
Sostituisci `model Package` (rimuovi `equipment`, aggiungi `packageLinks`):
```prisma
model Package {
  id              String             @id @default(uuid()) @db.Uuid
  establishmentId String             @db.Uuid
  name            String
  archivedAt      DateTime?
  establishment   Establishment      @relation(fields: [establishmentId], references: [id])
  bookings        Booking[]
  rates           Rate[]
  packageLinks    PackageEquipment[]

  @@index([establishmentId])
}
```
Aggiungi in fondo al file:
```prisma
model EquipmentType {
  id              String             @id @default(uuid()) @db.Uuid
  establishmentId String             @db.Uuid
  name            String
  archivedAt      DateTime?
  establishment   Establishment      @relation(fields: [establishmentId], references: [id])
  packageLinks    PackageEquipment[]

  @@unique([establishmentId, name])
  @@index([establishmentId])
}

model PackageEquipment {
  establishmentId String        @db.Uuid
  packageId       String        @db.Uuid
  equipmentTypeId String        @db.Uuid
  quantity        Int
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  package         Package       @relation(fields: [packageId], references: [id], onDelete: Cascade)
  equipmentType   EquipmentType @relation(fields: [equipmentTypeId], references: [id], onDelete: Restrict)

  @@id([packageId, equipmentTypeId])
  @@index([equipmentTypeId])
  @@index([establishmentId])
}
```
Aggiungi la relazione inversa `packageEquipments PackageEquipment[]` su `model Establishment` (Prisma la richiede per la FK `establishmentId` del join). Riga da aggiungere in `Establishment`:
```prisma
  packageEquipments PackageEquipment[]
```

- [ ] **Step 2: Genera lo scheletro di migrazione (create-only)**

Carica `DATABASE_URL` dal `.env` root senza stamparlo (il classifier blocca la materializzazione di credenziali). Da `apps/api`:
```bash
set -a; . ../../.env; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate dev --create-only --name add_equipment_type_and_package_equipment
```
Expected: crea la cartella migration con DDL Prisma (CREATE TABLE `EquipmentType`, `PackageEquipment`, DROP COLUMN `equipment`), **senza applicarla**.

- [ ] **Step 3: Riscrivi `migration.sql` a mano (DDL + dati + RLS nell'ordine corretto)**

Sostituisci l'intero contenuto con (adatta i nomi FK se Prisma li genera diversi, ma mantieni quest'ordine):
```sql
-- CreateTable
CREATE TABLE "EquipmentType" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackageEquipment" (
    "establishmentId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "equipmentTypeId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "PackageEquipment_pkey" PRIMARY KEY ("packageId","equipmentTypeId")
);

-- Index
CREATE UNIQUE INDEX "EquipmentType_establishmentId_name_key" ON "EquipmentType"("establishmentId","name");
CREATE INDEX "EquipmentType_establishmentId_idx" ON "EquipmentType"("establishmentId");
CREATE INDEX "PackageEquipment_equipmentTypeId_idx" ON "PackageEquipment"("equipmentTypeId");
CREATE INDEX "PackageEquipment_establishmentId_idx" ON "PackageEquipment"("establishmentId");

-- ForeignKey
ALTER TABLE "EquipmentType" ADD CONSTRAINT "EquipmentType_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DATA MIGRATION: JSONB -> catalogo + link.
-- Il ruolo applicativo (coralyn_app) e' NOBYPASSRLS e possiede "Package" con FORCE RLS:
-- senza NO FORCE la SELECT su "Package" leggerebbe 0 righe (GUC app.current_tenant non impostata).
ALTER TABLE "Package" NO FORCE ROW LEVEL SECURITY;

-- 1) Catalogo: una riga per (tenant, nome-mappato) distinto.
INSERT INTO "EquipmentType" ("id", "establishmentId", "name")
SELECT gen_random_uuid(), x."establishmentId", x."name"
FROM (
  SELECT DISTINCT
    p."establishmentId" AS "establishmentId",
    CASE e.key
      WHEN 'sunbeds'    THEN 'Lettino'
      WHEN 'deckchairs' THEN 'Sdraio'
      WHEN 'umbrellas'  THEN 'Ombrellone'
      ELSE initcap(e.key)
    END AS "name"
  FROM "Package" p, jsonb_each_text(p."equipment") e
) x;

-- 2) Link: aggrega per (package, tipo) con SUM per gestire due chiavi che collassano sullo stesso nome.
INSERT INTO "PackageEquipment" ("establishmentId", "packageId", "equipmentTypeId", "quantity")
SELECT p."establishmentId", p.id, t.id, SUM((e.value)::int)
FROM "Package" p
CROSS JOIN LATERAL jsonb_each_text(p."equipment") e
JOIN "EquipmentType" t
  ON t."establishmentId" = p."establishmentId"
 AND t."name" = CASE e.key
      WHEN 'sunbeds'    THEN 'Lettino'
      WHEN 'deckchairs' THEN 'Sdraio'
      WHEN 'umbrellas'  THEN 'Ombrellone'
      ELSE initcap(e.key)
    END
WHERE (e.value)::int > 0
GROUP BY p."establishmentId", p.id, t.id;

ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;

-- Rimuovi la colonna JSONB ormai migrata.
ALTER TABLE "Package" DROP COLUMN "equipment";

-- RLS tenant_isolation sulle nuove tabelle (Prisma non la genera). Dopo il data-copy: i nuovi
-- INSERT sopra sono avvenuti senza FORCE, ora abilitiamo la policy per il runtime.
ALTER TABLE "EquipmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentType"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "PackageEquipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackageEquipment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PackageEquipment"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 4: Applica la migrazione a dev e verifica**

```bash
set -a; . ../../.env; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate dev
corepack pnpm --filter @coralyn/api exec prisma migrate status
```
Expected: "Database schema is up to date!". Se P1002 (advisory lock) su deploy: termina l'holder via `pg_terminate_backend` (vedi handoff §5).

- [ ] **Step 5: Aggiorna `seed.ts`**

Sostituisci il blocco `tx.package.upsert(...)` (righe ~124-128) con creazione pacchetto senza equipment + catalogo + link idempotenti:
```ts
    const PKG_STANDARD = u(6, 1);
    await tx.package.upsert({
      where: { id: PKG_STANDARD },
      update: { name: 'Standard' },
      create: { id: PKG_STANDARD, establishmentId: EID, name: 'Standard' },
    });

    const EQ_LETTINO = u(10, 1);
    const EQ_SDRAIO = u(10, 2);
    const equipmentTypes = [
      { id: EQ_LETTINO, name: 'Lettino' },
      { id: EQ_SDRAIO, name: 'Sdraio' },
    ];
    for (const x of equipmentTypes) {
      await tx.equipmentType.upsert({
        where: { id: x.id },
        update: { name: x.name },
        create: { id: x.id, establishmentId: EID, name: x.name },
      });
    }
    const links = [
      { equipmentTypeId: EQ_LETTINO, quantity: 2 },
      { equipmentTypeId: EQ_SDRAIO, quantity: 1 },
    ];
    for (const l of links) {
      await tx.packageEquipment.upsert({
        where: { packageId_equipmentTypeId: { packageId: PKG_STANDARD, equipmentTypeId: l.equipmentTypeId } },
        update: { quantity: l.quantity },
        create: { establishmentId: EID, packageId: PKG_STANDARD, equipmentTypeId: l.equipmentTypeId, quantity: l.quantity },
      });
    }
```

- [ ] **Step 6: Aggiorna `seed-pricing.ts` (helper e2e)**

Sostituisci la create del pacchetto (righe ~16-19) con:
```ts
    const pkg = await tx.package.create({
      data: { establishmentId, name: 'Standard' },
    });
    const lettino = await tx.equipmentType.create({
      data: { establishmentId, name: 'Lettino' },
    });
    await tx.packageEquipment.create({
      data: { establishmentId, packageId: pkg.id, equipmentTypeId: lettino.id, quantity: 2 },
    });
```
In `cleanPricingTenant` aggiungi le delete dei nuovi (prima di `package`, per le FK):
```ts
    await tx.rate.deleteMany({});
    await tx.pricing.deleteMany({});
    await tx.season.deleteMany({});
    await tx.packageEquipment.deleteMany({});
    await tx.package.deleteMany({});
    await tx.equipmentType.deleteMany({});
```

- [ ] **Step 7: Applica la migrazione al DB di test**

Carica il `DATABASE_URL` di test dal `.env.test` root senza stamparlo:
```bash
set -a; . ../../.env.test; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma migrate status
```
Expected: "Database schema is up to date!" su `coralyn_test`.

- [ ] **Step 8: Rigenera il client e typecheck**

```bash
corepack pnpm --filter @coralyn/api exec prisma generate
corepack pnpm --filter @coralyn/api build
```
Expected: build OK (il client ha `equipmentType`/`packageEquipment`; `Package.equipment` non esiste più → eventuali usi residui falliscono e vengono corretti nei Task successivi). Se la build rompe SOLO su `catalog.service.ts`/`package.projection.ts`/DTO per la colonna rimossa, è atteso: quei file si sistemano nei Task 2-3. Per isolare il Task 1, verifica invece la migrazione con `prisma migrate status` verde su dev+test e uno spot-check dei dati (Step 9).

- [ ] **Step 9: Verifica dati post-migrazione (dev)**

```bash
set -a; . ../../.env; set +a
corepack pnpm --filter @coralyn/api exec prisma db execute --stdin <<'SQL'
SET app.current_tenant = '00000000-0000-0000-0000-000000000001';
SELECT p.name, t.name, pe.quantity FROM "PackageEquipment" pe
  JOIN "Package" p ON p.id = pe."packageId"
  JOIN "EquipmentType" t ON t.id = pe."equipmentTypeId" ORDER BY t.name;
SQL
```
Expected: righe `Standard | Lettino | 2` e `Standard | Sdraio | 1` (dai dati seed pre-esistenti convertiti). Nessuna colonna `equipment` su `Package`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma packages/contracts # (contracts NON tocca qui: solo prisma+seed)
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts apps/api/test/helpers/seed-pricing.ts
git commit -m "feat(catalog): schema EquipmentType + PackageEquipment, migrazione dati JSONB, seed"
```

---

## Task 2: Contratti + EquipmentType backend (CRUD, archiviazione, projection)

**Files:**
- Modify: `packages/contracts/src/index.ts:118-124,294-301`
- Create: `apps/api/src/catalog/equipment-type.projection.ts` + `equipment-type.projection.spec.ts`
- Create: `apps/api/src/catalog/dto/create-equipment-type.dto.ts`, `dto/update-equipment-type.dto.ts`
- Create: `apps/api/src/catalog/equipment-types.controller.ts`
- Modify: `apps/api/src/catalog/catalog.service.ts` (metodi EquipmentType), `catalog.module.ts:11-12`
- Create: `apps/api/test/equipment-types.e2e-spec.ts`

**Interfaces:**
- Consumes: `prisma.equipmentType`, `prisma.packageEquipment` (Task 1).
- Produces: tipi contratto `EquipmentTypeDTO`/`Create...`/`Update...` e `PackageEquipmentDTO` (usati dal Task 3 e dal FE); metodi service `listEquipmentTypes(includeArchived)`, `createEquipmentType`, `updateEquipmentType`, `archiveEquipmentType`, `restoreEquipmentType`, `deleteEquipmentType`; `toEquipmentTypeDTO`.

- [ ] **Step 1: Contratti — aggiungi i nuovi tipi**

In `packages/contracts/src/index.ts`, vicino a `PackageDTO`, aggiungi:
```ts
/** Tipo di dotazione a catalogo (tenant-scoped). `archived` presente solo se archiviato. */
export interface EquipmentTypeDTO {
  id: string;
  name: string;
  archived?: true;
}

/** Input creazione tipo di dotazione. */
export interface CreateEquipmentTypeInput {
  name: string;
}

/** Input modifica tipo di dotazione. */
export interface UpdateEquipmentTypeInput {
  name?: string;
}

/** Voce di dotazione di un pacchetto (nome risolto dal catalogo). */
export interface PackageEquipmentDTO {
  equipmentTypeId: string;
  name: string;
  quantity: number;
}
```
Cambia `PackageDTO.equipment` (riga 122) in:
```ts
  equipment: PackageEquipmentDTO[]; // voci risolte dal catalogo, ordinate per nome
```
Cambia `CreatePackageInput.equipment` (riga 297) in:
```ts
  equipment: { equipmentTypeId: string; quantity: number }[];
```
(`UpdatePackageInput = Partial<CreatePackageInput>` resta invariato.) Build contracts:
```bash
corepack pnpm --filter @coralyn/contracts build
```

- [ ] **Step 2: Scrivi il test della projection (fallisce)**

Create `apps/api/src/catalog/equipment-type.projection.spec.ts`:
```ts
import type { EquipmentType } from '@prisma/client';
import { toEquipmentTypeDTO } from './equipment-type.projection';

const row = (over: Partial<EquipmentType> = {}): EquipmentType =>
  ({ id: 'eq-1', establishmentId: 'e-1', name: 'Lettino', archivedAt: null, ...over }) as EquipmentType;

describe('toEquipmentTypeDTO', () => {
  it('proietta id/name senza establishmentId', () => {
    expect(toEquipmentTypeDTO(row())).toEqual({ id: 'eq-1', name: 'Lettino' });
  });
  it('un tipo attivo non espone archived', () => {
    expect('archived' in toEquipmentTypeDTO(row())).toBe(false);
  });
  it('un tipo archiviato espone archived: true', () => {
    expect(toEquipmentTypeDTO(row({ archivedAt: new Date() })).archived).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui il test — deve fallire**

```bash
corepack pnpm --filter @coralyn/api test -- equipment-type.projection
```
Expected: FAIL ("Cannot find module './equipment-type.projection'").

- [ ] **Step 4: Implementa la projection**

Create `apps/api/src/catalog/equipment-type.projection.ts`:
```ts
import type { EquipmentType } from '@prisma/client';
import type { EquipmentTypeDTO } from '@coralyn/contracts';

/** Proietta una riga EquipmentType nel DTO condiviso. `archived` omesso quando attivo. */
export function toEquipmentTypeDTO(t: EquipmentType): EquipmentTypeDTO {
  return {
    id: t.id,
    name: t.name,
    ...(t.archivedAt != null ? { archived: true } : {}),
  };
}
```

- [ ] **Step 5: Esegui il test — deve passare**

```bash
corepack pnpm --filter @coralyn/api test -- equipment-type.projection
```
Expected: PASS (3 test).

- [ ] **Step 6: DTO create/update**

Create `apps/api/src/catalog/dto/create-equipment-type.dto.ts`:
```ts
import { IsNotEmpty, IsString } from 'class-validator';
import type { CreateEquipmentTypeInput } from '@coralyn/contracts';

export class CreateEquipmentTypeDto implements CreateEquipmentTypeInput {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
```
Create `apps/api/src/catalog/dto/update-equipment-type.dto.ts`:
```ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { UpdateEquipmentTypeInput } from '@coralyn/contracts';

export class UpdateEquipmentTypeDto implements UpdateEquipmentTypeInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
}
```

- [ ] **Step 7: Metodi service EquipmentType**

In `apps/api/src/catalog/catalog.service.ts` aggiungi (import `toEquipmentTypeDTO`, e i tipi contratto). Nome normalizzato = `trim`; unicità case-insensitive lato service; `@@unique` DB come rete. Aggiungi:
```ts
  private normalizeName(name: string): string {
    return name.trim();
  }

  async listEquipmentTypes(includeArchived = false): Promise<EquipmentTypeDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.equipmentType.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { name: 'asc' },
      }),
    );
    return rows.map(toEquipmentTypeDTO);
  }

  async createEquipmentType(input: CreateEquipmentTypeInput): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const name = this.normalizeName(input.name);
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.equipmentType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (clash) throw new ConflictException('Esiste già un tipo di dotazione con questo nome.');
      return tx.equipmentType.create({ data: { establishmentId: tenantId, name } });
    });
    return toEquipmentTypeDTO(t);
  }

  async updateEquipmentType(id: string, input: UpdateEquipmentTypeInput): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (input.name === undefined) return existing;
      const name = this.normalizeName(input.name);
      const clash = await tx.equipmentType.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
      });
      if (clash) throw new ConflictException('Esiste già un tipo di dotazione con questo nome.');
      return tx.equipmentType.update({ where: { id }, data: { name } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async archiveEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt != null) return existing;
      return tx.equipmentType.update({ where: { id }, data: { archivedAt: new Date() } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async restoreEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) return existing;
      return tx.equipmentType.update({ where: { id }, data: { archivedAt: null } });
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }

  async deleteEquipmentType(id: string): Promise<EquipmentTypeDTO> {
    const tenantId = this.tenant.require();
    const t = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.equipmentType.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        throw new ConflictException('Archivia il tipo prima di eliminarlo definitivamente.');
      }
      const refs = await tx.packageEquipment.count({ where: { equipmentTypeId: id } });
      if (refs > 0) {
        throw new ConflictException('Archivia il tipo e rimuovilo dai pacchetti prima di eliminarlo definitivamente.');
      }
      await tx.equipmentType.delete({ where: { id } });
      return existing;
    });
    if (!t) throw new NotFoundException('Tipo di dotazione non trovato');
    return toEquipmentTypeDTO(t);
  }
```
Aggiorna l'import dei tipi contratto in cima al file:
```ts
import type {
  BookingType, CreatePackageInput, PackageDTO, RateDTO, UpdatePackageInput,
  CreateEquipmentTypeInput, EquipmentTypeDTO, UpdateEquipmentTypeInput,
} from '@coralyn/contracts';
```

- [ ] **Step 8: Controller EquipmentTypes (mirror packages)**

Create `apps/api/src/catalog/equipment-types.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { EquipmentTypeDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreateEquipmentTypeDto } from './dto/create-equipment-type.dto';
import { UpdateEquipmentTypeDto } from './dto/update-equipment-type.dto';

@Controller('equipment-types')
export class EquipmentTypesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<EquipmentTypeDTO[]> {
    return this.catalog.listEquipmentTypes(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: CreateEquipmentTypeDto): Promise<EquipmentTypeDTO> {
    return this.catalog.createEquipmentType(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateEquipmentTypeDto): Promise<EquipmentTypeDTO> {
    return this.catalog.updateEquipmentType(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.archiveEquipmentType(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.restoreEquipmentType(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<EquipmentTypeDTO> {
    return this.catalog.deleteEquipmentType(id);
  }
}
```
Registra in `catalog.module.ts`: import `EquipmentTypesController` e aggiungilo all'array `controllers`.

- [ ] **Step 9: e2e EquipmentTypes (mirror packages.e2e-spec)**

Create `apps/api/test/equipment-types.e2e-spec.ts` (stessa impalcatura di `packages.e2e-spec.ts`: due tenant, `beforeAll`/`afterAll` con cleanup). Copre:
```ts
// (impalcatura identica a packages.e2e-spec: app, prisma, s1/s2, token1/token2, bearer)
// afterAll: per ogni tenant, in ordine FK:
//   tx.packageEquipment.deleteMany({}); tx.package.deleteMany({}); tx.equipmentType.deleteMany({});
```
Test da includere:
```ts
it('POST crea un tipo e lo elenca solo al proprietario', async () => {
  const res = await request(app.getHttpServer())
    .post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Cassaforte' }).expect(201);
  expect(res.body).toMatchObject({ name: 'Cassaforte' });
  const listS2 = await request(app.getHttpServer()).get('/api/equipment-types').set(...bearer(token2)).expect(200);
  expect(listS2.body.some((t: { id: string }) => t.id === res.body.id)).toBe(false);
});

it('POST rifiuta un nome duplicato (case-insensitive) con 409', async () => {
  await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino' }).expect(201);
  await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: '  lettino ' }).expect(409);
});

it('PATCH rinomina; 404 ad altro tenant', async () => {
  const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Ombrellone' }).expect(201);
  const p = await request(app.getHttpServer()).patch(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).send({ name: 'Ombrellone XL' }).expect(200);
  expect(p.body).toMatchObject({ id: c.body.id, name: 'Ombrellone XL' });
  await request(app.getHttpServer()).patch(`/api/equipment-types/${c.body.id}`).set(...bearer(token2)).send({ name: 'X' }).expect(404);
});

it('archive nasconde dal default, includeArchived lo mostra, restore lo riporta', async () => {
  const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Frigo' }).expect(201);
  const a = await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token1)).expect(201);
  expect(a.body).toMatchObject({ id: c.body.id, archived: true });
  const def = await request(app.getHttpServer()).get('/api/equipment-types').set(...bearer(token1)).expect(200);
  expect(def.body.some((t: { id: string }) => t.id === c.body.id)).toBe(false);
  const all = await request(app.getHttpServer()).get('/api/equipment-types?includeArchived=true').set(...bearer(token1)).expect(200);
  expect(all.body.find((t: { id: string }) => t.id === c.body.id)).toMatchObject({ archived: true });
  const r = await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/restore`).set(...bearer(token1)).expect(201);
  expect(r.body.archived).toBeUndefined();
});

it('DELETE 200 se archiviato e senza riferimenti; 404 se ripetuto', async () => {
  const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Effimero' }).expect(201);
  await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token1)).expect(201);
  await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(200);
  await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(404);
});

it('DELETE di un tipo NON archiviato → 409', async () => {
  const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Attivo' }).expect(201);
  await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(409);
});

it('archive/restore/delete isolati per tenant (404 cross-tenant)', async () => {
  const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Isolato' }).expect(201);
  await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token2)).expect(404);
  await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token2)).expect(404);
});
```
(Il DELETE 409 "referenziato" è coperto nel Task 3, dove esiste la composizione che crea un link.)

- [ ] **Step 10: Esegui unit + e2e**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e -- equipment-types
```
Expected: unit verdi (94 + 3 projection = 97); e2e equipment-types tutti verdi.

- [ ] **Step 11: Commit**

```bash
git add packages/contracts apps/api/src/catalog apps/api/test/equipment-types.e2e-spec.ts
git commit -m "feat(catalog): CRUD EquipmentType (catalogo tenant-scoped, archiviazione, unicità nome)"
```

---

## Task 3: Composizione pacchetto backend (set-assoluto, validazione, projection)

**Files:**
- Modify: `apps/api/src/catalog/dto/create-package.dto.ts`, `dto/update-package.dto.ts`
- Modify: `apps/api/src/catalog/package.projection.ts` + `package.projection.spec.ts`
- Modify: `apps/api/src/catalog/catalog.service.ts` (`listPackages`, `createPackage`, `updatePackage`)
- Modify: `apps/api/test/packages.e2e-spec.ts`

**Interfaces:**
- Consumes: `EquipmentTypeDTO`/`PackageEquipmentDTO` (Task 2), `prisma.packageEquipment`.
- Produces: `toPackageDTO(pkg, links)` che risolve nomi + ordina; create/update con validazione 422 e scrittura set-assoluto.

- [ ] **Step 1: DTO composizione (array validato)**

Create `apps/api/src/catalog/dto/package-equipment-item.dto.ts`:
```ts
import { IsInt, IsUUID, Min } from 'class-validator';

export class PackageEquipmentItemDto {
  @IsUUID()
  equipmentTypeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
```
`create-package.dto.ts`:
```ts
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreatePackageInput } from '@coralyn/contracts';
import { PackageEquipmentItemDto } from './package-equipment-item.dto';

export class CreatePackageDto implements CreatePackageInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageEquipmentItemDto)
  equipment!: PackageEquipmentItemDto[];
}
```
`update-package.dto.ts`:
```ts
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { UpdatePackageInput } from '@coralyn/contracts';
import { PackageEquipmentItemDto } from './package-equipment-item.dto';

export class UpdatePackageDto implements UpdatePackageInput {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackageEquipmentItemDto)
  equipment?: PackageEquipmentItemDto[];
}
```

- [ ] **Step 2: Riscrivi il test della projection package (fallisce)**

Sostituisci `apps/api/src/catalog/package.projection.spec.ts`:
```ts
import type { Package, PackageEquipment, EquipmentType } from '@prisma/client';
import { toPackageDTO, type PackageWithLinks } from './package.projection';

const pkg = (over: Partial<Package> = {}): Package =>
  ({ id: 'pkg-1', establishmentId: 'e-1', name: 'Standard', archivedAt: null, ...over }) as Package;

const link = (typeName: string, quantity: number, typeId: string): PackageEquipment & { equipmentType: EquipmentType } =>
  ({
    establishmentId: 'e-1', packageId: 'pkg-1', equipmentTypeId: typeId, quantity,
    equipmentType: { id: typeId, establishmentId: 'e-1', name: typeName, archivedAt: null },
  }) as PackageEquipment & { equipmentType: EquipmentType };

const row = (links: Array<PackageEquipment & { equipmentType: EquipmentType }>, over: Partial<Package> = {}): PackageWithLinks =>
  ({ ...pkg(over), packageLinks: links }) as PackageWithLinks;

describe('toPackageDTO', () => {
  it('proietta equipment come array risolto, ordinato per nome', () => {
    const dto = toPackageDTO(row([link('Sdraio', 1, 't-2'), link('Lettino', 2, 't-1')]));
    expect(dto.equipment).toEqual([
      { equipmentTypeId: 't-1', name: 'Lettino', quantity: 2 },
      { equipmentTypeId: 't-2', name: 'Sdraio', quantity: 1 },
    ]);
  });
  it('non espone establishmentId', () => {
    expect((toPackageDTO(row([])) as unknown as Record<string, unknown>).establishmentId).toBeUndefined();
  });
  it('un pacchetto attivo NON espone archived', () => {
    expect('archived' in toPackageDTO(row([]))).toBe(false);
  });
  it('un pacchetto archiviato espone archived: true', () => {
    expect(toPackageDTO(row([], { archivedAt: new Date() })).archived).toBe(true);
  });
});
```

- [ ] **Step 3: Esegui — deve fallire**

```bash
corepack pnpm --filter @coralyn/api test -- package.projection
```
Expected: FAIL (firma cambiata / `PackageWithLinks` inesistente).

- [ ] **Step 4: Riscrivi la projection**

`apps/api/src/catalog/package.projection.ts`:
```ts
import type { Package, PackageEquipment, EquipmentType } from '@prisma/client';
import type { PackageDTO } from '@coralyn/contracts';

export type PackageWithLinks = Package & {
  packageLinks: Array<PackageEquipment & { equipmentType: EquipmentType }>;
};

/** Proietta una riga Package (+ link) nel DTO. Equipment risolto dal catalogo, ordinato per nome. */
export function toPackageDTO(p: PackageWithLinks): PackageDTO {
  const equipment = [...p.packageLinks]
    .map((l) => ({ equipmentTypeId: l.equipmentTypeId, name: l.equipmentType.name, quantity: l.quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: p.id,
    name: p.name,
    equipment,
    ...(p.archivedAt != null ? { archived: true } : {}),
  };
}
```

- [ ] **Step 5: Aggiorna il service — list/create/update con composizione**

In `catalog.service.ts`, sostituisci `listPackages`, `createPackage`, `updatePackage`. Aggiungi un helper privato di validazione+scrittura set-assoluto. `PACKAGE_INCLUDE` per caricare i link con il tipo:
```ts
  private static readonly PACKAGE_INCLUDE = {
    packageLinks: { include: { equipmentType: true } },
  } as const;

  /** Valida le voci (422) e scrive i link in set-assoluto (delete-all + createMany) dentro `tx`. */
  private async writePackageEquipment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    packageId: string,
    items: { equipmentTypeId: string; quantity: number }[],
  ): Promise<void> {
    const ids = items.map((i) => i.equipmentTypeId);
    if (new Set(ids).size !== ids.length) {
      throw new UnprocessableEntityException('Voce di dotazione duplicata nella composizione.');
    }
    if (ids.length > 0) {
      const found = await tx.equipmentType.findMany({ where: { id: { in: ids }, archivedAt: null } });
      if (found.length !== ids.length) {
        throw new UnprocessableEntityException('Tipo di dotazione non valido o archiviato.');
      }
    }
    await tx.packageEquipment.deleteMany({ where: { packageId } });
    if (items.length > 0) {
      await tx.packageEquipment.createMany({
        data: items.map((i) => ({ establishmentId: tenantId, packageId, equipmentTypeId: i.equipmentTypeId, quantity: i.quantity })),
      });
    }
  }

  async listPackages(includeArchived = false): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        include: CatalogService.PACKAGE_INCLUDE,
      }),
    );
    return rows.map(toPackageDTO);
  }

  async createPackage(input: CreatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const created = await tx.package.create({ data: { establishmentId: tenantId, name: input.name } });
      await this.writePackageEquipment(tx, tenantId, created.id, input.equipment);
      return tx.package.findFirstOrThrow({ where: { id: created.id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    return toPackageDTO(p);
  }

  async updatePackage(id: string, input: UpdatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (input.name !== undefined) {
        await tx.package.update({ where: { id }, data: { name: input.name } });
      }
      if (input.equipment !== undefined) {
        await this.writePackageEquipment(tx, tenantId, id, input.equipment);
      }
      return tx.package.findFirstOrThrow({ where: { id }, include: CatalogService.PACKAGE_INCLUDE });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }
```
Aggiungi `UnprocessableEntityException` all'import `@nestjs/common`. Le altre firme (`archivePackage`/`restorePackage`/`deletePackage`) devono ora ritornare il DTO con i link: aggiorna le loro `return toPackageDTO(...)` caricando l'`include` (in ognuna, sostituisci il ritorno con un `findFirstOrThrow({ where: { id }, include: CatalogService.PACKAGE_INCLUDE })` dopo l'update, oppure aggiungi `include` all'`update`). Per `deletePackage`, la delete ora cascata i link (onDelete Cascade): il ritorno usa lo snapshot `existing` caricato con `include`.

- [ ] **Step 6: Esegui unit — projection + service**

```bash
corepack pnpm --filter @coralyn/api test -- package.projection
corepack pnpm --filter @coralyn/api test
```
Expected: projection PASS; suite unit verde (nessuna regressione).

- [ ] **Step 7: Aggiorna e2e packages (composizione + no-clobber)**

In `apps/api/test/packages.e2e-spec.ts`: aggiorna i `send({ ..., equipment: {...} })` esistenti al nuovo array e i `toMatchObject({ equipment: {...} })`. Crea un tipo prima e usane l'id. Aggiungi il test del clobber chiuso e la validazione 422. Esempio (POST base, riscrittura):
```ts
it('POST crea un pacchetto con voci di dotazione e le risolve nella risposta', async () => {
  const lettino = await request(app.getHttpServer())
    .post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino' }).expect(201);
  const res = await request(app.getHttpServer())
    .post('/api/packages').set(...bearer(token1))
    .send({ name: 'Comfort', equipment: [{ equipmentTypeId: lettino.body.id, quantity: 2 }] }).expect(201);
  expect(res.body.equipment).toEqual([{ equipmentTypeId: lettino.body.id, name: 'Lettino', quantity: 2 }]);
});

it('PATCH sostituisce il set di voci senza clobber (bug originario chiuso)', async () => {
  const lettino = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino2' }).expect(201);
  const sdraio = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Sdraio2' }).expect(201);
  const pkg = await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
    .send({ name: 'Multi', equipment: [{ equipmentTypeId: lettino.body.id, quantity: 2 }, { equipmentTypeId: sdraio.body.id, quantity: 1 }] }).expect(201);
  // PATCH col set completo aggiornato: entrambe le voci restano (nessuna sparisce).
  const patched = await request(app.getHttpServer()).patch(`/api/packages/${pkg.body.id}`).set(...bearer(token1))
    .send({ equipment: [{ equipmentTypeId: lettino.body.id, quantity: 4 }, { equipmentTypeId: sdraio.body.id, quantity: 1 }] }).expect(200);
  expect(patched.body.equipment).toHaveLength(2);
  expect(patched.body.equipment.find((e: { name: string }) => e.name === 'Lettino2').quantity).toBe(4);
});

it('POST 422 se il tipo non esiste', async () => {
  await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
    .send({ name: 'X', equipment: [{ equipmentTypeId: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }] }).expect(422);
});

it('POST 400 se quantity < 1', async () => {
  const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'QtaZero' }).expect(201);
  await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
    .send({ name: 'X', equipment: [{ equipmentTypeId: t.body.id, quantity: 0 }] }).expect(400);
});

it('POST 422 se il tipo è archiviato', async () => {
  const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Archiviato422' }).expect(201);
  await request(app.getHttpServer()).post(`/api/equipment-types/${t.body.id}/archive`).set(...bearer(token1)).expect(201);
  await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
    .send({ name: 'X', equipment: [{ equipmentTypeId: t.body.id, quantity: 1 }] }).expect(422);
});

it('DELETE di un tipo referenziato da un pacchetto → 409', async () => {
  const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Referenziato' }).expect(201);
  await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
    .send({ name: 'UsaTipo', equipment: [{ equipmentTypeId: t.body.id, quantity: 1 }] }).expect(201);
  await request(app.getHttpServer()).post(`/api/equipment-types/${t.body.id}/archive`).set(...bearer(token1)).expect(201);
  await request(app.getHttpServer()).delete(`/api/equipment-types/${t.body.id}`).set(...bearer(token1)).expect(409);
});
```
Aggiorna il test "PATCH aggiorna nome/equipment" e "POST crea..." esistenti alla nuova shape (i `send({ equipment: { sunbeds } })` → array; il `send({ equipment: {} })` → `equipment: []`). L'`afterAll` deve pulire `packageEquipment` prima di `package` e poi `equipmentType`.

- [ ] **Step 8: Esegui e2e completi**

```bash
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: verdi, count ≥ 130 (nuovi test additivi). "worker failed to exit" = rumore noto.

- [ ] **Step 9: Commit**

```bash
git add packages apps/api/src/catalog apps/api/test/packages.e2e-spec.ts
git commit -m "feat(catalog): composizione pacchetto normalizzata (set-assoluto, 422 validazione, no clobber)"
```

---

## Task 4: FE — catalogo tipi di dotazione

**Files:**
- Create: `apps/web-staff/src/features/pricing/useEquipmentTypes.ts`
- Modify: `apps/web-staff/src/lib/queryKeys.ts:12`
- Modify: `apps/web-staff/src/mocks/server.ts` (handler equipment-types + shape packages equipment array)
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (sezione catalogo)
- Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts`
- Modify: `apps/web-staff/src/lib/useEntityLabels.spec.ts`, `apps/web-staff/src/features/bookings/BookingsView.spec.ts` (shape mock)

**Interfaces:**
- Consumes: `EquipmentTypeDTO`, endpoint `/equipment-types` (Task 2/3).
- Produces: `useEquipmentTypes` (attivi), `useAllEquipmentTypes` (con archiviati), `useCreate/Update/Archive/Restore/DeleteEquipmentType`; handler MSW `/api/equipment-types`.

- [ ] **Step 1: queryKeys**

In `apps/web-staff/src/lib/queryKeys.ts` aggiungi:
```ts
  equipmentTypes: (tenantId: string) => ['equipment-types', tenantId] as const,
  allEquipmentTypes: (tenantId: string) => ['equipment-types', tenantId, 'all'] as const,
```

- [ ] **Step 2: composable (mirror usePackages)**

Create `apps/web-staff/src/features/pricing/useEquipmentTypes.ts`:
```ts
import type { CreateEquipmentTypeInput, EquipmentTypeDTO, UpdateEquipmentTypeInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEquipmentTypes() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.equipmentTypes(session.establishmentId),
    queryFn: () => apiFetch<EquipmentTypeDTO[]>('/equipment-types'),
  });
}

export function useAllEquipmentTypes() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allEquipmentTypes(session.establishmentId),
    queryFn: () => apiFetch<EquipmentTypeDTO[]>('/equipment-types?includeArchived=true'),
  });
}

const invalidate = (session: ReturnType<typeof useSessionStore>) => [
  queryKeys.equipmentTypes(session.establishmentId),
  queryKeys.allEquipmentTypes(session.establishmentId),
];

export function useCreateEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateEquipmentTypeInput) =>
      apiFetch<EquipmentTypeDTO>('/equipment-types', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidate(session),
  });
}

export function useUpdateEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateEquipmentTypeInput }) =>
      apiFetch<EquipmentTypeDTO>(`/equipment-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => invalidate(session),
  });
}

export function useArchiveEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}/archive`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useRestoreEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}/restore`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useDeleteEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}`, { method: 'DELETE' }),
    invalidates: () => invalidate(session),
  });
}
```
(Verifica la firma esatta di `mutationResource`/`queryResource` leggendo `apps/web-staff/src/lib/useQueryResource.ts` e `usePackages.ts`: usa lo stesso identico stile.)

- [ ] **Step 3: MSW — shape array + handler equipment-types**

In `apps/web-staff/src/mocks/server.ts`:
- Cambia il seed `packages` alla nuova shape:
```ts
let packages: PackageDTO[] = [{ id: 'pkg-1', name: 'Standard', equipment: [{ equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 }] }];
```
e identico in `resetPricingSeed`.
- Aggiungi stato + handler equipment-types (mirror packages), prima di `// Rates`:
```ts
let equipmentTypes: EquipmentTypeDTO[] = [{ id: 'eq-1', name: 'Lettino' }, { id: 'eq-2', name: 'Sdraio' }];
// in resetPricingSeed(): equipmentTypes = [{ id: 'eq-1', name: 'Lettino' }, { id: 'eq-2', name: 'Sdraio' }];
```
```ts
  http.get('/api/equipment-types', ({ request }) => {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    return HttpResponse.json(includeArchived ? equipmentTypes : equipmentTypes.filter((t) => !t.archived));
  }),
  http.post('/api/equipment-types', async ({ request }) => {
    const b = (await request.json()) as { name: string };
    const created: EquipmentTypeDTO = { id: `eq-${equipmentTypes.length + 1}`, name: b.name };
    equipmentTypes.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/equipment-types/:id', async ({ params, request }) => {
    const patch = (await request.json()) as { name?: string };
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    equipmentTypes[i] = { ...equipmentTypes[i], ...patch };
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.post('/api/equipment-types/:id/archive', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    equipmentTypes[i] = { ...equipmentTypes[i], archived: true };
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.post('/api/equipment-types/:id/restore', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const { archived: _d, ...rest } = equipmentTypes[i];
    equipmentTypes[i] = rest;
    return HttpResponse.json(equipmentTypes[i]);
  }),
  http.delete('/api/equipment-types/:id', ({ params }) => {
    const i = equipmentTypes.findIndex((t) => t.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const [removed] = equipmentTypes.splice(i, 1);
    return HttpResponse.json(removed);
  }),
```
Aggiorna l'import contracts in cima al file per includere `EquipmentTypeDTO`. Aggiorna i mock package in `useEntityLabels.spec.ts` (righe 47/60) e `BookingsView.spec.ts` (riga 49) alla shape `equipment: [...]` (o `equipment: []`).

- [ ] **Step 4: Test FE catalogo (fallisce)**

In `PricingView.spec.ts` aggiungi un blocco:
```ts
describe('catalogo tipi di dotazione', () => {
  it('elenca i tipi e ne crea uno nuovo dal catalogo', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Lettino'); // tipo dal mock
    await w.get('[data-test="new-equipment-type"]').trigger('click');
    await flushPromises();
    const el = document.querySelector('[data-test="form-equipment-type"] input[name="name"]') as HTMLInputElement;
    el.value = 'Cassaforte';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-equipment-type"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Cassaforte');
  });

  it('archivia un tipo e lo mostra nella sezione archiviati', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="archive-eqt-eq-2"]').trigger('click');
    await settle();
    expect(w.get('[data-test="toggle-archived-eqt"]').text()).toContain('Archiviati');
  });
});
```

- [ ] **Step 5: Esegui — deve fallire**

```bash
corepack pnpm --filter web-staff test -- PricingView
```
Expected: FAIL (nessun `new-equipment-type`).

- [ ] **Step 6: Implementa la sezione catalogo in `PricingView.vue`**

Importa i composable; aggiungi stato `activeEquipmentTypes`/`archivedEquipmentTypes`, un modale crea/rinomina (`data-test="form-equipment-type"`, input `name`), un pulsante `data-test="new-equipment-type"`, la griglia con azioni per riga (`edit-eqt-<id>`, `archive-eqt-<id>`), e la sezione "Archiviati (N)" a scomparsa (`toggle-archived-eqt`, `restore-eqt-<id>`, `del-eqt-<id>` con `ConfirmDialog`). Rispecchia la UX già presente per i pacchetti archiviati (righe 322-369). Estendi il tipo `PendingDelete` con `{ kind: 'equipmentType'; id: string; name: string }` e gestiscilo in `confirmCopy`/`onConfirmDelete` (chiama `deleteEquipmentType.mutate`). Colloca la sezione catalogo sopra la card pacchetti.

- [ ] **Step 7: Esegui — deve passare**

```bash
corepack pnpm --filter web-staff test -- PricingView
```
Expected: i nuovi test PASS; i pre-esistenti restano verdi.

- [ ] **Step 8: Suite completa + typecheck**

```bash
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
```
Expected: verde (≥148, additivo); typecheck pulito.

- [ ] **Step 9: Commit**

```bash
git add apps/web-staff/src/features/pricing apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/mocks/server.ts apps/web-staff/src/lib/useEntityLabels.spec.ts apps/web-staff/src/features/bookings/BookingsView.spec.ts
git commit -m "feat(web): sezione catalogo tipi di dotazione (CRUD + archiviazione)"
```

---

## Task 5: FE — compositore pacchetto multi-riga + etichetta

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (modale pacchetto → compositore; `equipmentLabel`; rimuovi `EQUIP_IT`)
- Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts`

**Interfaces:**
- Consumes: `useEquipmentTypes`/`useCreateEquipmentType` (Task 4), `PackageDTO.equipment` array.
- Produces: modale pacchetto che invia `equipment: { equipmentTypeId, quantity }[]`.

- [ ] **Step 1: Test compositore (fallisce)**

In `PricingView.spec.ts`, aggiorna il test "crea un pacchetto" e aggiungine di nuovi:
```ts
it('compone un pacchetto con più voci e le mostra come "N × Nome"', async () => {
  const w = mountApp(PricingView, { attachTo: document.body });
  await settle();
  await w.get('[data-test="new-package"]').trigger('click');
  await flushPromises();
  const nameEl = document.querySelector('[data-test="form-package"] input[name="name"]') as HTMLInputElement;
  nameEl.value = 'Prestige'; nameEl.dispatchEvent(new Event('input', { bubbles: true }));
  // aggiungi una riga voce e scegli 'Lettino' (eq-1) qty 3
  await w.get('[data-test="add-equipment-row"]').trigger('click');
  await flushPromises();
  const typeSel = document.querySelector('[data-test="equip-row-0"] select') as HTMLSelectElement;
  typeSel.value = 'eq-1'; typeSel.dispatchEvent(new Event('change', { bubbles: true }));
  const qtyEl = document.querySelector('[data-test="equip-row-0"] input[name="quantity"]') as HTMLInputElement;
  qtyEl.value = '3'; qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
  (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  expect(w.text()).toContain('Prestige');
  expect(w.text()).toContain('3 × Lettino');
});

it('modificando un pacchetto multi-voce e risalvando, nessuna voce sparisce (no clobber)', async () => {
  server.use(
    http.get('/api/packages', () => HttpResponse.json([
      { id: 'pkg-1', name: 'Standard', equipment: [
        { equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 },
        { equipmentTypeId: 'eq-2', name: 'Sdraio', quantity: 1 },
      ] },
    ])),
  );
  const w = mountApp(PricingView, { attachTo: document.body });
  await settle();
  await w.get('[data-test="edit-pkg-pkg-1"]').trigger('click');
  await flushPromises();
  // due righe idratate
  expect(document.querySelectorAll('[data-test^="equip-row-"]').length).toBe(2);
  (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  expect(w.text()).toContain('2 × Lettino');
  expect(w.text()).toContain('1 × Sdraio');
});
```
Aggiorna anche il test "modifica il nome di un pacchetto" per la nuova shape (l'idratazione ora legge l'array).

- [ ] **Step 2: Esegui — deve fallire**

```bash
corepack pnpm --filter web-staff test -- PricingView
```
Expected: FAIL (nessun `add-equipment-row`, `equipmentLabel` vecchio).

- [ ] **Step 3: Riscrivi il compositore in `PricingView.vue`**

- Sostituisci `EQUIP_IT`/`equipmentLabel` (righe 49-61) con:
```ts
function equipmentLabel(equipment: { name: string; quantity: number }[]): string {
  if (equipment.length === 0) return 'Nessuna dotazione';
  return equipment.map((e) => `${e.quantity} × ${e.name}`).join(' · ');
}
```
- Sostituisci lo stato del modale pacchetto (`pName`/`pSunbeds`) con `pName` + `pRows = ref<{ equipmentTypeId: string; quantity: string }[]>([])`. `openCreatePackage`: `pRows.value = []`. `openEditPackage(p)`: `pRows.value = p.equipment.map((e) => ({ equipmentTypeId: e.equipmentTypeId, quantity: String(e.quantity) }))`. Aggiungi `addEquipmentRow()`/`removeEquipmentRow(i)`. `submitPackage`:
```ts
function submitPackage() {
  if (!pName.value) return;
  const equipment = pRows.value
    .filter((r) => r.equipmentTypeId)
    .map((r) => ({ equipmentTypeId: r.equipmentTypeId, quantity: Number(r.quantity) || 1 }));
  const input = { name: pName.value, equipment };
  if (editingPkgId.value) updatePackage.mutate({ id: editingPkgId.value, input }, { onSuccess: () => closePackageModal() });
  else createPackage.mutate(input, { onSuccess: () => closePackageModal() });
}
```
- Nel template del modale pacchetto (righe 434-443), sostituisci il campo "Lettini" con il compositore: `v-for="(row, i) in pRows"` con `data-test="equip-row-<i>"`, un `<Select>` dei tipi attivi (`useEquipmentTypes`) legato a `row.equipmentTypeId`, un `<Input name="quantity" type="number">` legato a `row.quantity`, un bottone rimuovi; e un bottone `data-test="add-equipment-row"` "Aggiungi voce". (Creazione al volo opzionale: se il tempo lo consente, un'opzione "+ Crea…" che apre il modale tipo; altrimenti l'utente crea prima il tipo nel catalogo — accettabile per questo slice, il catalogo è nella stessa vista.)

  > **Nota creazione al volo:** la spec §5 la richiede. Implementala se il compositore la regge pulito (bottone "+ Crea «testo»" che chiama `useCreateEquipmentType` e seleziona il nuovo id). Se emerge complessità, il task-review deve segnalarla come gap rispetto alla spec, non silenziarla.

- [ ] **Step 4: Esegui — deve passare**

```bash
corepack pnpm --filter web-staff test -- PricingView
```
Expected: nuovi test PASS.

- [ ] **Step 5: Suite completa + typecheck**

```bash
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
```
Expected: verde (≥148); typecheck pulito. Nessun residuo di `EQUIP_IT`/`p.equipment.sunbeds`.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/pricing
git commit -m "feat(web): compositore pacchetto multi-voce + etichetta «N × Nome» (chiude il clobber)"
```

---

## Task 6: ADR-0036 + rimando ADR-0006

**Files:**
- Create: `docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md`
- Modify: `docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md:7`

- [ ] **Step 1: Scrivi ADR-0036**

Create `docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md` seguendo il formato degli ADR esistenti (Status Accepted, Data 2026-07-03, ADR correlati [ADR-0006], [ADR-0010], [ADR-0009], [D-012], [D-003]). Contenuto: la dotazione passa da `Package.equipment` JSONB opaco a **catalogo tenant-scoped `EquipmentType`** + **composizione normalizzata `PackageEquipment`** (qty ≥ 1, `@@id([packageId, equipmentTypeId])`, `onDelete Cascade` lato pacchetto / `Restrict` lato tipo). Documenta: unicità nome per tenant (trim + case-insensitive); archiviazione mai-hard-delete-se-referenziato (coerente con lo slice Archiviazione); scrittura **set-assoluto** che chiude il bug del clobber; etichetta "Quantità × Nome" (pluralizzazione → D-003); **`establishmentId` sul join per RLS uniforme** (ADR-0010, raffina lo sketch); confine con **D-012** (equipment ≠ risorsa prenotabile). Sezione "Raffina ADR-0006". Includi il Rubric check (4 punti) come gli altri ADR.

- [ ] **Step 2: Rimando in ADR-0006**

In `docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md`, riga "ADR correlati", aggiungi `[ADR-0036](0036-equipment-catalogo-e-composizione.md)` e una riga sotto la sezione Decision (unità Ombrellone-pacchetto) del tipo:
```markdown
> **Aggiornamento (ADR-0036):** la "dotazione" del Pacchetto non è più un attributo JSONB ma una
> relazione verso un catalogo `EquipmentType` con composizione normalizzata `PackageEquipment`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/decisions/0036-equipment-catalogo-e-composizione.md docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md
git commit -m "docs(adr): ADR-0036 catalogo EquipmentType + composizione (raffina ADR-0006)"
```

---

## Chiusura dello slice (dopo il Task 6)

1. **Review whole-branch (opus)** via `superpowers:requesting-code-review`. Correggi Critical/Important.
2. **Verifica live (dev):** applica la migrazione a dev+test (già fatto nel Task 1), `docker compose --profile full up -d --build api web`, login `admin@coralyn.dev` / `coralyn-admin-8473`. Nel Listino: crea un tipo, componi un pacchetto con ≥2 voci, ri-salva → nessuna voce sparisce; etichetta "N × Nome".
3. **Riverifica i conteggi dal vivo:** api unit (≥94+3), e2e (≥130), web-staff (≥148), ui-kit 55, typecheck pulito.
4. **Presenta lo stato all'utente e attendi conferma** prima dei D-0xx (D-034 → D-012).

## Self-Review (svolta in fase di scrittura)

- **Copertura spec:** §3 schema+migrazione → Task 1; §4.1 contratti → Task 2 Step 1 + Task 3 Step 1; §4.2 CRUD → Task 2; §4.3 composizione → Task 3; §5 FE catalogo → Task 4; §5 compositore/etichetta → Task 5; §6 test → distribuiti; §7 ADR → Task 6. ✔
- **Decisioni §8:** entità+join (Task 1), composizione normalizzata (Task 3), etichetta "Qta × Nome" (Task 5), editor+catalogo (Task 4/5), unicità nome (Task 2), tipo archiviato non selezionabile (Task 3 validazione + Task 5 picker attivi), Cascade/Restrict (Task 1). ✔
- **Refinement oltre la spec:** `PackageEquipment.establishmentId` per RLS uniforme (Global Constraints + Task 1 + ADR-0036) — l'unica deviazione, motivata e documentata.
- **Rischio principale:** lo step-dati della migrazione sotto RLS FORCE (`NO FORCE`/`FORCE` attorno alla copia) — Task 1 Step 3, verificato allo Step 9.
- **Tipi coerenti:** `PackageEquipmentDTO`, `toPackageDTO(PackageWithLinks)`, `PACKAGE_INCLUDE` usati in modo identico tra Task 2/3; endpoint e nomi service allineati tra controller e service.
