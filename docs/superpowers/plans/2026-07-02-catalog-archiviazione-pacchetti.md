# Archiviazione pacchetti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre un ciclo di vita del `Package` — archiviazione (soft-delete) reversibile come azione primaria + eliminazione fisica esplicita, possibile solo su un pacchetto già archiviato e senza riferimenti.

**Architecture:** Backend: colonna `Package.archivedAt DateTime?` (nullable = attivo); `listPackages` default solo attivi, opt-in `?includeArchived=true`; rotte azione `POST /packages/:id/archive|restore`; `deletePackage` rafforzato (409 se non archiviato o referenziato). Frontend editor: card attiva → "Archivia" (no conferma); sezione a scomparsa "Archiviati (N)" con "Ripristina" + "Elimina definitivamente" (ConfirmDialog); selettori tariffa/prenotazione solo attivi.

**Tech Stack:** NestJS + Prisma (Postgres, RLS `forTenant`), `@coralyn/contracts` (TS types), Vue 3 + `@tanstack/vue-query`, Vitest + MSW, `@coralyn/ui-kit`.

## Global Constraints

- **Codice/DB in inglese; UI/documentazione in italiano** (convenzione repo).
- **Modello C (deciso, spec §6):** archiviazione primaria reversibile; hard-delete separato ed esplicito, solo se `archivedAt != null` **e** 0 riferimenti (0 rate, 0 booking).
- **`archivedAt DateTime?`** (non boolean): `null` = attivo, timestamp = archiviato. Timestamp semplice (`@default(now())` style), **NON** `@db.Date`.
- **`PackageDTO.archived?: boolean`** opzionale: presente/`true` solo se archiviato, assente se attivo. `CreatePackageInput`/`UpdatePackageInput` **INVARIATI**.
- **`GET /packages` default = solo attivi.** Solo l'editor card opta con `?includeArchived=true`.
- **Un commit per layer** (backend, poi FE editor) — override alla granularità per-task. Ogni sub-task è comunque test-first e indipendentemente rivedibile; il commit avviene al confine di layer.
- **Baseline test da NON regredire (verificata live 2026-07-02):** api unit 89 · api e2e 126 · web-staff 145 (globa ui-kit) · ui-kit standalone 55. Ammessi solo test **additivi** (+ sostituzioni 1:1 dei test FE del vecchio flusso "elimina pacchetto").
- **Nessun nuovo ADR.** Migrazione additiva nullable (nessun backfill).
- **Comandi test (root, `corepack pnpm`):** contracts `--filter @coralyn/contracts build`; api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`; web-staff `--filter web-staff test`; ui-kit incluso nel glob web-staff; typecheck `--filter web-staff typecheck`.
- **Dopo aver toccato `@coralyn/contracts`:** `pnpm --filter @coralyn/contracts build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff.

---

## File Structure

**Backend (`apps/api`)**
- `prisma/schema.prisma` — `model Package`: aggiungi `archivedAt DateTime?`.
- `prisma/migrations/<ts>_add_package_archived_at/migration.sql` — nuova migrazione additiva.
- `packages/contracts/src/index.ts` — `PackageDTO.archived?: boolean`.
- `src/catalog/package.projection.ts` — `toPackageDTO` proietta `archived`.
- `src/catalog/package.projection.spec.ts` — copre `archived`.
- `src/catalog/catalog.service.ts` — `listPackages(includeArchived)`, `archivePackage`, `restorePackage`, `deletePackage` rafforzato.
- `src/catalog/packages.controller.ts` — `@Query('includeArchived')`, `POST :id/archive`, `POST :id/restore`.
- `test/packages.e2e-spec.ts` — archive/restore/delete-guard/default-esclude + aggiorna i 2 test DELETE esistenti.

**Frontend (`apps/web-staff`, `packages/ui-kit`)**
- `packages/ui-kit/src/icons/registry.ts` — aggiungi icona `archive`.
- `src/lib/queryKeys.ts` — `allPackages` key.
- `src/features/bookings/usePackages.ts` — `useAllPackages`, `useArchivePackage`, `useRestorePackage`.
- `src/mocks/server.ts` — `GET /packages` filtra su `includeArchived`; `POST :id/archive|restore`.
- `src/features/pricing/PricingView.vue` — split attivi/archiviati, azione "Archivia", sezione "Archiviati (N)", `packageOptions` solo attivi.
- `src/features/pricing/PricingView.spec.ts` — sostituisce i test del vecchio flusso "elimina pacchetto" con il flusso archivia/ripristina/elimina-definitivamente.

---

# LAYER 1 — Backend

> Prerequisiti infra (migrazione + contratti) sono i primi due task: senza colonna e senza tipo, service/controller/e2e non compilano. Poi TDD sulla proiezione e sulle rotte via e2e. **Commit unico del layer** al termine del Task B6.

