# Nome stabilimento reale (`UserDTO.establishmentName`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Esporre il nome dello stabilimento via `/auth/me` (`UserDTO.establishmentName`) e leggerlo nel FE, eliminando i due hardcode ("Lido Maestrale" nello store e nel sottotitolo Mappa + il conteggio finto "47 ombrelloni").

**Architecture:** Cambio **contracts-first cross-cutting**. `UserDTO` guadagna `establishmentName: string | null`; `identity.service` lo popola includendo la relazione establishment nella query utente (consolidando la verifica di sospensione del login in una sola query). Il FE store lo espone come computed dalla sessione; il sottotitolo Mappa perde nome+conteggio finto.

**Tech Stack:** NestJS + Prisma (API), Jest/ts-jest (api unit+e2e), Vue 3 + Pinia + Vitest (FE), `@coralyn/contracts` condiviso.

## Global Constraints

- **Package manager:** `corepack pnpm` — MAI `npm`. Se pnpm chiede di purgare `node_modules` senza TTY → `CI=true corepack pnpm install`.
- **Gotcha contracts:** `@coralyn/contracts` compila in `dist/` (gitignored). Dopo ogni modifica a `packages/contracts/src/index.ts` → **`corepack pnpm --filter @coralyn/contracts build`** PRIMA di typecheck/test (api e FE). api e2e (ts-jest) TYPE-CHECKA l'intero progetto → contracts+BE allineati nello **stesso task**.
- **api e2e autoritativi con `--runInBand`** (flaky in parallelo su questa macchina): `corepack pnpm --filter @coralyn/api test:e2e --runInBand`.
- **Comandi:**
  - contracts build: `corepack pnpm --filter @coralyn/contracts build`
  - api unit: `corepack pnpm --filter @coralyn/api test`
  - api e2e: `corepack pnpm --filter @coralyn/api test:e2e --runInBand`
  - api typecheck: `corepack pnpm --filter @coralyn/api typecheck` (se presente; altrimenti l'e2e ts-jest copre il type-check)
  - web-staff: `corepack pnpm --filter web-staff test` / `... typecheck`
  - web-platform: `corepack pnpm --filter web-platform test` / `... typecheck`
- **Baseline (LIVE su main):** api unit **200** · api e2e **235** · web-staff **253** · web-platform **16** · typecheck pulito.
- **Behavior-preserving:** la logica di login (401 generici per credenziali/disabilitato/lido sospeso; superuser mai sospeso) resta **identica**; cambia solo il numero di query (consolidamento).
- **Branch:** `establishment-name` (creato). Nessun push senza ok esplicito.

---

### Task 1: contracts + backend (`UserDTO.establishmentName`, `/auth/me`, login consolidato)

**Files:**
- Modify: `packages/contracts/src/index.ts` (UserDTO)
- Modify: `apps/api/src/identity/identity.service.ts` (toDTO + login + me)
- Test: `apps/api/src/identity/identity.service.spec.ts` (riscrive i 3 test login)
- Test: `apps/api/test/auth.e2e-spec.ts` (asserzioni establishmentName)

**Interfaces:**
- Produces: `UserDTO.establishmentName: string | null` (null per superuser). `login`/`me` restituiscono il nome dell'establishment dell'utente.

- [ ] **Step 1: Aggiornare il contract + i test (RED)**

In `packages/contracts/src/index.ts`, estendere `UserDTO`:

```ts
export interface UserDTO {
  id: string;
  email: string;
  role: Role;
  establishmentId: string | null;
  establishmentName: string | null;
}
```

Riscrivere `apps/api/src/identity/identity.service.spec.ts` (rimuove il mock di `establishment.findUnique`; l'establishment è ora incluso nello `user`):

```ts
import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

function makeService(user: any) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as any;
  const hasher = { verify: jest.fn().mockResolvedValue(true) } as any;
  const tokens = { sign: jest.fn().mockReturnValue('signed-token') } as any;
  return { service: new IdentityService(prisma, hasher, tokens), prisma, tokens };
}

const ADMIN = {
  id: 'u-1', email: 'a@lido.it', passwordHash: 'h', role: 'admin', disabledAt: null,
  establishmentId: 'e-1', establishment: { name: 'Lido Test', suspendedAt: null },
};

describe('IdentityService.login', () => {
  it('lido sospeso → 401 generico, nessun token', async () => {
    const { service, tokens } = makeService({ ...ADMIN, establishment: { name: 'Lido Test', suspendedAt: new Date() } });
    await expect(service.login({ email: 'a@lido.it', password: 'pw' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('lido attivo → login ok, dto con establishmentName', async () => {
    const { service } = makeService(ADMIN);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(res.user.establishmentName).toBe('Lido Test');
  });

  it('superuser (establishment null) → nessun controllo sospensione, login ok, establishmentName null', async () => {
    const su = { ...ADMIN, id: 'su-1', role: 'superuser', establishmentId: null, establishment: null };
    const { service } = makeService(su);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(res.user.establishmentName).toBeNull();
  });
});
```

In `apps/api/test/auth.e2e-spec.ts`, aggiungere le asserzioni `establishmentName`:

- nel test "login valido", nel `toMatchObject` della `res.body.user`, aggiungere `establishmentName: 'Auth E2E'`:

```ts
    expect(res.body.user).toMatchObject({
      email: 'admin.auth@e2e.test',
      role: 'admin',
      establishmentId: estId,
      establishmentName: 'Auth E2E',
    });
```

- nel test "GET /me con Bearer valido", estendere il `toMatchObject`:

```ts
      .expect((r) => expect(r.body).toMatchObject({ email: 'admin.auth@e2e.test', role: 'admin', establishmentName: 'Auth E2E' }));
```

- nel test "superuser", aggiungere l'asserzione del nome null accanto a `establishmentId`:

```ts
      .expect((r) => {
        expect(r.body.establishmentId).toBeNull();
        expect(r.body.establishmentName).toBeNull();
      });
```

- [ ] **Step 2: Build contracts + eseguire i test (verificare RED)**

Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `corepack pnpm --filter @coralyn/api test -- identity.service.spec`
Expected: FAIL — `res.user.establishmentName` è `undefined` (toDTO non lo popola ancora); il test sospeso può passare ma i test "attivo"/"superuser" falliscono sull'asserzione establishmentName.

- [ ] **Step 3: Implementare `identity.service.ts`**

`toDTO` accetta l'establishment incluso e popola il nome:

```ts
  /** Proietta una riga User (con establishment incluso) nel DTO condiviso (mai passwordHash). */
  private toDTO(u: User & { establishment: { name: string } | null }): UserDTO {
    // I valori dell'enum Role del DB coincidono con quelli dei contracts.
    return {
      id: u.id,
      email: u.email,
      role: u.role as Role,
      establishmentId: u.establishmentId,
      establishmentName: u.establishment?.name ?? null,
    };
  }
```

`login`: includere l'establishment (nome + suspendedAt) nell'unica query utente e usarlo per la verifica di sospensione (rimuovere la `establishment.findUnique` separata):

```ts
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { establishment: { select: { name: true, suspendedAt: true } } },
    });
    if (!user || !(await this.hasher.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    if (user.disabledAt) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    // Sospensione a livello tenant, dalla stessa query (nessun round-trip extra).
    // Superuser (establishmentId null) → establishment null → nessun controllo (invariato).
    if (user.establishment?.suspendedAt) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    const dto = this.toDTO(user);
    const accessToken = this.tokens.sign({
      sub: dto.id,
      establishmentId: dto.establishmentId,
      role: dto.role,
    });
    return { accessToken, user: dto };
```

`me`: includere il nome dell'establishment:

```ts
  async me(userId: string): Promise<UserDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { establishment: { select: { name: true } } },
    });
    if (!user) throw new UnauthorizedException('Sessione non valida');
    return this.toDTO(user);
  }
```

- [ ] **Step 4: Rebuild contracts + eseguire unit (GREEN)**

Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS — api unit **200** (i 3 test login riscritti verdi, nessuna regressione).

- [ ] **Step 5: e2e autoritativi (--runInBand)**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand`
Expected: PASS — api e2e **235** (auth e2e con le nuove asserzioni establishmentName verdi).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/identity/identity.service.ts apps/api/src/identity/identity.service.spec.ts apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api): espone establishmentName in UserDTO/auth (login+me), consolida query sospensione"
```

---

### Task 2: FE — leggere `establishmentName` (web-staff store/mocks/subtitle + web-platform mock)

**Files:**
- Modify: `apps/web-staff/src/mocks/server.ts` (MOCK_ADMIN)
- Modify: `apps/web-staff/src/stores/session.ts` (establishmentName → computed)
- Test: `apps/web-staff/src/stores/session.spec.ts` (asserzioni)
- Modify: `apps/web-staff/src/router/index.ts` (subtitle /map)
- Modify: `apps/web-platform/src/mocks/handlers.ts` (MOCK_SUPERUSER)

**Interfaces:**
- Consumes: `UserDTO.establishmentName` (Task 1).
- Produces: `session.establishmentName` = nome dell'establishment dell'utente (o `''` se assente).

- [ ] **Step 1: Aggiornare mock + test (RED)**

In `apps/web-staff/src/mocks/server.ts`, aggiungere il campo a `MOCK_ADMIN`:

```ts
export const MOCK_ADMIN: UserDTO = {
  id: 'u-1',
  email: 'admin@coralyn.dev',
  role: Role.Admin,
  establishmentId: '00000000-0000-0000-0000-000000000001',
  establishmentName: 'Lido Maestrale',
};
```

In `apps/web-staff/src/stores/session.spec.ts`, aggiungere l'asserzione nel test di login esistente ("login salva token + user e popola i derivati"):

```ts
    expect(s.establishmentName).toBe('Lido Maestrale');
```

e nel test "rehydrate con token valido ripristina la sessione da /me":

```ts
    expect(s.establishmentName).toBe('Lido Maestrale');
```

In `apps/web-platform/src/mocks/handlers.ts`, aggiungere il campo a `MOCK_SUPERUSER`:

```ts
export const MOCK_SUPERUSER: UserDTO = { id: 'su-1', email: 'super@coralyn.test', role: Role.Superuser, establishmentId: null, establishmentName: null };
```

- [ ] **Step 2: Build contracts + eseguire i test (verificare RED)**

Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: FAIL — `s.establishmentName` è ancora la ref hardcoded `'Lido Maestrale'` → in realtà **passa** per coincidenza di valore. Per un RED reale, verificare che la ref hardcoded NON derivi dal login: cambiare temporaneamente l'asserzione a un valore diverso è sconsigliato. **Nota per l'implementer:** il vero cambiamento comportamentale è che `establishmentName` deve derivare dalla sessione; per renderlo osservabile, aggiungere PRIMA anche questa asserzione (che con la ref hardcoded FALLISCE) nel test "logout pulisce token e utente":

```ts
    // dopo logout, il nome derivato dalla sessione torna vuoto (non resta 'Lido Maestrale')
    expect(s.establishmentName).toBe('');
```

Con la ref hardcoded questo test FALLISCE (`establishmentName` resterebbe `'Lido Maestrale'` dopo il logout) → RED autentico.

- [ ] **Step 3: Implementare `session.ts`**

Sostituire la ref hardcoded con un computed dalla sessione:

```ts
  // Nome stabilimento dell'utente, esposto da /auth/me (UserDTO.establishmentName).
  const establishmentName = computed<string>(() => user.value?.establishmentName ?? '');
```

(Assicurarsi che `computed` sia importato da `vue` — già presente in `session.ts`.)

In `apps/web-staff/src/router/index.ts`, aggiornare il subtitle della route `/map`:

```ts
  { path: '/map', name: 'map', component: () => import('@/features/map/MapView.vue'), meta: { title: 'Mappa', subtitle: 'Vista per giornata', usesDate: true } },
```

- [ ] **Step 4: Rebuild contracts + eseguire i test (GREEN)**

Run: `corepack pnpm --filter @coralyn/contracts build`
Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: PASS — login/rehydrate espongono `'Lido Maestrale'`, logout torna `''`.

- [ ] **Step 5: Suite complete + typecheck (no regressioni)**

Run: `corepack pnpm --filter web-staff test`
Expected: **253** (conteggio invariato: asserzioni aggiunte, nessun nuovo `it`).

Run: `corepack pnpm --filter web-platform test`
Expected: **16** (invariato).

Run: `corepack pnpm --filter web-staff typecheck`
Run: `corepack pnpm --filter web-platform typecheck`
Expected: EXIT 0 entrambi (MOCK_ADMIN/MOCK_SUPERUSER ora completi rispetto a UserDTO).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/mocks/server.ts apps/web-staff/src/stores/session.ts apps/web-staff/src/stores/session.spec.ts apps/web-staff/src/router/index.ts apps/web-platform/src/mocks/handlers.ts
git commit -m "feat(web): nome stabilimento reale dalla sessione (Sidebar) + sottotitolo Mappa onesto"
```

---

## Verifica finale (dopo Task 2)

- [ ] contracts build ok; api unit **200**; api e2e **235** (--runInBand); web-staff **253**; web-platform **16**; typecheck pulito (api/web-staff/web-platform).
- [ ] Nessun "Lido Maestrale" hardcoded residuo nel FE (store + subtitle); il nome deriva da `/auth/me`.
- [ ] Review whole-branch (opus) prima del merge FF su `main` (ok esplicito).

## Note di scope
- Nessun endpoint nuovo (riuso `/auth/me`). Conteggio ombrelloni reale = fuori scope (feature separata). Consolidamento query login = behavior-preserving, coperto da unit (superuser/sospeso/attivo) + e2e.
