# «Ritira ombrellone» (D-055) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dismissione amministrativa (soft-delete) di un ombrellone con storico: sparisce da struttura/mappa/prenotazioni conservando lo storico contabile, con archivio «Ritirati» e Ripristina nel Cantiere.

**Architecture:** `retiredAt` + sgancio dalla fila (`rowId` nullable) su `Umbrella`; unicità label solo tra attivi via **indice unico parziale** SQL. Tre endpoint admin (`retire`/`restore`/`retired`) nello stile del soft-archive dei pacchetti. FE: azione «Ritira» in UmbrellaPanel, sezione «Ritirati» in BeachPanel. Spec di riferimento (vincolante): [`docs/superpowers/specs/2026-07-22-ritira-ombrellone-d055-design.md`](../specs/2026-07-22-ritira-ombrellone-d055-design.md).

**Tech Stack:** NestJS + Prisma (PostgreSQL :5433), contracts TS buildati (`pnpm --filter @coralyn/contracts build` dopo ogni modifica!), Vue 3 + vue-query + MSW + vitest, jest unit/e2e.

## Global Constraints

- Branch di lavoro: `feat/ritira-ombrellone-d055` da `main`. NESSUN merge senza ok esplicito utente.
- **TDD obbligatorio**: test PRIMA del codice, visto fallire per la ragione giusta.
- **Suite SEMPRE in sequenza, mai in parallelo** (falsi rossi massicci su questo host). Regola cross-file: dopo ogni task l'INTERA suite del pacchetto toccato (`npx vitest run` da apps/web-staff; `npx jest` da apps/api), mai il solo spec.
- «Oggi» nelle **e2e** api = **2026-07-15 per sempre** (calendario congelato): date di test **letterali** dentro `[2026-05-01, 2026-09-30]`; futuro = dopo il 07-15, passato = prima. MAI date relative al now reale. La suite **unit** api NON è congelata.
- Lingua: nomi campo/token EN, dominio/UI/commenti/messaggi IT.
- Errori API: eccezioni Nest tipizzate col messaggio IT (stile esistente). FE: toast su ogni esito; `:disabled` esterno su Button sempre in OR col pending; ConfirmDialog SOLO per azioni distruttive.
- Dopo OGNI modifica a `packages/contracts`: `pnpm --filter @coralyn/contracts build` (i consumer leggono `dist/`).
- Typecheck api spec-incluso: `npx tsc --noEmit -p tsconfig.json` da `apps/api` (il `pnpm -r typecheck` NON copre l'api).
- File scratch subagent: `.superpowers/sdd/task-se-N-*.md`; ledger `.superpowers/sdd/progress.md` da APPENDERE, mai sovrascrivere.
- Warning jest «worker process has failed to exit gracefully»: pre-esistente, non è una regressione.

---

### Task 1: Schema, migration e fallout di tipo

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Umbrella`, righe ~214-230)
- Create: `apps/api/prisma/migrations/<timestamp>_umbrella_retire_soft_delete/migration.sql` (via `--create-only`, poi editata)
- Modify: `apps/api/src/map/map.projection.ts:88` (fallout `rowId` nullable)

**Interfaces:**
- Produces: colonne `Umbrella.retiredAt: DateTime?`, `Umbrella.retiredFrom: String?`, `Umbrella.rowId: String?`; indice `Umbrella_establishmentId_label_active_key` parziale. I task 2-4 li assumono esistenti.

- [ ] **Step 1: Modifica lo schema Prisma**

Nel model `Umbrella` di `apps/api/prisma/schema.prisma`:

```prisma
model Umbrella {
  id                   String        @id @default(uuid()) @db.Uuid
  establishmentId      String        @db.Uuid
  rowId                String?       @db.Uuid // null = ritirato (D-055): sganciato dalla struttura
  umbrellaTypeId       String?       @db.Uuid // null = Normal (ADR-0016)
  label                String // real physical number, unique among ACTIVE per Establishment (ADR-0016, D-055)
  logicalOrder         Int
  retiredAt            DateTime? // null = attivo; valorizzato = ritirato (soft-delete, D-055/ADR-0053)
  retiredFrom          String? // snapshot «Settore · Fila» al ritiro (storico, non riferimento vivo)
  presentationPosition Json?         @db.JsonB // visual layer (D-005): modeled, unused in this slice
  establishment        Establishment @relation(fields: [establishmentId], references: [id])
  row                  Row?          @relation(fields: [rowId], references: [id])
  type                 UmbrellaType? @relation(fields: [umbrellaTypeId], references: [id])
  bookings             Booking[]

  // NB: l'unicità (establishmentId, label) vale SOLO tra gli attivi: indice unico PARZIALE
  // `WHERE "retiredAt" IS NULL`, creato a mano nella migration umbrella_retire_soft_delete
  // (il DSL Prisma non modella indici parziali). Non reintrodurre @@unique qui.
  @@index([establishmentId])
  @@index([rowId])
}
```

(Il `@@unique([establishmentId, label])` VIENE RIMOSSO; il commento lo documenta.)

- [ ] **Step 2: Genera la migration senza applicarla**

Da `apps/api` (DB `coralyn-db` su :5433 attivo — se tutte le connessioni falliscono, Docker Desktop è giù):

```bash
npx prisma migrate dev --create-only --name umbrella_retire_soft_delete
```

- [ ] **Step 3: Aggiungi l'indice parziale in coda alla migration generata**

Apri il file `migration.sql` generato (conterrà `ALTER TABLE` per le colonne, `DROP NOT NULL` su `rowId`, `DROP INDEX` dell'unique) e appendi:

```sql
-- Unicità label SOLO tra gli attivi (D-055): indice unico parziale, invisibile al DSL Prisma.
CREATE UNIQUE INDEX "Umbrella_establishmentId_label_active_key"
  ON "Umbrella" ("establishmentId", "label")
  WHERE "retiredAt" IS NULL;
```

- [ ] **Step 4: Applica e rigenera il client**

```bash
npx prisma migrate dev
```

Expected: migration applicata, client rigenerato senza errori.

- [ ] **Step 5: Fallout di tipo — verifica che il typecheck sia rosso per la ragione giusta**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: errore su `apps/api/src/map/map.projection.ts:88` (`u.rowId` è ora `string | null`, `UmbrellaDTO.rowId` è `string`). Se emergono ALTRI errori, ognuno va risolto consapevolmente (non zittito con cast).

- [ ] **Step 6: Fixa il fallout**

In `map.projection.ts`, l'ombrellone viene iterato DENTRO la sua fila `r`, quindi il rowId è per costruzione quello della fila:

```ts
        return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId, rowId: r.id, stateBySlot, coveredBySlot };
