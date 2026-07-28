# D-063 — Permessi dello staff configurabili per operatore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** L'admin di un lido decide, operatore per operatore, cosa il proprio `staff` può fare,
sostituendo la tabella statica `PERMISSION_ROLES` come *risoluzione* senza toccare le ~60
annotazioni `@RequiresPermission`.

**Architecture:** Una tabella `StaffPermissionOverride` chiavata su `(userId, permission)` contiene
un **delta** sul default di fabbrica; assenza di riga = default. Sta **fuori da RLS** come `User`,
di cui è un attributo, e l'invariante di tenant è imposta da una **FK composita**
`(userId, establishmentId) → User(id, establishmentId)`. `PermissionsGuard` diventa asincrono e
consulta un `StaffPermissionsService` **solo** per il ruolo `staff`. `Permission` si sposta in
`@coralyn/contracts` e `UserDTO` porta l'insieme effettivo, così il gating del frontend passa dal
ruolo al permesso con un solo meccanismo.

**Tech Stack:** NestJS + Prisma (PostgreSQL) · Vue 3 + Pinia + TanStack Query + ui-kit · contracts in
`@coralyn/contracts` · test: Jest (api, e2e `maxWorkers: 1`, calendario congelato 2026-07-15) +
Vitest (FE, MSW in web-staff).

**Spec:** [2026-07-27-permessi-configurabili-d063-design.md](../specs/2026-07-27-permessi-configurabili-d063-design.md) ·
**Decisione:** [ADR-0063](../../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md)

## Global Constraints

- **Baseline da non far scendere:** legal 11 · ui-kit 212 · data-layer 32 · web-platform 23 ·
  web-customer 35 · web-staff 415 · docs-lint 68 · api unit 387 · api e2e 507 = **1690**.
  `pnpm run test` = 1183/180, `test:e2e` = 507/43, typecheck 9 progetti, lint 0 errori.
- **Migration**: `prisma migrate dev --create-only`, **leggere l'SQL**, appendere a mano ciò che
  Prisma non genera (indice unico su `User`, FK composita), poi `migrate deploy` su **entrambi** i
  DB (`coralyn_dev` **e** `coralyn_test`). ⚠️ Dimenticare `coralyn_test` = 43 suite rosse per niente.
- **`prisma generate` PRIMA del typecheck**, sempre.
- **`ApiError` SEMPRE da `@coralyn/data-layer`**. **`@IsUUID` è vietato dal lint** → `@IsUuidShape()`.
- **Un endpoint senza `@RequiresPermission` dà 403** e `authorization-coverage.spec.ts` lo intercetta.
- **Su template Vue usa `Edit`, non regex**: in `sed` le parentesi sono letterali e mangiano il codice.
- **Suite di pacchetti diversi una alla volta**; e2e `maxWorkers: 1` (un solo DB condiviso).
- **`packages/contracts/dist` è tracciato in CRLF**: dopo ogni `pnpm install` fai
  `git checkout -- packages/contracts/dist`. **Non committarlo.**
- **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo prima di linkarlo.
- **Copy utente in italiano**, niente em dash `—` nel testo dell'interfaccia.

---

## File Structure

**Creati**

| File | Responsabilità |
|---|---|
| `apps/api/prisma/migrations/<ts>_staff_permission_override/migration.sql` | tabella, indice unico su `User`, FK composita |
| `apps/api/src/identity/staff-permissions.service.ts` | l'unica risoluzione: default di fabbrica + override |
| `apps/api/src/identity/staff-permissions.service.spec.ts` | unit della risoluzione |
| `apps/api/src/establishment/dto/update-staff-permissions.dto.ts` | validazione del `PUT` |
| `apps/api/test/staff-permissions.e2e-spec.ts` | amministrazione, cross-tenant, FK composita |
| `apps/web-staff/src/features/establishment/StaffPermissionsModal.vue` | i 17 interruttori |
| `apps/web-staff/src/features/establishment/StaffPermissionsModal.spec.ts` | test del modale |

**Modificati**