## Task B1: Migrazione — `Package.archivedAt`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:203-213` (model Package)
- Create: `apps/api/prisma/migrations/<timestamp>_add_package_archived_at/migration.sql`

**Interfaces:**
- Produces: colonna DB `Package.archivedAt` nullable + campo Prisma client `Package.archivedAt: Date | null`.

- [ ] **Step 1: Aggiorna lo schema Prisma**

In `apps/api/prisma/schema.prisma`, dentro `model Package` (dopo `equipment`):

```prisma
model Package {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  name            String
  equipment       Json          @db.JsonB
  archivedAt      DateTime?
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  bookings        Booking[]
  rates           Rate[]

  @@index([establishmentId])
}
```

- [ ] **Step 2: Genera la migrazione (`--create-only`)**

Dal root. Carica `DATABASE_URL` senza stamparlo (gotcha handoff §5 — il classifier blocca la materializzazione di credenziali):

```bash
DEV_URL="$(grep -oE '^DATABASE_URL=.*' .env | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate dev --name add_package_archived_at --create-only
```
Expected: crea `prisma/migrations/<ts>_add_package_archived_at/migration.sql` senza applicare.

- [ ] **Step 3: Ripulisci il `migration.sql`**

Apri il file generato. Deve contenere **solo**:
```sql
ALTER TABLE "Package" ADD COLUMN "archivedAt" TIMESTAMP(3);
```
**Rimuovi lo spurio** `DROP INDEX "Rate_signature_key";` se compare (indice raw, non drift — gotcha handoff §5). Nessun'altra istruzione deve restare.

- [ ] **Step 4: Applica a dev e a coralyn_test**

```bash
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate dev
TEST_URL="$(grep -oE '^DATABASE_URL=.*' .env.test | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"  # .env.test è al ROOT del repo
DATABASE_URL="$TEST_URL" corepack pnpm --filter @coralyn/api exec prisma migrate deploy
```
Expected: `migrate dev` applica a dev + rigenera il client Prisma; `migrate deploy` applica a `coralyn_test`.
Se `migrate deploy` dà **P1002 advisory-lock timeout**: termina la connessione stale che tiene il lock (gotcha handoff §5) —
```bash
docker exec coralyn-db sh -c 'psql -U "$POSTGRES_USER" -d coralyn_dev -c "SELECT pid FROM pg_locks WHERE locktype='"'"'advisory'"'"';"'
docker exec coralyn-db sh -c 'psql -U "$POSTGRES_USER" -d coralyn_dev -c "SELECT pg_terminate_backend(<pid>);"'
```
poi ripeti `migrate deploy`.

- [ ] **Step 5: Verifica lo stato migrazioni pulito**

```bash
DATABASE_URL="$DEV_URL" corepack pnpm --filter @coralyn/api exec prisma migrate status
DATABASE_URL="$TEST_URL" corepack pnpm --filter @coralyn/api exec prisma migrate status
```
Expected: entrambi "Database schema is up to date!".

*(Nessun commit qui — commit unico a fine layer, Task B6.)*

---

## Task B2: Contratto — `PackageDTO.archived?`

**Files:**
- Modify: `packages/contracts/src/index.ts:119-123`

**Interfaces:**
- Produces: `PackageDTO { id; name; equipment; archived?: boolean }`.

- [ ] **Step 1: Aggiungi il campo opzionale**

In `packages/contracts/src/index.ts`, sostituisci l'interfaccia `PackageDTO`:

```ts
/** Pacchetto/dotazione prenotabile (ADR-0006). `archived` presente solo quando archiviato. */
export interface PackageDTO {
  id: string;
  name: string;
  equipment: Record<string, number>; // es. { sunbeds: 2, deckchairs: 1 }
  archived?: boolean; // true = ritirato dalla circolazione (soft-delete); assente = attivo
}
```

- [ ] **Step 2: Ricostruisci i contratti**

```bash
corepack pnpm --filter @coralyn/contracts build
```
Expected: build pulita. `archived?` opzionale → nessun literal esistente si rompe.

- [ ] **Step 3: Typecheck a valle**

```bash
corepack pnpm --filter @coralyn/api build || corepack pnpm --filter @coralyn/api exec tsc --noEmit
```
Expected: nessun errore di tipo introdotto.

*(Nessun commit qui.)*

---

## Task B3: Proiezione — `toPackageDTO` espone `archived`

**Files:**
- Modify: `apps/api/src/catalog/package.projection.ts`
- Test: `apps/api/src/catalog/package.projection.spec.ts`

**Interfaces:**
- Consumes: `Package.archivedAt` (Task B1), `PackageDTO.archived?` (Task B2).
- Produces: `toPackageDTO(p: Package): PackageDTO` con `archived: true` sse `p.archivedAt != null`, altrimenti campo assente.

- [ ] **Step 1: Scrivi i test che falliscono**