```

- [ ] **Step 7: Verifica typecheck e unit api**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest
```

Expected: exit 0; 48 suite / 255 test verdi (nessun comportamento cambiato: dati esistenti tutti attivi).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(api): schema ritiro ombrellone - retiredAt, sgancio fila, indice label parziale (D-055)"
```

---

### Task 2: Contracts + service/controller retire, restore, retired (TDD)

**Files:**
- Modify: `packages/contracts/src/index.ts` (accanto a `StructureUmbrellaDTO`, ~L570)
- Modify: `apps/api/src/establishment/umbrellas.service.ts`
- Modify: `apps/api/src/establishment/umbrellas.controller.ts`
- Modify: `apps/api/src/establishment/establishment-structure.projection.ts` (nuova `toRetiredUmbrella`)
- Create: `apps/api/src/establishment/dto/restore-umbrella.dto.ts`
- Test: `apps/api/src/establishment/umbrellas.service.spec.ts` (estendere, stile mock esistente del file)

**Interfaces:**
- Consumes: colonne del Task 1.
- Produces (per Task 4-5):
  - `RetiredUmbrellaDTO { id: string; label: string; umbrellaTypeId: string | null; retiredAt: string; retiredFrom: string | null }`
  - `RestoreUmbrellaInput { rowId: string }`
  - `POST /establishment/umbrellas/:id/retire` → `RetiredUmbrellaDTO` (409 se prenotazioni confermate con `endDate >=` oggi; idempotente se già ritirato)
  - `POST /establishment/umbrellas/:id/restore` body `{ rowId }` → `StructureUmbrellaDTO` (404 sconosciuto, 409 conflitto label attiva; idempotente se già attivo)
  - `GET /establishment/umbrellas/retired` → `RetiredUmbrellaDTO[]` (ordinati per `retiredAt` desc)

- [ ] **Step 1: Contracts**

In `packages/contracts/src/index.ts`, dopo `GenerateUmbrellasResultDTO`/i tipi bulk:

```ts
/** Ombrellone ritirato (soft-delete, D-055): fuori da struttura/mappa, storico conservato. */
export interface RetiredUmbrellaDTO {
  id: string;
  label: string;
  umbrellaTypeId: string | null;
  retiredAt: string;            // ISO
  retiredFrom: string | null;   // snapshot «Settore · Fila» al ritiro
}
export interface RestoreUmbrellaInput { rowId: string }
```

```bash
pnpm --filter @coralyn/contracts build
```

- [ ] **Step 2: Scrivi i test unit che falliscono**

In `umbrellas.service.spec.ts`, seguendo ESATTAMENTE lo stile mock del file (tx mockato, `mockResolvedValue`), aggiungi un `describe('retire/restore (D-055)')` con questi casi (adatta i nomi degli helper del file, non inventarne di nuovi):

```ts
it('retire: 409 se esistono prenotazioni confermate con endDate >= oggi', async () => {
  tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: null, row: { label: 'F1', sector: { name: 'Centro' } } });
  tx.booking.count.mockResolvedValue(1);
  await expect(service.retire('u-1')).rejects.toThrow(ConflictException);
  expect(tx.umbrella.update).not.toHaveBeenCalled();
});