| File | Cosa cambia |
|---|---|
| `packages/contracts/src/index.ts` | `Permission`, `CONFIGURABLE_PERMISSIONS`, `PERMISSION_LABELS`, `UserDTO.permissions`, `StaffPermissionsDTO`, `UpdateStaffPermissionsInput` |
| `apps/api/prisma/schema.prisma` | modello `StaffPermissionOverride` + relazione su `User` |
| `apps/api/src/identity/permission.ts` | importa `Permission` dai contracts; tiene `PERMISSION_ROLES`, `roleHasPermission` |
| `apps/api/src/identity/permissions.guard.ts` | `async`, consulta il service solo per `staff` |
| `apps/api/src/identity/permissions.guard.spec.ts` | casi override presente/assente/guasto |
| `apps/api/src/identity/identity.module.ts` | provvede **ed esporta** `StaffPermissionsService` |
| `apps/api/src/identity/identity.service.ts` | `me()` popola `permissions` |
| `apps/api/src/establishment/establishment-users.service.ts` | `permissionsOf` / `setPermissions` |
| `apps/api/src/establishment/establishment-users.controller.ts` | `GET`/`PUT` `:id/permissions` |
| `apps/api/src/establishment/establishment.module.ts` | importa `IdentityModule` |
| `apps/api/test/rls-isolation.e2e-spec.ts` | voce in `SENZA_RLS` con il suo perché |
| `apps/api/test/authorization-staff.e2e-spec.ts` | concesso vs revocato nella stessa suite |
| `apps/web-staff/src/stores/session.ts` | `hasPermission(p)` |
| `apps/web-staff/src/router/index.ts` | `meta.role` → `meta.permission` |
| `apps/web-staff/src/app/SidebarNav.vue` | ogni voce porta il suo permesso |
| 4 viste + 10 componenti | `isAdmin` → booleano derivato dal permesso, prop rinominata |
| `apps/web-staff/src/mocks/server.ts` | `permissions` in `/auth/me` e `/auth/login`; handler dei permessi |
| `docs/architecture/deferred.md` | D-063 → chiusa |
| `docs/architecture/data-model.md` | ER: entità nuova |

---

## Task 1 — Il vocabolario si sposta nei contracts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/identity/permission.ts`
- Modify: ogni file api che importa `Permission` (~25 controller)
- Test: `apps/api/src/identity/authorization-coverage.spec.ts` (solo la riga di `import`)

**Interfaces — Produces:**

```ts
export enum Permission { MapRead = 'map.read', /* … 19 voci, valori invariati … */ }

/** I 17 che l'admin del lido può concedere o revocare al proprio staff (ADR-0063 §5.1). */
export const CONFIGURABLE_PERMISSIONS: readonly Permission[];

/** Etichetta italiana per l'interruttore. Una per ciascuno dei 17. */
export const PERMISSION_LABELS: Readonly<Record<Permission, string>>;

export interface UserDTO { /* … */ permissions: Permission[] }
```

- [ ] **Step 1:** spostare l'enum `Permission` **verbatim** (valori stringa invariati: sono già in
      configurazione, ADR-0057) da `apps/api/src/identity/permission.ts` a
      `packages/contracts/src/index.ts`, commenti compresi.
- [ ] **Step 2:** in `permission.ts` sostituire la definizione con
      `import { Permission } from '@coralyn/contracts'` + `export { Permission }`, e aggiungere
      `NON_CONFIGURABLE`/`CONFIGURABLE_PERMISSIONS` nei contracts.
- [ ] **Step 3:** aggiornare gli import nei controller. Verifica meccanica:
      `grep -rn "from '.*identity/permission'" apps/api/src | wc -l` prima e dopo.
- [ ] **Step 4:** `pnpm --filter @coralyn/contracts build && pnpm --filter @coralyn/api exec prisma generate && pnpm run typecheck`
      → 9 progetti, exit 0.
- [ ] **Step 5:** `pnpm --filter @coralyn/api test` → **387**, invariato. In particolare
      `authorization-coverage.spec.ts` verde con le **asserzioni intatte**.

⚠️ Se `authorization-coverage.spec.ts` cade su qualcosa che non sia l'import, la slice ha cambiato
il **vocabolario** invece della risoluzione: fermarsi e capire.

---