Sostituisci `apps/api/src/catalog/package.projection.spec.ts` con:

```ts
import type { Package } from '@prisma/client';
import { toPackageDTO } from './package.projection';

const row = (over: Partial<Package> = {}): Package =>
  ({
    id: 'pkg-1',
    establishmentId: 'e-1',
    name: 'Standard',
    equipment: { sunbeds: 2, deckchairs: 1 },
    archivedAt: null,
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
    expect((toPackageDTO(row()) as unknown as Record<string, unknown>).establishmentId).toBeUndefined();
  });

  it('un pacchetto attivo (archivedAt null) NON espone archived', () => {
    expect('archived' in toPackageDTO(row())).toBe(false);
  });

  it('un pacchetto archiviato espone archived: true', () => {
    expect(toPackageDTO(row({ archivedAt: new Date('2026-07-01T10:00:00Z') })).archived).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui i test — devono fallire**

```bash
corepack pnpm --filter @coralyn/api test -- package.projection
```
Expected: FAIL — "un pacchetto archiviato espone archived: true" (attualmente `archived` mai proiettato).

- [ ] **Step 3: Implementa la proiezione**

Sostituisci `apps/api/src/catalog/package.projection.ts`:

```ts
import type { Package } from '@prisma/client';
import type { PackageDTO } from '@coralyn/contracts';

/** Proietta una riga Package nel DTO condiviso. `archived` omesso quando attivo (archivedAt null). */
export function toPackageDTO(p: Package): PackageDTO {
  return {
    id: p.id,
    name: p.name,
    equipment: p.equipment as Record<string, number>,
    ...(p.archivedAt != null ? { archived: true } : {}),
  };
}
```

- [ ] **Step 4: Esegui i test — devono passare**

```bash
corepack pnpm --filter @coralyn/api test -- package.projection
```
Expected: PASS (4 test).

*(Nessun commit qui.)*

---

## Task B4: Service — list/archive/restore/delete

**Files:**
- Modify: `apps/api/src/catalog/catalog.service.ts:67-71` (`listPackages`) e `:177-194` (`deletePackage`); aggiungi `archivePackage`/`restorePackage`.

**Interfaces:**
- Consumes: `Package.archivedAt`, `toPackageDTO`.
- Produces:
  - `listPackages(includeArchived = false): Promise<PackageDTO[]>`
  - `archivePackage(id: string): Promise<PackageDTO>`
  - `restorePackage(id: string): Promise<PackageDTO>`
  - `deletePackage(id: string): Promise<PackageDTO>` (rafforzato: 409 se non archiviato o referenziato).

> Il comportamento del service è verificato via e2e (Task B6): questo task implementa, il Task B6 scrive i test rossi che lo guidano. Ordine pragmatico dettato dal fatto che gli e2e girano solo con controller+rotte esistenti (Task B5). Implementa qui, poi B5, poi i test e2e in B6.

- [ ] **Step 1: `listPackages` con filtro attivi/tutti**

Sostituisci `listPackages` (`:67-71`):

```ts
  /** Lista dei pacchetti del tenant. Default: solo attivi; `includeArchived` include gli archiviati. */
  async listPackages(includeArchived = false): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.findMany({ where: includeArchived ? {} : { archivedAt: null } }),
    );
    return rows.map(toPackageDTO);
  }
```

- [ ] **Step 2: `archivePackage` / `restorePackage` idempotenti**

Aggiungi (subito dopo `updatePackage`, prima di `deletePackage`):

```ts
  /** Archivia (soft-delete) un pacchetto del tenant; 404 se assente/cross-tenant. Idempotente. */
  async archivePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt != null) return existing; // già archiviato: no-op
      return tx.package.update({ where: { id }, data: { archivedAt: new Date() } });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /** Ripristina un pacchetto archiviato (archivedAt → null); 404 se assente/cross-tenant. Idempotente. */
  async restorePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) return existing; // già attivo: no-op
      return tx.package.update({ where: { id }, data: { archivedAt: null } });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }
```

- [ ] **Step 3: `deletePackage` rafforzato**

Sostituisci il corpo di `deletePackage` (`:177-194`). Aggiungi la guardia "prima archivia" **prima** della guardia riferimenti; aggiorna il commento:

```ts
  /**
   * Elimina fisicamente un pacchetto del tenant e lo ritorna. Consentito SOLO su un pacchetto già
   * archiviato (409 altrimenti: flusso in due passi, niente cancellazioni accidentali) e senza
   * riferimenti (409 se rate/booking > 0 — rete di sicurezza: le FK sono ON DELETE SET NULL, senza
   * questa guardia la delete azzererebbe silenziosamente il packageId su tariffe/prenotazioni).
   */
  async deletePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        throw new ConflictException('Archivia il pacchetto prima di eliminarlo definitivamente.');
      }
      const [rateCount, bookingCount] = await Promise.all([
        tx.rate.count({ where: { packageId: id } }),
        tx.booking.count({ where: { packageId: id } }),
      ]);
      if (rateCount > 0 || bookingCount > 0) {
        throw new ConflictException('Pacchetto in uso da tariffe o prenotazioni: non eliminabile.');
      }
      await tx.package.delete({ where: { id } });
      return existing;
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }
```

- [ ] **Step 4: Compila il service**

```bash
corepack pnpm --filter @coralyn/api build || corepack pnpm --filter @coralyn/api exec tsc --noEmit
```
Expected: nessun errore di tipo.

*(Nessun commit qui.)*

---

## Task B5: Controller — query param + rotte azione

**Files:**
- Modify: `apps/api/src/catalog/packages.controller.ts`

**Interfaces:**
- Consumes: `listPackages(includeArchived)`, `archivePackage`, `restorePackage` (Task B4).
- Produces: `GET /packages?includeArchived=true`, `POST /packages/:id/archive`, `POST /packages/:id/restore`.

- [ ] **Step 1: Aggiungi query param e rotte azione**

Sostituisci `apps/api/src/catalog/packages.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { PackageDTO } from '@coralyn/contracts';
import { CatalogService } from './catalog.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<PackageDTO[]> {
    return this.catalog.listPackages(includeArchived === 'true');
  }

  @Post()
  create(@Body() body: CreatePackageDto): Promise<PackageDTO> {
    return this.catalog.createPackage(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePackageDto): Promise<PackageDTO> {
    return this.catalog.updatePackage(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.archivePackage(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.restorePackage(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PackageDTO> {
    return this.catalog.deletePackage(id);
  }
}
```

- [ ] **Step 2: Compila**

```bash
corepack pnpm --filter @coralyn/api build || corepack pnpm --filter @coralyn/api exec tsc --noEmit
```
Expected: nessun errore.

*(Nessun commit qui.)*

---

## Task B6: e2e — archive/restore/delete-guard + aggiorna i DELETE esistenti

**Files:**
- Modify: `apps/api/test/packages.e2e-spec.ts`

**Interfaces:**
- Consumes: tutte le rotte dei Task B4/B5.

> **Attenzione ai 2 test DELETE esistenti che ORA regrediscono:** con la guardia "prima archivia", una `DELETE` su pacchetto non archiviato dà 409. I due test esistenti vanno **aggiornati** (archivia prima della delete), non rimossi — è una sostituzione 1:1.

- [ ] **Step 1: Aggiorna il test "DELETE elimina il pacchetto…" (righe ~71-78)**

Sostituisci quel test con la variante archivia→elimina:

```ts
  it('DELETE elimina un pacchetto ARCHIVIATO e lo ritorna; 404 se poi si ripete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Effimero', equipment: {} }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/packages/${id}/archive`).set(...bearer(token1)).expect(201);
    const del = await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(id);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(404);
  });
```

- [ ] **Step 2: Aggiorna il test "DELETE di un pacchetto referenziato… → 409" (righe ~84-95)**

Il pacchetto va **archiviato prima** della delete, così il 409 verifica davvero la guardia riferimenti (non la guardia "prima archivia"):

```ts
  it('DELETE di un pacchetto ARCHIVIATO ma referenziato da una tariffa → 409', async () => {
    const pkg = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Referenziato', equipment: {} }).expect(201);
    const season = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Stagione Pkg', startDate: '2029-06-01', endDate: '2029-09-30' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId: season.body.id, packageId: pkg.body.id, price: 40 }).expect(201);
    await request(app.getHttpServer()).post(`/api/packages/${pkg.body.id}/archive`).set(...bearer(token1)).expect(201);

    await request(app.getHttpServer()).delete(`/api/packages/${pkg.body.id}`).set(...bearer(token1)).expect(409);
  });
```

- [ ] **Step 3: Aggiungi i nuovi test (in coda al `describe`)**

```ts
  it('archive nasconde il pacchetto dal default e lo mostra con includeArchived; restore lo riporta', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Da Archiviare', equipment: {} }).expect(201);
    const id = created.body.id as string;

    const archived = await request(app.getHttpServer())
      .post(`/api/packages/${id}/archive`).set(...bearer(token1)).expect(201);
    expect(archived.body).toMatchObject({ id, archived: true });

    const listDefault = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
    expect(listDefault.body.some((p: { id: string }) => p.id === id)).toBe(false);

    const listAll = await request(app.getHttpServer())
      .get('/api/packages?includeArchived=true').set(...bearer(token1)).expect(200);
    const found = listAll.body.find((p: { id: string }) => p.id === id);
    expect(found).toMatchObject({ id, archived: true });

    const restored = await request(app.getHttpServer())
      .post(`/api/packages/${id}/restore`).set(...bearer(token1)).expect(201);
    expect(restored.body.id).toBe(id);
    expect(restored.body.archived).toBeUndefined();

    const listAfter = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
    expect(listAfter.body.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it('DELETE di un pacchetto NON archiviato → 409 (va prima archiviato)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Attivo', equipment: {} }).expect(201);
    await request(app.getHttpServer()).delete(`/api/packages/${created.body.id}`).set(...bearer(token1)).expect(409);
  });

  it('archive/restore/delete sono isolati per tenant (404 cross-tenant)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Isolato', equipment: {} }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/packages/${id}/archive`).set(...bearer(token2)).expect(404);
    await request(app.getHttpServer()).post(`/api/packages/${id}/restore`).set(...bearer(token2)).expect(404);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token2)).expect(404);
  });