it('retire: sgancia dalla fila, timbra retiredAt e salva lo snapshot posizione', async () => {
  tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: null, row: { label: 'F1', sector: { name: 'Centro' } } });
  tx.booking.count.mockResolvedValue(0);
  tx.umbrella.update.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-22T10:00:00Z'), retiredFrom: 'Centro · F1' });
  const dto = await service.retire('u-1');
  expect(tx.umbrella.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'u-1' },
    data: expect.objectContaining({ rowId: null, retiredFrom: 'Centro · F1', retiredAt: expect.any(Date) }),
  }));
  expect(dto.retiredFrom).toBe('Centro · F1');
});

it('retire: idempotente se già ritirato (nessun update, nessun 409)', async () => {
  tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-01T00:00:00Z'), retiredFrom: 'Centro · F1', row: null });
  const dto = await service.retire('u-1');
  expect(tx.umbrella.update).not.toHaveBeenCalled();
  expect(dto.id).toBe('u-1');
});

it('restore: 409 se un ATTIVO ha già la stessa label', async () => {
  tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: new Date() });
  tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
  tx.umbrella.findFirst.mockResolvedValue({ id: 'u-9' }); // clash attivo
  await expect(service.restore('u-1', { rowId: 'r-1' })).rejects.toThrow(ConflictException);
});

it('restore: azzera retiredAt/retiredFrom, riaggancia alla fila scelta e ricalcola logicalOrder', async () => {
  tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: new Date() });
  tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
  tx.umbrella.findFirst
    .mockResolvedValueOnce(null)                       // nessun clash attivo
    .mockResolvedValueOnce({ logicalOrder: 7 });       // nextLogicalOrder
  tx.umbrella.update.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, logicalOrder: 8 });
  await service.restore('u-1', { rowId: 'r-1' });
  expect(tx.umbrella.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { retiredAt: null, retiredFrom: null, rowId: 'r-1', logicalOrder: 8 },
  }));
});

it('listRetired: filtra retiredAt not-null, ordina per retiredAt desc', async () => {
  tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-22T10:00:00Z'), retiredFrom: 'Centro · F1' }]);
  const list = await service.listRetired();
  expect(tx.umbrella.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { retiredAt: { not: null } }, orderBy: { retiredAt: 'desc' },
  }));
  expect(list[0]).toEqual({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: '2026-07-22T10:00:00.000Z', retiredFrom: 'Centro · F1' });
});
```

- [ ] **Step 3: Vedili fallire**

```bash
npx jest src/establishment/umbrellas.service.spec.ts
```

Expected: FAIL — `service.retire is not a function` (e simili). Se falliscono per import/typo, correggi e ripeti.

- [ ] **Step 4: Implementa nel service**

In `establishment-structure.projection.ts`:

```ts
import type { RetiredUmbrellaDTO } from '@coralyn/contracts';

type RawRetired = { id: string; label: string; umbrellaTypeId: string | null; retiredAt: Date; retiredFrom: string | null };
export function toRetiredUmbrella(u: RawRetired): RetiredUmbrellaDTO {
  return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId, retiredAt: u.retiredAt.toISOString(), retiredFrom: u.retiredFrom };
}
```

In `umbrellas.service.ts` (import `RetiredUmbrellaDTO`, `RestoreUmbrellaInput`, `toRetiredUmbrella`, e `todayInRome` da `../common/dates` — **verifica prima come la usa la guardia `suspend` in `bookings.service.ts` e replica lo stesso costrutto di confronto data**):

```ts
/** Guardia: prenotazioni confermate non ancora concluse bloccano il ritiro (spec §4). */
async retire(id: string): Promise<RetiredUmbrellaDTO> {
  const tenantId = this.tenant.require();
  const retired = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.umbrella.findUnique({
      where: { id },
      include: { row: { select: { label: true, sector: { select: { name: true } } } } },
    });
    if (!existing) return null;
    if (existing.retiredAt != null) return existing; // idempotente, come l'archive dei pacchetti
    const active = await tx.booking.count({
      where: { umbrellaId: id, status: 'confirmed', endDate: { gte: new Date(todayInRome()) } },
    });
    if (active > 0) throw new ConflictException('Ombrellone con prenotazioni attive o future: disdici prima di ritirare.');
    const retiredFrom = existing.row ? `${existing.row.sector.name} · ${existing.row.label}` : null;
    return tx.umbrella.update({ where: { id }, data: { retiredAt: new Date(), rowId: null, retiredFrom } });
  });
  if (!retired) throw new NotFoundException('Ombrellone non trovato');
  return toRetiredUmbrella(retired);
}