## Task 2 — Migration: tabella, indice unico, FK composita

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_staff_permission_override/migration.sql`
- Modify: `apps/api/test/rls-isolation.e2e-spec.ts`

- [ ] **Step 1:** aggiungere al modello `User` la relazione inversa
      `permissionOverrides StaffPermissionOverride[]`, e il modello nuovo:

```prisma
/// Delta sul default di fabbrica PERMISSION_ROLES, per singolo operatore (ADR-0063).
/// Assenza di riga = default: un lido che non configura nulla non si accorge della slice.
/// FUORI da RLS come `User`, di cui è un attributo — dichiarato in rls-isolation.e2e-spec.ts.
/// ⚠️ L'invariante di tenant è una FK COMPOSITA (userId, establishmentId) → User(id, establishmentId)
/// che il DSL Prisma non esprime insieme alla relazione semplice: vive nella migration.
model StaffPermissionOverride {
  userId          String   @db.Uuid
  establishmentId String   @db.Uuid
  permission      String
  granted         Boolean
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, permission])
  @@index([establishmentId])
}
```

- [ ] **Step 2:** `DATABASE_URL=…coralyn_dev pnpm --filter @coralyn/api exec prisma migrate dev --create-only --name staff_permission_override`
- [ ] **Step 3:** **leggere** l'SQL generato e appendere a mano ciò che Prisma non genera:

```sql
-- L'invariante che sostituisce RLS su questa tabella (ADR-0063 §4 della Decision).
-- Senza questo indice la FK composita non è creabile: Postgres pretende un vincolo univoco
-- sulle colonne referenziate.
CREATE UNIQUE INDEX "User_id_establishmentId_key" ON "User"("id", "establishmentId");

-- Rende NON RAPPRESENTABILE la riga che rivendica un tenant diverso da quello dell'operatore.
-- ⚠️ Non può mai matchare un superuser (establishmentId NULL, e NULL non uguaglia nulla): il
-- superuser è così strutturalmente incapace di detenere permessi tenant-scoped (ADR-0039).
ALTER TABLE "StaffPermissionOverride"
  ADD CONSTRAINT "StaffPermissionOverride_user_tenant_fkey"
  FOREIGN KEY ("userId", "establishmentId") REFERENCES "User"("id", "establishmentId")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

⚠️ **Nessuna policy RLS su questa tabella**, ed è una decisione, non una dimenticanza: motivata in
ADR-0063 e dichiarata al passo 5.

- [ ] **Step 4:** `migrate deploy` su `coralyn_dev` **e** su `coralyn_test`.
- [ ] **Step 5:** in `rls-isolation.e2e-spec.ts`, aggiungere a `SENZA_RLS`:

```ts
StaffPermissionOverride:
  'attributo di User, che è già fuori: la riga cross-tenant è impedita dalla FK composita ' +
  '(userId, establishmentId) → User(id, establishmentId), non dalla policy — ADR-0063',
```

- [ ] **Step 6:** `pnpm --filter @coralyn/api test:e2e -t "RLS"` → verde, e `conRls` resta **22**.

---

## Task 3 — La risoluzione

**Files:**
- Create: `apps/api/src/identity/staff-permissions.service.ts`
- Create: `apps/api/src/identity/staff-permissions.service.spec.ts`
- Modify: `apps/api/src/identity/identity.module.ts`

**Interfaces — Produces:**

```ts
@Injectable()
export class StaffPermissionsService {
  /** Il singolo permesso. Zero letture se role ≠ staff. */
  has(user: { id: string; role: Role }, permission: Permission): Promise<boolean>;
  /** L'insieme effettivo, per UserDTO e per la schermata admin. */
  effectiveFor(user: { id: string; role: Role }): Promise<Permission[]>;
}
```

- [ ] **Step 1 — test che fallisce.** Casi, con un fake di Prisma che **conta le query**:
      (a) `role: admin` → risponde dalla tabella statica e **non legge** (contatore a 0);
      (b) `staff` senza override → default di fabbrica;
      (c) `staff` con `granted: false` su un permesso che il default concede → **negato**;
      (d) `staff` con `granted: true` su un permesso che il default nega → **concesso**;
      (e) la lettura lancia → il metodo **propaga**, non risponde `false`;
      (f) `effectiveFor` su `staff` con un override in ciascun verso → l'array riflette entrambi.

⚠️ Il caso (a) è il presidio del «solo lo staff legge»: senza contatore di query, quel requisito
non è verificato da nulla.
⚠️ Il caso (e) distingue fail-closed da «rispondi 403 mentendo sulla causa». Deve asserire
`rejects.toThrow`, **non** un booleano.

- [ ] **Step 2:** eseguire → FAIL («Cannot find module './staff-permissions.service'»).
- [ ] **Step 3:** implementare. Una sola lettura, l'intero insieme in un round trip:

```ts
private async overridesOf(userId: string): Promise<Map<string, boolean>> {
  const rows = await this.prisma.staffPermissionOverride.findMany({
    where: { userId },
    select: { permission: true, granted: true },
  });
  return new Map(rows.map((r) => [r.permission, r.granted]));
}
```

- [ ] **Step 4:** eseguire → PASS.
- [ ] **Step 5:** provvedere **ed esportare** il service da `IdentityModule`.
      ⚠️ **Non ri-provvederlo altrove**: è l'errore che `crypto.module.ts` ha dovuto correggere per
      `PasswordHasher`, ri-provveduto da 5 moduli (brief §5).

---

## Task 4 — Il guard consulta la risoluzione

**Files:**
- Modify: `apps/api/src/identity/permissions.guard.ts`
- Modify: `apps/api/src/identity/permissions.guard.spec.ts`

- [ ] **Step 1 — test che fallisce:** ai 7 casi esistenti aggiungere override concesso, override
      revocato, e guasto della lettura → la richiesta fallisce.
- [ ] **Step 2:** eseguire → FAIL.
- [ ] **Step 3:** rendere `canActivate` asincrono e sostituire la riga di risoluzione:

```ts
const user = req.user;
if (!user?.role || !(await this.staffPermissions.has(user, required))) {
  throw new ForbiddenException('Permesso non concesso');
}
```

⚠️ `PermissionsGuard` **non può iniettare `TenantContext`** (request-scoped: renderebbe
request-scoped il guard e la catena). Legge `req.user`, che porta già `id` e `role` dal token.

- [ ] **Step 4:** eseguire → PASS. `pnpm --filter @coralyn/api test` → **387 + i nuovi**.
- [ ] **Step 5 — mutazione come prova, nei due versi.** Sostituire la consultazione degli override
      con il solo `roleHasPermission`: contare *quanti* e *quali* test diventano rossi e annotarlo.
      ⚠️ Se la suite resta verde, gli override non sono mai realmente consultati.
      ⚠️ Se la mutazione non compila non prova nulla: `Tests: 0 total` = hai testato il compilatore.

---

## Task 5 — API di amministrazione

**Files:**
- Modify: `apps/api/src/establishment/establishment-users.service.ts`
- Modify: `apps/api/src/establishment/establishment-users.controller.ts`
- Create: `apps/api/src/establishment/dto/update-staff-permissions.dto.ts`
- Modify: `apps/api/src/establishment/establishment.module.ts`

**Interfaces — Produces:**
- `GET  /establishment/users/:id/permissions` → `StaffPermissionsDTO`
- `PUT  /establishment/users/:id/permissions` body `UpdateStaffPermissionsInput` → `StaffPermissionsDTO`

- [ ] **Step 1:** DTO con `@IsArray()` + `@IsIn(CONFIGURABLE_PERMISSIONS, { each: true })`.
      ⚠️ **`@IsUUID` è vietato dal lint**; qui non serve, l'`:id` segue lo stile già in uso nel
      controller (`@Param('id') id: string`, 404 dal `findFirst`).
- [ ] **Step 2 — test che fallisce** (e2e): admin configura, rilegge, ottiene ciò che ha scritto.
- [ ] **Step 3:** implementare `setPermissions`. Il body è **l'insieme completo desiderato fra i 17**;
      il server persiste **solo lo scarto** dal default di fabbrica:

```ts
const desired = new Set(input.permissions);
const rows = CONFIGURABLE_PERMISSIONS
  .filter((p) => desired.has(p) !== roleHasPermission(Role.Staff, p))
  .map((p) => ({ userId: target.id, establishmentId: tenantId, permission: p, granted: desired.has(p) }));
await this.prisma.$transaction([
  this.prisma.staffPermissionOverride.deleteMany({ where: { userId: target.id } }),
  this.prisma.staffPermissionOverride.createMany({ data: rows }),
]);
```

⚠️ `createMany` e **non** un loop di `create`: è la lezione di [ADR-0062](../../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md),
e qui il cap è 17.

- [ ] **Step 4:** errori — target inesistente **o di un altro lido** → `404` (stesso
      `findFirst({ id, establishmentId: tenantId })` di `resetPassword`/`setDisabled`);
      target con ruolo `admin` → `422`; permesso non configurabile nel body → `400`.