```

> **Nota sui codici:** le rotte `@Post` rispondono **201** di default in Nest (come `/renew`). Gli assert sopra usano 201 per archive/restore. Se una convenzione locale forza 200 sulle azioni, allinea gli assert al comportamento reale osservato — ma NON aggiungere `@HttpCode` non richiesto dalla spec.

- [ ] **Step 4: Esegui la suite e2e packages**

```bash
corepack pnpm --filter @coralyn/api test:e2e -- packages
```
Expected: PASS. Se archive/restore rispondono 200 anziché 201, correggi gli `.expect(201)` → `.expect(200)` per le sole azioni (verifica il valore reale una volta e allinea).

- [ ] **Step 5: Esegui l'INTERA suite api (unit + e2e) — nessuna regressione**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: api unit **≥ 91** (89 baseline + 2 nuovi projection ≈ 91) · api e2e **≥ 129** (126 baseline + 3 nuovi netti). Nessun test rosso.

- [ ] **Step 6: COMMIT del layer backend**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/contracts/src/index.ts \
  apps/api/src/catalog/package.projection.ts apps/api/src/catalog/package.projection.spec.ts \
  apps/api/src/catalog/catalog.service.ts apps/api/src/catalog/packages.controller.ts \
  apps/api/test/packages.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(catalog): archiviazione pacchetti — backend (soft-delete + hard-delete esplicito)

Package.archivedAt (migrazione additiva nullable); listPackages default solo
attivi + ?includeArchived=true; POST /packages/:id/archive|restore;
deletePackage rafforzato (409 se non archiviato o referenziato, 200 solo se
archiviato+0rif); PackageDTO.archived?; projection + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# LAYER 2 — Frontend editor

> Prerequisito: `PackageDTO.archived?` già nei contratti buildati (Task B2). Prima dei test web-staff: `rm -rf apps/web-staff/node_modules/.vite`. **Commit unico del layer** al termine del Task F5.

## Task F1: Icona `archive` (ui-kit)

**Files:**
- Modify: `packages/ui-kit/src/icons/registry.ts`

**Interfaces:**
- Produces: chiave registry `archive` risolvibile da `<Icon name="archive" />`.

> `renew` (refresh-cw) è riusata per "Ripristina" — nessuna nuova icona per il restore. Solo `archive` è nuova.

- [ ] **Step 1: Aggiungi l'import e la chiave**

In `packages/ui-kit/src/icons/registry.ts`, aggiungi l'import (dopo `IconAlert`):
```ts
import IconArchive from '~icons/lucide/archive';
```
e la chiave nell'oggetto `icons` (in coda, prima della chiusura `}`):
```ts
  waves: IconWaves, 'trash-2': IconTrash, 'alert-triangle': IconAlert, archive: IconArchive,