async restore(id: string, input: RestoreUmbrellaInput): Promise<StructureUmbrellaDTO> {
  const tenantId = this.tenant.require();
  const result = await this.prisma.forTenant(tenantId, async (tx) => {
    const existing = await tx.umbrella.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.retiredAt == null) {
      return tx.umbrella.findUniqueOrThrow({ where: { id }, select: UMBRELLA_SELECT }); // già attivo: idempotente
    }
    await this.assertRow(tx, input.rowId);
    const clash = await tx.umbrella.findFirst({ where: { label: existing.label, retiredAt: null } });
    if (clash) throw new ConflictException('Esiste già un ombrellone attivo con questa etichetta: rinominalo prima di ripristinare.');
    const logicalOrder = await this.nextLogicalOrder(tx, input.rowId);
    return tx.umbrella.update({
      where: { id },
      data: { retiredAt: null, retiredFrom: null, rowId: input.rowId, logicalOrder },
      select: UMBRELLA_SELECT,
    });
  });
  if (!result) throw new NotFoundException('Ombrellone non trovato');
  return toStructureUmbrella(result);
}

async listRetired(): Promise<RetiredUmbrellaDTO[]> {
  const tenantId = this.tenant.require();
  const rows = await this.prisma.forTenant(tenantId, (tx) =>
    tx.umbrella.findMany({ where: { retiredAt: { not: null } }, orderBy: { retiredAt: 'desc' } }),
  );
  return rows.map(toRetiredUmbrella);
}
```

Nuovo `apps/api/src/establishment/dto/restore-umbrella.dto.ts`:

```ts
import { IsUUID } from 'class-validator';
import type { RestoreUmbrellaInput } from '@coralyn/contracts';

export class RestoreUmbrellaDto implements RestoreUmbrellaInput {
  @IsUUID()
  rowId!: string;
}
```

Nel controller (aggiungi `Get` all'import da `@nestjs/common`):

```ts
@Get('retired')
listRetired(): Promise<RetiredUmbrellaDTO[]> {
  return this.umbrellas.listRetired();
}

@Post(':id/retire')
retire(@Param('id', ParseUUIDPipe) id: string): Promise<RetiredUmbrellaDTO> {
  return this.umbrellas.retire(id);
}

@Post(':id/restore')
restore(@Param('id', ParseUUIDPipe) id: string, @Body() body: RestoreUmbrellaDto): Promise<StructureUmbrellaDTO> {
  return this.umbrellas.restore(id, body);
}
```

- [ ] **Step 5: Verifica verde + suite intera api + typecheck**

```bash
npx jest src/establishment/umbrellas.service.spec.ts
npx jest
npx tsc --noEmit -p tsconfig.json
```

Expected: tutti verdi, exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(api): retire/restore/retired per ombrelloni - guardia prenotazioni attive, idempotenza (D-055)"
```

---

### Task 3: Filtri `retiredAt: null` nei punti di contatto esistenti (TDD sui pin)

**Files:**
- Modify: `apps/api/src/establishment/umbrellas.service.ts` (`create:40`, `update:59`, `generate:94`, `bulkDelete:114`, `bulkAssignType:132`)
- Modify: `apps/api/src/bookings/bookings.service.ts:396`
- Modify: `apps/api/src/establishment/establishment.service.ts:25`
- Modify: `apps/api/src/platform/platform-metrics.service.ts:34`
- Modify: `apps/api/src/establishment/umbrella-types.service.ts:69` (SOLO commento)
- Test: `apps/api/src/establishment/umbrellas.service.spec.ts`

**Interfaces:** nessuna nuova; cambia il `where` di query esistenti.

- [ ] **Step 1: Scrivi i pin che falliscono** (stile mock del file):

```ts
it('create: il clash label ignora i ritirati (label riusabile)', async () => {
  // ...setup esistente del caso create felice...
  await service.create({ rowId: 'r-1', label: '12', umbrellaTypeId: null });
  expect(tx.umbrella.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
  );
});

it('generate: i candidati non collidono coi ritirati', async () => {
  // ...setup esistente del caso generate...
  expect(tx.umbrella.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
  );
});

it('bulkDelete/bulkAssignType: operano solo su attivi', async () => {
  // ...analogo: assert su retiredAt: null nel where di findMany/updateMany...
});
```