- [ ] **Step 5:** `EstablishmentModule` importa `IdentityModule`.
      ⚠️ Verificato: nessun ciclo (IdentityModule → CredentialModule → MailModule).
- [ ] **Step 6:** `pnpm --filter @coralyn/api test:e2e` → 507 + i nuovi, **nessuna** in meno.

---

## Task 6 — I presìdi di autorizzazione

**Files:**
- Modify: `apps/api/test/authorization-staff.e2e-spec.ts`
- Create: `apps/api/test/staff-permissions.e2e-spec.ts`

- [ ] **Step 1:** in `authorization-staff.e2e-spec.ts`, **nella stessa suite**, un secondo lido il
      cui staff ha `pricing.manage` **revocato**: `GET /api/seasons` → **403** per lui, e resta
      **non-403** per il primo. ⚠️ Regola dell'audit: se il titolo dice «invece di», il fixture deve
      contenere l'alternativa.
- [ ] **Step 2:** e2e **cross-tenant**: il lido A revoca `pricing.manage` al proprio staff; lo staff
      del lido B **non** è toccato.
- [ ] **Step 3:** e2e sulla **FK composita**: `INSERT` diretto di un override con
      l'`establishmentId` dell'altro lido → respinto **dal database** (`23503`), non dal service.
      ⚠️ Va scritto in SQL grezzo: passare dal service proverebbe il service, non il vincolo.
- [ ] **Step 4:** e2e sui **non configurabili**: `PUT` che tenta `session.read` → **400**.
- [ ] **Step 5:** `pnpm --filter @coralyn/api test:e2e` → verde, e annotare il totale nuovo.

---

## Task 7 — Il contratto arriva al frontend

**Files:**
- Modify: `apps/api/src/identity/identity.service.ts` (`me()` e `login()` popolano `permissions`)
- Modify: `apps/web-staff/src/stores/session.ts`
- Modify: `apps/web-staff/src/mocks/server.ts`

- [ ] **Step 1 — test che fallisce:** `session.hasPermission(Permission.PricingManage)` è `true`
      con il permesso nell'utente e `false` senza; ed è `false` a sessione assente
      (⚠️ **fail-closed anche nel FE**: `user === null` non deve concedere).
- [ ] **Step 2:** eseguire → FAIL.
- [ ] **Step 3:** implementare:

```ts
const permissions = computed<readonly Permission[]>(() => user.value?.permissions ?? []);
function hasPermission(p: Permission): boolean { return permissions.value.includes(p); }
```

- [ ] **Step 4:** aggiornare i mock MSW di `/auth/login` e `/auth/me` con `permissions`.
- [ ] **Step 5:** `pnpm --filter @coralyn/web-staff test` → **415 + i nuovi**, nessuno in meno.

---

## Task 8 — Il gating passa dal ruolo al permesso

**Files:**
- Modify: `apps/web-staff/src/app/SidebarNav.vue` · `router/index.ts` ·
  `features/customers/CustomerDetailView.vue` · `features/establishment/EstablishmentView.vue` ·
  `features/establishment/EstablishmentStructureView.vue` · `features/map/MapView.vue` ·
  `features/establishment/useEstablishment.ts` · `features/onboarding/useSetupStatus.ts`
- Modify (rinomina della prop): `CustomerAccessCard.vue` · `CustomerSubscriptionsCard.vue` ·
  `InspectorPanels.vue` · `StructureScene.vue` · `StructureRow.vue` ·
  `panels/{Beach,Multi,Row,Sector,Umbrella}Panel.vue`

- [ ] **Step 1:** `SidebarNav.vue` — ogni voce porta il proprio permesso e compare solo se detenuto.
      ⚠️ È il punto che rende la slice **visibile**: oggi `operativeNav` è mostrato a **ogni** ruolo.
- [ ] **Step 2:** `router/index.ts` — `meta.role` → `meta.permission`; la guardia confronta col
      permesso. ⚠️ **La guardia deve restare fail-closed**: rotta con `meta.permission` non detenuto
      → redirect a `map`, mai «passa».
- [ ] **Step 3:** le 4 derivazioni di `isAdmin` diventano booleani derivati dal permesso giusto
      (`structure.manage` per Mappa e Struttura, `team.manage`/`establishment.manage` per
      Stabilimento, `bookings.administer`/`customers.erase` per la Scheda cliente).