```

- [ ] **Step 2: Verifica che il registry risolva (ui-kit standalone)**

Aggiungi `'archive'` alla lista del test esistente `resolve le nuove chiavi del registry` in `packages/ui-kit/src/components/Icon.spec.ts`:
```ts
    for (const k of ['bell','settings','euro','clock','phone','mail','renew','edit','logout','building','filter','waves','chevron-down','archive']) {
```
Poi:
```bash
corepack pnpm --filter @coralyn/ui-kit test -- Icon
```
Expected: PASS (l'icona `archive` risolve; conteggio ui-kit invariato a 55 — nessun test aggiunto/rimosso, solo la lista estesa).

*(Nessun commit qui.)*

---

## Task F2: Hook — allPackages / archive / restore

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/bookings/usePackages.ts`

**Interfaces:**
- Consumes: `PackageDTO.archived?`.
- Produces:
  - `queryKeys.allPackages(tenantId): ['packages', tenantId, 'all']`
  - `useAllPackages()` → GET `/packages?includeArchived=true`
  - `useArchivePackage()` → POST `/packages/:id/archive`
  - `useRestorePackage()` → POST `/packages/:id/restore`
  - `useDeletePackage()` (invariata) → DELETE `/packages/:id`

> Le mutation invalidano `queryKeys.packages(tenantId)` = `['packages', tenantId]`. TanStack invalida per prefisso (default `exact:false`), quindi copre ANCHE `['packages', tenantId, 'all']`: sia la lista attiva (modale prenotazione/tariffe) sia la lista completa (card editor) si aggiornano con un solo invalidate.

- [ ] **Step 1: Aggiungi la query key `allPackages`**

In `apps/web-staff/src/lib/queryKeys.ts`, sotto la riga `packages`:
```ts
  allPackages: (tenantId: string) => ['packages', tenantId, 'all'] as const,
```

- [ ] **Step 2: Aggiungi gli hook**

In `apps/web-staff/src/features/bookings/usePackages.ts`, dopo `usePackages()` (mantieni `usePackages` INVARIATA — la usa il modale prenotazione) aggiungi:

```ts
/** Lista COMPLETA (attivi + archiviati) per l'editor Listino. */
export function useAllPackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allPackages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages?includeArchived=true'),
  });
}

export function useArchivePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}/archive`, { method: 'POST' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useRestorePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}/restore`, { method: 'POST' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}
```
`useDeletePackage()` resta invariata (già presente). Aggiorna la riga `import { queryKeys }` non serve (già importato).

- [ ] **Step 3: Typecheck**

```bash
corepack pnpm --filter @coralyn/contracts build
rm -rf apps/web-staff/node_modules/.vite
corepack pnpm --filter web-staff typecheck
```
Expected: nessun errore.

*(Nessun commit qui.)*

---

## Task F3: MSW — filtro includeArchived + archive/restore

**Files:**
- Modify: `apps/web-staff/src/mocks/server.ts`

**Interfaces:**
- Produces: mock `GET /api/packages` che filtra su `?includeArchived`; `POST /api/packages/:id/archive|restore` che mutano `archived` in-memory.

- [ ] **Step 1: Filtra il GET su includeArchived**

Sostituisci l'handler `http.get('/api/packages', …)` (riga ~91):
```ts
  http.get('/api/packages', ({ request }) => {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    return HttpResponse.json(includeArchived ? packages : packages.filter((p) => !p.archived));
  }),
```

- [ ] **Step 2: Aggiungi archive/restore (subito dopo il DELETE packages, riga ~110)**

```ts
  http.post('/api/packages/:id/archive', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    packages[i] = { ...packages[i], archived: true };
    return HttpResponse.json(packages[i]);
  }),
  http.post('/api/packages/:id/restore', ({ params }) => {
    const i = packages.findIndex((p) => p.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    const { archived: _drop, ...rest } = packages[i];
    packages[i] = rest;
    return HttpResponse.json(packages[i]);
  }),
```
(Il DELETE mock resta com'è: rimuove dall'array. Il FE elimina solo dalla sezione archiviati.)

*(Nessun commit qui — coperto dai test del Task F4.)*

---

## Task F4: PricingView — archivia / archiviati / elimina-definitivamente

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue`

**Interfaces:**
- Consumes: `useAllPackages`, `useArchivePackage`, `useRestorePackage`, `useDeletePackage`.
- Produces (data-test): card attiva `archive-pkg-<id>`; toggle sezione `toggle-archived`; card archiviata `restore-pkg-<id>`, `del-pkg-<id>` (hard-delete via ConfirmDialog).

- [ ] **Step 1: Import + sorgenti dati**

In `<script setup>`, aggiorna l'import degli hook pacchetti (riga 8):
```ts
import { useAllPackages, useCreatePackage, useUpdatePackage, useDeletePackage, useArchivePackage, useRestorePackage } from '@/features/bookings/usePackages';
```
Sostituisci il blocco "--- Pacchetti ---" (righe ~37-41):
```ts
// --- Pacchetti ---
const { data: packages } = useAllPackages(); // include archiviati (editor)
const createPackage = useCreatePackage();
const updatePackage = useUpdatePackage();
const deletePackage = useDeletePackage();
const archivePackage = useArchivePackage();
const restorePackage = useRestorePackage();
const activePackages = computed(() => (packages.value ?? []).filter((p) => !p.archived));
const archivedPackages = computed(() => (packages.value ?? []).filter((p) => p.archived));
const archivedOpen = ref(false);
```

- [ ] **Step 2: `packageOptions` solo attivi**

Sostituisci `packageOptions` (riga ~130):
```ts
const packageOptions = computed(() => activePackages.value.map((p) => ({ value: p.id, label: p.name })));
```
`pkgName(id)` resta su `packages.value` (deve risolvere anche i nomi archiviati nello storico tariffe) — **non** modificarla.

- [ ] **Step 3: Copy del ConfirmDialog per l'hard-delete**

Sostituisci il ramo `package` di `confirmCopy` (righe ~107-108):
```ts
  if (p?.kind === 'package')
    return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimosso in modo irreversibile. Possibile solo perché è archiviato e senza tariffe/prenotazioni collegate.` };
```
`askDeletePackage`, `pendingDelete` kind `'package'` e `onConfirmDelete` (che chiama `deletePackage.mutate`) restano invariati.

- [ ] **Step 4: Card attive → azione "Archivia" (no conferma)**

Nel template, sostituisci il bottone "Elimina" della card (righe ~327-328) con "Archivia":
```html
              <button type="button" title="Archivia" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                :data-test="`archive-pkg-${p.id}`" @click="archivePackage.mutate(p.id)"><Icon name="archive" :size="15" /></button>
```
e cambia il `v-for` della griglia card (riga ~320) da `p in packages` a `p in activePackages`. Aggiorna anche l'`EmptyState` (riga ~318) da `(packages?.length ?? 0) === 0` a `activePackages.length === 0`.

- [ ] **Step 5: Sezione "Archiviati (N)" a scomparsa**

Subito **dopo** il `</div>` che chiude la griglia delle card attive (riga ~338), inserisci:
```html
    <!-- Pacchetti archiviati (a scomparsa, chiusa di default) -->
    <div v-if="archivedPackages.length > 0" class="mb-4">
      <button type="button" data-test="toggle-archived"
        class="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-2nd)]"
        @click="archivedOpen = !archivedOpen">
        <Icon :name="archivedOpen ? 'chevron-down' : 'chevron-right'" :size="15" />
        Archiviati ({{ archivedPackages.length }})
      </button>
      <div v-if="archivedOpen" class="grid grid-cols-3 gap-3.5">
        <Card v-for="p in archivedPackages" :key="p.id" class="opacity-60">
          <div class="flex h-full flex-col p-[18px]">
            <div class="mb-2 flex items-start justify-between gap-2">
              <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
              <div class="flex shrink-0 items-center gap-2.5">
                <button type="button" title="Ripristina" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                  :data-test="`restore-pkg-${p.id}`" @click="restorePackage.mutate(p.id)"><Icon name="renew" :size="15" /></button>
                <button type="button" title="Elimina definitivamente" class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                  :data-test="`del-pkg-${p.id}`" @click="askDeletePackage(p)"><Icon name="trash-2" :size="15" /></button>
              </div>
            </div>
            <div class="min-h-[38px] flex-1 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">{{ equipmentLabel(p.equipment) }}</div>
          </div>
        </Card>
      </div>
    </div>
```

- [ ] **Step 6: Typecheck + esegui i test esistenti PricingView (aspettati alcuni rossi)**

```bash
rm -rf apps/web-staff/node_modules/.vite
corepack pnpm --filter web-staff typecheck
corepack pnpm --filter web-staff test -- PricingView
```
Expected: typecheck pulito. I due test del vecchio flusso "elimina pacchetto" (`del-pkg-pkg-1` su card attiva + "Eliminare il pacchetto?") ora falliscono — verranno sostituiti nel Task F5. Gli altri PricingView test restano verdi.

*(Nessun commit qui.)*

---

## Task F5: PricingView.spec — sostituisci il flusso pacchetto

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.spec.ts`

**Interfaces:**
- Consumes: data-test del Task F4.

- [ ] **Step 1: Sostituisci il blocco `describe('elimina pacchetto…')` (righe ~157-187)**

Rimpiazzalo interamente con il nuovo flusso archivia/ripristina/elimina:

```ts
  describe('ciclo di vita pacchetto: archivia / ripristina / elimina definitivamente', () => {
    it('la card attiva mostra "Archivia" (non "Elimina") e archiviando sparisce dagli attivi', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.get('[data-test="archive-pkg-pkg-1"]').exists()).toBe(true);
      expect(document.querySelector('[data-test="del-pkg-pkg-1"]')).toBeNull(); // niente delete sulla card attiva
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      // "Standard" non è più tra le card attive, ma la sezione Archiviati compare (chiusa).
      expect(w.get('[data-test="toggle-archived"]').text()).toContain('Archiviati (1)');
    });

    it('apre la sezione archiviati e ripristina il pacchetto', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived"]').trigger('click'); // apri
      await settle();
      await w.get('[data-test="restore-pkg-pkg-1"]').trigger('click');
      await settle();
      // Ripristinato: torna card attiva con azione Archivia, sezione archiviati sparita.
      expect(w.get('[data-test="archive-pkg-pkg-1"]').exists()).toBe(true);
      expect(document.querySelector('[data-test="toggle-archived"]')).toBeNull();
    });

    it('"Elimina definitivamente" apre il ConfirmDialog e chiama la DELETE', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived"]').trigger('click');
      await settle();
      await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare definitivamente?');
      dialogBtn('Elimina')!.click();
      await settle();
      // Eliminato del tutto: niente più card, niente sezione archiviati.
      expect(document.querySelector('[data-test="toggle-archived"]')).toBeNull();
      expect(w.text()).not.toContain('Standard');
    });

    it('il selettore Pacchetto dell\'editor tariffe NON elenca gli archiviati', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="new-rate"]').trigger('click');
      await settle();
      const form = document.querySelector('[data-test="form-rate"]') as HTMLElement;
      const packageSelect = form.querySelectorAll('select')[2] as HTMLSelectElement; // Tipo, Settore, Pacchetto, Fascia
      expect(Array.from(packageSelect.options).some((o) => o.textContent?.includes('Standard'))).toBe(false);
      w.unmount();
    });
  });