- [ ] **Step 2: Vedili fallire**

```bash
npx jest src/establishment/umbrellas.service.spec.ts
```

Expected: FAIL — il `where` chiamato non contiene `retiredAt: null`.

- [ ] **Step 3: Applica i filtri**

- `create` L40: `where: { label, retiredAt: null }`
- `update` L59: `where: { label, id: { not: id }, retiredAt: null }`
- `generate` L94: `where: { label: { in: candidates }, retiredAt: null }`
- `bulkDelete` L114: `where: { id: { in: input.ids }, retiredAt: null }`
- `bulkAssignType` L132-133: `where: { id: { in: input.ids }, retiredAt: null }`
- `bookings.service.ts` L396: `tx.umbrella.findFirst({ where: { id: input.umbrellaId, retiredAt: null } })` (il 422 esistente copre anche i ritirati: messaggio invariato)
- `establishment.service.ts` L25: `tx.umbrella.count({ where: { retiredAt: null } })`
- `platform-metrics.service.ts` L34: `tx.umbrella.count({ where: { retiredAt: null } })`
- `umbrella-types.service.ts` L69: NON filtrare; aggiungi sopra la riga:
  ```ts
  // Conta ANCHE i ritirati (D-055): una tipologia referenziata dallo storico non si elimina.
  ```
- Copy del 409 di `remove` (L79) aggiornata:
  ```ts
  if (bookings > 0) throw new ConflictException('Ombrellone con prenotazioni: non eliminabile. Usa «Ritira» per dismetterlo conservando lo storico.');
  ```
  **Attenzione**: cerca con grep `non eliminabile` in `apps/api` e `apps/web-staff` — se qualche test pinna la stringa esatta, aggiornalo nello stesso step.

- [ ] **Step 4: Verde + suite intera + typecheck**

```bash
npx jest
npx tsc --noEmit -p tsconfig.json
```

Expected: verdi (i test dei service toccati che mockano `count`/`findFirst` senza assert sul where restano verdi; quelli con assert sul where vanno allineati SE il pin era legittimo).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): i ritirati escono da clash label, prenotazioni, contatori e bulk (D-055)"
```

---

### Task 4: E2e `establishment-umbrellas-retire`

**Files:**
- Create: `apps/api/test/establishment-umbrellas-retire.e2e-spec.ts` (modellata su `establishment-umbrellas-bulk.e2e-spec.ts`: stesso boot, helper `createUser`/`login`/`createTestApp`, stesso `afterAll` di pulizia)

**Interfaces:** consuma gli endpoint del Task 2 e i filtri del Task 3.

- [ ] **Step 1: Scrivi la suite (fallirà solo se i task 2-3 hanno bug: è il collaudo integrato)**

Seed nel `beforeAll` (calendario congelato: oggi = **2026-07-15**): stabilimento, admin+staff, settore «Retire», fila «F1», ombrelloni `RT-1` (con prenotazione confermata FUTURA: `startDate/endDate 2026-07-20`), `RT-2` (con prenotazione confermata PASSATA: `2026-07-10`), `RT-3` (senza storico). Casi:

```ts
it('403 per staff su retire/restore/retired', ...);          // .expect(403) coi tre endpoint
it('retire di RT-1 (prenotazione futura confermata) → 409', ...);
it('retire di RT-2 (solo storico passato) → 200: sparisce dalla struttura, appare in retired con snapshot', async () => {
  await request(app.getHttpServer()).post(`/establishment/umbrellas/${rt2}/retire`).set(...bearer(adminT)).expect(201);
  const structure = await request(app.getHttpServer()).get('/establishment/structure').set(...bearer(adminT)).expect(200);
  expect(JSON.stringify(structure.body)).not.toContain(rt2);
  const retired = await request(app.getHttpServer()).get('/establishment/umbrellas/retired').set(...bearer(adminT)).expect(200);
  expect(retired.body).toEqual([expect.objectContaining({ id: rt2, label: 'RT-2', retiredFrom: 'Retire · F1' })]);
});
it('la disdetta sblocca: cancella la prenotazione di RT-1 → retire 201', async () => {
  await prisma.forTenant(s1, (tx) => tx.booking.updateMany({ where: { umbrellaId: rt1 }, data: { status: 'cancelled' } }));
  // NB: usa il valore REALE dell'enum status per «cancellata» (verificalo in schema.prisma), non indovinarlo.
  ...post retire → 201
});
it('label riusabile: POST /establishment/umbrellas con label RT-2 → 201 (indice parziale al lavoro)', ...);
it('restore con label occupata da un attivo → 409', ...);    // ripristina RT-2 mentre esiste il nuovo RT-2
it('restore in una fila valida → 201 e riappare in struttura; retired non lo elenca più', async () => {
  // prima elimina il duplicato attivo RT-2 (non ha storico → delete 200), poi restore
});
it('creare una prenotazione su un ritirato → 422', ...);      // POST /bookings con umbrellaId ritirato
```

Date: SOLO letterali dentro la stagione seed; «futuro» = dopo 2026-07-15.

- [ ] **Step 2: Esegui la suite e2e singola**

```bash
npx jest --config test/jest-e2e.json establishment-umbrellas-retire.e2e-spec.ts
```

Expected: PASS. Se un caso fallisce, il bug è nei task 2-3: sistemalo LÌ (con un unit che lo pinna), non piegare la e2e.

- [ ] **Step 3: Batteria e2e completa (in sequenza, DB su)**

```bash
npx jest --config test/jest-e2e.json
```

Expected: 34/34 suite (33 esistenti + questa).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(api): e2e ritiro ombrellone - guardia, sgancio, label riusabile, restore (D-055)"
```