- [ ] **Step 4:** rinominare la prop nei 10 componenti che la ricevono: `isAdmin` diceva *chi sei*,
      il booleano nuovo dice *cosa puoi*, e tenere il vecchio nome sarebbe una bugia.
      ⚠️ **Su template Vue usa `Edit`, non regex.**
- [ ] **Step 5:** `pnpm --filter @coralyn/web-staff test` → verde; aggiornare i test che
      impostavano il ruolo per ottenere l'accesso.
- [ ] **Step 6 — mutazione:** concedere tutto nel mock e verificare che le voci compaiano; negarlo e
      verificare che spariscano. Contare i test coinvolti.

---

## Task 9 — La schermata

**Files:**
- Create: `apps/web-staff/src/features/establishment/StaffPermissionsModal.vue` + `.spec.ts`
- Modify: `apps/web-staff/src/features/establishment/useEstablishment.ts` (2 hook)
- Modify: `apps/web-staff/src/features/establishment/EstablishmentView.vue` (l'azione sulla riga)

- [ ] **Step 1:** hook `useStaffPermissions(id)` e `useSetStaffPermissions()`, sullo stile dei 4 già
      presenti nel file, con invalidazione della query del team.
- [ ] **Step 2:** il modale: 17 interruttori con `PERMISSION_LABELS`, stato iniziale = insieme
      effettivo, salvataggio = `PUT` dell'insieme completo.
      ⚠️ Componente a sé sul modello di `LegalProfileModal.vue`: `EstablishmentView.vue` è già a 286
      righe.
- [ ] **Step 3:** l'azione compare **solo sulle righe con ruolo `staff`** (ADR-0063 §2.2).
- [ ] **Step 4:** test: render dei 17, salvataggio che manda l'insieme giusto, e **assenza**
      dell'azione sulle righe `admin`.
- [ ] **Step 5:** `pnpm --filter @coralyn/web-staff test` → verde.

---

## Task 10 — Documenti e chiusura

**Files:**
- Modify: `docs/architecture/deferred.md` (D-063 → chiusa, indice e riga dei conteggi)
- Modify: `docs/architecture/data-model.md` (ER: entità nuova)
- Create: `docs/handoff/2026-07-27-d063-permessi-configurabili.md`

- [ ] **Step 1:** ⚠️ **Leggere `deferred-registry.ts` PRIMA di spostare la voce.** Il parser tratta
      ogni riga `- **D-0NN**` come voce nuova e pretende: indice **ordinato per numero**, anchor
      uguale all'ID, indice e voci coincidenti ID-per-ID **e stato-per-stato**, e la riga
      «Aperte: N · Chiuse: N · totale N» **agganciata al conteggio**. Ha già bocciato il suo autore.
- [ ] **Step 2:** aggiornare l'ER in `data-model.md` con `StaffPermissionOverride` e la FK composita.
- [ ] **Step 3:** `pnpm --filter @coralyn/docs-lint test` → **68**, verde.
- [ ] **Step 4:** gate completo: `pnpm run lint` (0 errori), `pnpm run typecheck` (9),
      `pnpm run test`, `pnpm --filter @coralyn/api test:e2e`. **Nessuna suite scende.**
- [ ] **Step 5:** `git status` — ⚠️ se `packages/contracts/dist` risulta modificato con `git diff`
      **vuoto**, è il CRLF: `git checkout -- packages/contracts/dist`.
- [ ] **Step 6:** **review avversariale** prima di proporre il merge (cinque lenti, ogni finding a
      due scettici). ⚠️ **Leggere le refutazioni per intero, non solo i verdetti**: nella sessione 10
      il difetto più caro stava dentro un finding che entrambi gli scettici avevano refutato.
- [ ] **Step 7:** un **commit denso**, poi chiedere l'ok per il fast-forward su `main`.

---

## Verifica finale (dalla spec §8)

- `authorization-coverage.spec.ts` verde **senza modifiche alle asserzioni**.
- Concesso e revocato **nella stessa suite**; un e2e cross-tenant; la FK composita provata in SQL.
- `rls-isolation.e2e-spec.ts`: `conRls` resta **22**, la tabella nuova è in `SENZA_RLS` col perché.
- **Mutazione nei due versi**, contando *quanti* e *quali* test cadono — anche sui presìdi scritti qui.
- Totale dei test **non scende**: 1690 + i nuovi.