```

> Il primo test iniziale `mostra la stagione, i pacchetti e le tariffe reali dal mock` (attende "Standard") resta valido: `pkg-1` è attivo all'avvio. `crea un pacchetto…`, `modifica il nome…` restano validi (operano su card attive/modale, invariati).

- [ ] **Step 2: Esegui la suite PricingView — verde**

```bash
corepack pnpm --filter web-staff test -- PricingView
```
Expected: PASS (nuovo blocco + test superstiti).

- [ ] **Step 3: Esegui l'INTERA suite web-staff (include ui-kit) + typecheck**

```bash
corepack pnpm --filter web-staff test
corepack pnpm --filter web-staff typecheck
```
Expected: web-staff **≥ 147** (145 baseline − 2 vecchi test pacchetto + 4 nuovi = 147) · ui-kit standalone invariato a **55**. Typecheck pulito.

- [ ] **Step 4: COMMIT del layer FE**

```bash
git add packages/ui-kit/src/icons/registry.ts packages/ui-kit/src/components/Icon.spec.ts \
  apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/bookings/usePackages.ts \
  apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/pricing/PricingView.vue \
  apps/web-staff/src/features/pricing/PricingView.spec.ts
git commit -m "$(cat <<'EOF'
feat(catalog): archiviazione pacchetti — editor (Archivia + sezione Archiviati)