---

### Task 5: FE data layer + MSW

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts` (dopo `establishmentStructure`, riga ~24)
- Modify: `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`
- Modify: `apps/web-staff/src/mocks/server.ts` (accanto agli handler umbrellas, righe ~548-562)

**Interfaces:**
- Consumes: endpoint del Task 2, tipi contracts.
- Produces (per Task 6-7): `useRetiredUmbrellas(): queryResource<RetiredUmbrellaDTO[]>` · `useRetireUmbrella(): mutationResource<string>` (input: id) · `useRestoreUmbrella(): mutationResource<{ id: string; rowId: string }>`. Tutte le mutation invalidano `structureKeys` + `retiredUmbrellas`.

- [ ] **Step 1: queryKeys**

```ts
  retiredUmbrellas: (tenantId: string) => ['establishment', tenantId, 'retired-umbrellas'] as const,
```

- [ ] **Step 2: Hook (stile del file, `structureKeys` esteso localmente)**

In `useEstablishmentStructure.ts` (aggiungi `RetiredUmbrellaDTO`, `RestoreUmbrellaInput` all'import types):

```ts
function retireKeys(establishmentId: string) {
  return [...structureKeys(establishmentId), queryKeys.retiredUmbrellas(establishmentId)];
}

export function useRetiredUmbrellas() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.retiredUmbrellas(session.establishmentId),
    queryFn: () => apiFetch<RetiredUmbrellaDTO[]>('/establishment/umbrellas/retired'),
  });
}

export function useRetireUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<RetiredUmbrellaDTO>(`/establishment/umbrellas/${id}/retire`, { method: 'POST' }),
    invalidates: () => retireKeys(session.establishmentId),
  });
}

export function useRestoreUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & RestoreUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}/restore`, { method: 'POST', body: JSON.stringify({ rowId: vars.rowId }) }),
    invalidates: () => retireKeys(session.establishmentId),
  });
}
```

- [ ] **Step 3: Handler MSW** (in `server.ts`, PRIMA di `http.patch('/api/establishment/umbrellas/:id', ...)` — MSW matcha in ordine e `retired` non deve finire in `:id`):

```ts
  http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([])),
  http.post('/api/establishment/umbrellas/:id/retire', ({ params }) =>
    HttpResponse.json({ id: params.id as string, label: '1', umbrellaTypeId: null, retiredAt: '2026-06-27T10:00:00.000Z', retiredFrom: 'Centro · Fila 1' }, { status: 201 })),
  http.post('/api/establishment/umbrellas/:id/restore', ({ params }) =>
    HttpResponse.json({ id: params.id as string, label: '1', umbrellaTypeId: null }, { status: 201 })),
```

- [ ] **Step 4: Suite web-staff intera + typecheck**

```bash
npx vitest run
pnpm -r typecheck
```

Expected: verdi (nessun consumer ancora: il collaudo vero è nei task 6-7).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web-staff): data layer ritiro ombrellone - query ritirati, mutation retire/restore (D-055)"
```

---

### Task 6: UmbrellaPanel — azione «Ritira» (TDD)

**Files:**
- Modify: `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue`
- Test: `apps/web-staff/src/features/establishment/panels/UmbrellaPanel.spec.ts` se esiste, altrimenti il file spec che oggi copre il pannello (cercalo con grep `umbrella-delete`); stile MSW+`mountApp` degli spec dei pannelli

**Interfaces:** consuma `useRetireUmbrella` (Task 5). Emette `close` a ritiro riuscito (il pannello punta a un ombrellone che non esiste più in struttura).

- [ ] **Step 1: Test che falliscono**

```ts
it('D-055: «Ritira» chiede conferma, chiama la mutation e chiude il pannello con toast', async () => {
  // mount del pannello con isAdmin: true; click su [data-testid="umbrella-retire"];
  // il ConfirmDialog dedicato appare (title «Ritirare l'ombrellone?»); conferma;
  // attende flush → toast 'Ombrellone ritirato.' presente, emitted('close') truthy.
});