Card attiva → Archivia (no conferma). Sezione "Archiviati (N)" a scomparsa
(chiusa di default) con Ripristina + Elimina definitivamente (ConfirmDialog).
packageOptions/selettori solo attivi. useAllPackages/useArchivePackage/
useRestorePackage; MSW includeArchived + archive/restore; icona archive.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Verifica finale (dopo entrambi i layer)

- [ ] **Suite completa da NON regredire**

```bash
corepack pnpm --filter @coralyn/api test        # ≥ 91 (89 + 2 projection)
corepack pnpm --filter @coralyn/api test:e2e    # ≥ 129 (126 + 3)
corepack pnpm --filter web-staff test           # ≥ 147 (145 − 2 + 4)
corepack pnpm --filter web-staff typecheck      # pulito
```

- [ ] **Review whole-branch (opus)** via `superpowers:requesting-code-review` — spec + qualità, 0 Critical/Important attesi.

- [ ] **Rebuild container + verifica live** (gotcha handoff §5):
```bash
docker compose --profile full up -d --build api web
```
Login `admin@coralyn.dev` / `coralyn-admin-8473`. Nell'editor Listino: (1) archivia una card → sparisce dagli attivi e dal selettore Pacchetto della nuova tariffa; (2) apri "Archiviati (N)", Ripristina → torna attiva; (3) su un pacchetto archiviato e senza tariffe/prenotazioni, "Elimina definitivamente" → ConfirmDialog → sparisce del tutto; (4) su un archiviato referenziato, "Elimina definitivamente" → toast 409. `502` transitori su `/auth/*` durante il rebuild sono normali.

- [ ] **Presenta lo stato all'utente e attendi conferma** prima dello Slice C (Equipment personalizzato: brainstorming + spec).

---

## Self-Review (autore del piano)

- **Spec coverage:** migrazione §3.1 → B1; contratto §3.2 → B2; proiezione §3.3 → B3; service §3.4 → B4; controller §3.5 → B5; e2e §3.6 → B6; hook/MSW/PricingView/spec §4 → F1-F5. Decisioni §6 (1-7) tutte riflesse (modello C, archivedAt, 409-prima-archivia, no-conferma/con-conferma, sezione a scomparsa, default solo-attivi, no ADR). ✔
- **Placeholder scan:** ogni step ha codice/comandi reali, nessun "TODO/etc". ✔
- **Type consistency:** `useAllPackages`/`useArchivePackage`/`useRestorePackage`, `queryKeys.allPackages`, `activePackages`/`archivedPackages`, data-test `archive-pkg-`/`restore-pkg-`/`del-pkg-`/`toggle-archived` coerenti tra F2/F4/F5. `listPackages(includeArchived)`, `archivePackage`, `restorePackage` coerenti tra B4/B5/B6. ✔
- **Rischio codici HTTP azioni:** le `@Post` azione tornano 201 in Nest (come `/renew`); il piano lo dichiara e prevede l'allineamento in B6 Step 4 se l'osservato differisce. ✔