it('D-055: staff non vede «Ritira»', () => {
  // isAdmin: false → [data-testid="umbrella-retire"] assente (come umbrella-delete)
});
```

- [ ] **Step 2: Vedili fallire** (`npx vitest run <file spec>`) — Expected: FAIL, testid assente.

- [ ] **Step 3: Implementa**

Nello script del pannello:

```ts
import { useUpdateUmbrella, useDeleteUmbrella, useRetireUmbrella } from '../useEstablishmentStructure';
const retire = useRetireUmbrella();
const retireOpen = ref(false);
function onRetire() {
  retire.mutate(props.umbrella.id, { onSuccess: () => { pushToast('Ombrellone ritirato.'); emit('close'); } });
  retireOpen.value = false;
}
```

(Il pattern `mutate` + `onSuccess` + `emit('close')` è lo stesso di `onDelete`: il pannello resta montato finché la risposta non arriva, quindi le callback NON si perdono — non serve `mutateAsync` qui.)

Nella danger-zone, sotto il bottone Elimina:

```html
        <p class="mb-2 mt-3 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Ha storico? Ritiralo: sparisce dalla spiaggia, lo storico resta e puoi ripristinarlo.</p>
        <Button variant="secondary" data-testid="umbrella-retire" class="w-full" :loading="retire.isPending.value" @click="retireOpen = true">Ritira ombrellone</Button>
```

E il dialog accanto a quello di Elimina:

```html
    <ConfirmDialog v-model:open="retireOpen" title="Ritirare l'ombrellone?"
      description="Sparisce da struttura e mappa; lo storico contabile resta e potrai ripristinarlo dai «Ritirati» del pannello Spiaggia." confirm-label="Ritira" tone="danger" @confirm="onRetire" />
```

Aggiorna anche la copy statica della zona rischiosa («Se ha prenotazioni non sarà eliminato.» resta per Elimina — verifica che i test esistenti sulla copy non si rompano).

- [ ] **Step 4: Suite web-staff intera**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web-staff): azione Ritira nel pannello Ombrellone con conferma dedicata (D-055)"
```

---

### Task 7: BeachPanel — sezione «Ritirati» con Ripristina (TDD)

**Files:**
- Modify: `apps/web-staff/src/features/establishment/panels/BeachPanel.vue`
- Test: lo spec che copre BeachPanel (grep `type-new` per trovarlo); MSW

**Interfaces:** consuma `useRetiredUmbrellas` + `useRestoreUmbrella` (Task 5). Le file per il select vengono da `props.data.sectors[].rows[]` (già nel pannello).

- [ ] **Step 1: Test che falliscono**

```ts
it('D-055: sezione Ritirati con etichetta, posizione e data; assente se lista vuota', async () => {
  // override MSW GET /api/establishment/umbrellas/retired → [{ id: 'u-r', label: '12', umbrellaTypeId: null, retiredAt: '2026-06-20T09:00:00.000Z', retiredFrom: 'Centro · Fila 1' }]
  // → [data-testid="retired-row"] presente con testo '12' e 'Centro · Fila 1'
  // col default MSW ([]) → [data-testid="retired-section"] assente
});

it('D-055: Ripristina chiama la mutation con la fila scelta e mostra il toast', async () => {
  // seleziona la fila nel select [data-testid="retired-restore-row"], click [data-testid="retired-restore"]
  // → toast 'Ombrellone ripristinato.'
});

it('D-055: staff non vede le azioni di ripristino', ...);
```

- [ ] **Step 2: Vedili fallire.** Expected: FAIL, testid assenti.

- [ ] **Step 3: Implementa**

Sezione dopo il blocco Tipologie (stesso linguaggio visivo: `hr`, label uppercase, righe con bordo). Struttura:

```html
      <template v-if="retired.data.value?.length">
        <hr class="border-0 border-t border-[var(--color-border-row)]">
        <div data-testid="retired-section">
          <div class="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ritirati ({{ retired.data.value.length }})</div>
          <div v-for="u in retired.data.value" :key="u.id" data-testid="retired-row" class="border-b border-[var(--color-border-row)] py-2 last:border-0">
            <div class="flex items-baseline gap-2">
              <span class="text-[12.5px] font-bold">{{ u.label }}</span>
              <span class="text-[11px] text-[var(--color-text-muted)]">{{ u.retiredFrom ?? 'posizione sconosciuta' }} · ritirato il {{ formatDate(u.retiredAt) }}</span>
            </div>
            <div v-if="isAdmin" class="mt-1.5 flex items-center gap-2">
              <Select v-model="restoreRowByUmbrella[u.id]" data-testid="retired-restore-row" class="flex-1">
                <option value="" disabled>Fila di destinazione…</option>
                <option v-for="r in allRows" :key="r.id" :value="r.id">{{ r.sectorName }} · {{ r.label }}</option>
              </Select>
              <Button size="sm" data-testid="retired-restore" :disabled="!restoreRowByUmbrella[u.id] || restore.isPending.value"
                :loading="restore.isPending.value" @click="onRestore(u.id)">Ripristina</Button>
            </div>
          </div>
          <p class="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Un ritirato non è in spiaggia né prenotabile; lo storico resta. Ripristinandolo torna in coda alla fila scelta.</p>
        </div>
      </template>
```

Script:

```ts
import { useRetiredUmbrellas, useRestoreUmbrella } from '../useEstablishmentStructure';
const retired = useRetiredUmbrellas();
const restore = useRestoreUmbrella();
const restoreRowByUmbrella = ref<Record<string, string>>({});
const allRows = computed(() =>
  props.data.sectors.flatMap((s) => s.rows.map((r) => ({ id: r.id, label: r.label, sectorName: s.name }))));
function onRestore(id: string) {
  const rowId = restoreRowByUmbrella.value[id];
  if (!rowId) return;
  restore.mutate({ id, rowId }, { onSuccess: () => pushToast('Ombrellone ripristinato.') });
}
```

`formatDate`: riusa l'utility di formattazione data già in uso in web-staff (grep `toLocaleDateString\|formatDate` e usa quella; NON crearne una nuova se esiste). Niente ConfirmDialog: il ripristino è costruttivo (regola §14: conferme solo distruttive).

- [ ] **Step 4: Suite web-staff intera + typecheck**

```bash
npx vitest run
pnpm -r typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web-staff): sezione Ritirati nel pannello Spiaggia con ripristino in fila (D-055)"
```

---

### Task 8: Documentazione (Definition of Done design-docs)

**Files:**
- Create: `docs/architecture/decisions/0053-ritiro-ombrellone-soft-delete.md`
- Modify: `docs/design/data-model.md` (ER `Umbrella` + invariante label, ~L460)
- Modify: `docs/design/design-system.md` §14.4 (tabella pannelli: righe Ombrellone e Spiaggia)

**Interfaces:** nessuna (docs).

- [ ] **Step 1: ADR-0053** — formato del repo (guarda ADR-0052 per lo stile): Status Accepted; Context (guardia block-409 + FK RESTRICT, gap dimostrato, D-055); Decision (retiredAt + sgancio fila + indice unico parziale; archivio+restore; guardia su prenotazioni confermate non concluse); Alternatives (retiredAt senza sgancio → filtri sparsi e file ineliminabili; tabella archivio → rompe la FK dello storico; rinomina label → storico mutato); Consequences (label riusabile ⇒ due «12» in epoche diverse nello storico: accettato; `rowId` nullable nel tipo; indice parziale invisibile al DSL Prisma, documentato nello schema).

- [ ] **Step 2: data-model.md** — nel blocco ER di `Umbrella` aggiungi `retiredAt`/`retiredFrom` e marca `rowId` opzionale; correggi l'invariante: «**unico tra gli ATTIVI** per Establishment (indice parziale, D-055/ADR-0053); i ritirati conservano la label a fini storici».

- [ ] **Step 3: design-system.md §14.4** — riga **Ombrellone**: aggiungi «Ritira (danger-zone, conferma dedicata)»; riga **Spiaggia**: aggiungi «sezione Ritirati (N) con Ripristina in fila». Se §14 ha prose sui pannelli coinvolti, allineala.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: ADR-0053 ritiro ombrellone, ER e design-system aggiornati (D-055)"
```

---

### Verifica finale (controller, fuori dai task)

1. Batteria COMPLETA in sequenza: web-staff `npx vitest run` → api `npx jest` → `npx tsc --noEmit -p tsconfig.json` (api) → `pnpm -r typecheck` → e2e `npx jest --config test/jest-e2e.json` (34/34) → web-platform e web-customer `npx vitest run`.
2. Review finale whole-branch (modello top) + fix-loop con re-review: non si salta.
3. **Gate visivo utente** (feature UI nuova): login utente su dev, provare ritiro/archivio/ripristino dal Cantiere.
4. Handoff + chiusura D-055 in `deferred.md` + merge SOLO con ok esplicito.
