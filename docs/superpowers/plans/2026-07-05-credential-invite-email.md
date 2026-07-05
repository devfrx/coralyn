# Invito credenziali via email (set-password link) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la "password mostrata una volta" del provisioning con un invito via email (link *"imposta la tua password"*: token opaco hashato, a scadenza, monouso), coprendo con un unico meccanismo il provisioning di un nuovo lido, il reset-password admin dal console superuser e (in prospettiva) gli inviti staff.

**Architecture:** Nuovo modello `CredentialSetupToken` (RLS-free, accanto a `User`), un `CredentialModule` che possiede issue+send+redeem del token, un `MailModule` con porta `MailerService` + adapter SMTP (nodemailer) verso Mailpit in dev/test. Endpoint pubblici `GET/POST /auth/credential-setup` per il redeem; il provisioning e un nuovo `reset-admin-password` emettono i token. FE: pagina pubblica `/imposta-password` in web-staff; modal/dettaglio aggiornati in web-platform.

**Tech Stack:** NestJS + Prisma (PostgreSQL, RLS), argon2, nodemailer, Mailpit (`axllent/mailpit`), Vue 3 + TS + TanStack Query + ui-kit, Vitest + MSW, Jest + supertest (api e2e).

**Spec:** [2026-07-05-credential-invite-email-design.md](../specs/2026-07-05-credential-invite-email-design.md)

**Precondizioni (già fatte):** branch `feat/credential-invite-email` creato da `main`; cherry-pick del fix tsc `map.projection.spec` applicato (`tsc --noEmit` = exit 0); `@coralyn/contracts` buildato.

**Baseline test da NON regredire:** ui-kit **70** · web-staff **210** · web-platform **14** · api unit **178** · api e2e **222**.

**Gotcha ricorrenti (dal handoff §5):**
- Dopo ogni modifica a `packages/contracts/src/index.ts`: `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test dei consumer.
- Migrazioni: hand-author la cartella, poi `migrate deploy` a **dev E test** con `DATABASE_URL` inline; poi `generate`. **Mai** `db push`.
- Dopo modifiche a guard/rotte/endpoint: ri-eseguire **tutta** la suite api (unit + e2e) per il `RolesGuard` globale.
- Test Vitest con ui-kit `Modal`/`ConfirmDialog` (teleport): `attachTo: document.body` + `document.querySelector` + `settle()`.
- Fixture email nei test: TLD `.test`/`.example` (`@IsEmail` rifiuta domini con cifra tipo `*.e2e`).
- Porte: web-staff **8080**, web-platform **8081**, api **3000**, db **5433** (host). Campo token = `accessToken`.

**Comandi DB (dev + test), da `apps/api/`:**
```bash
# dev
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm exec prisma migrate deploy
# test
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy
# client
corepack pnpm exec prisma generate
```

---

## Task 1: Contracts — DTO invito/redeem, rimozione `temporaryPassword`

**Files:**
- Modify: `packages/contracts/src/index.ts:484-489`

- [ ] **Step 1: Sostituire `CreateEstablishmentResponse` e aggiungere i nuovi tipi**

In `packages/contracts/src/index.ts`, sostituire il blocco `CreateEstablishmentResponse` (righe ~484-489) con:

```ts
/** Risposta della create: il DTO del lido + esito dell'invito email all'admin.
 *  Nessuna password in chiaro: l'admin la imposta via link. */
export interface CreateEstablishmentResponse {
  establishment: PlatformEstablishmentDTO;
  adminEmail: string;
  expiresAt: string; // ISO — scadenza del link di invito
}

/** Esito di un reset-password admin avviato dal console superuser. */
export interface ResetAdminPasswordResponse {
  adminEmail: string;
  expiresAt: string; // ISO — scadenza del link di reset
}

/** Contesto minimo mostrato dalla pagina set-password (nessun dato sensibile). */
export type CredentialTokenPurpose = 'invite' | 'reset';
export interface CredentialSetupContext {
  email: string;
  purpose: CredentialTokenPurpose;
}

/** Input del redeem: token dal link + nuova password scelta dall'utente. */
export interface SetPasswordInput {
  token: string;
  password: string;
}
```

- [ ] **Step 2: Rebuild contracts**

Run (dalla root): `corepack pnpm --filter @coralyn/contracts build`
Expected: `tsc -p tsconfig.json` senza errori.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): tipi invito credenziali (rimuove temporaryPassword)"
```

---

## Task 2: Schema Prisma + migrazione — `CredentialSetupToken`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `PlatformAction`, model `User`, nuovo enum + model)
- Create: `apps/api/prisma/migrations/20260705140000_credential_setup_token/migration.sql`

- [ ] **Step 1: Aggiungere enum + model allo schema**

In `apps/api/prisma/schema.prisma`, aggiungere il valore all'enum `PlatformAction` (blocco esistente ~318):

```prisma
enum PlatformAction {
  create_establishment
  suspend_establishment
  reactivate_establishment
  reset_admin_password
}
```

Aggiungere la back-relation al model `User` (dentro il blocco `model User`, dopo `establishment`):

```prisma
  setupTokens     CredentialSetupToken[]
```

Aggiungere in fondo al file il nuovo enum + model:

```prisma
enum CredentialTokenPurpose {
  invite // imposta password per un account appena creato (admin ora, staff in futuro)
  reset  // reset password avviato dal console superuser
}

// Token di impostazione password (invito/reset). Volutamente FUORI RLS (dato di identità
// pre-tenant, come User/PlatformAuditLog, ADR-0026). Il raw NON è mai persistito: si salva
// solo sha256(raw). Monouso via consumedAt; un solo token vivo per utente (l'emit invalida i
// precedenti). Vedi spec 2026-07-05-credential-invite-email + ADR-0042.
model CredentialSetupToken {
  id              String                 @id @default(uuid()) @db.Uuid
  userId          String                 @db.Uuid
  tokenHash       String                 @unique
  purpose         CredentialTokenPurpose
  expiresAt       DateTime
  consumedAt      DateTime?
  createdByUserId String?                @db.Uuid
  createdAt       DateTime               @default(now())
  user            User                   @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Hand-author la migrazione SQL**

Create `apps/api/prisma/migrations/20260705140000_credential_setup_token/migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "PlatformAction" ADD VALUE 'reset_admin_password';

-- CreateEnum
CREATE TYPE "CredentialTokenPurpose" AS ENUM ('invite', 'reset');

-- CreateTable
CREATE TABLE "CredentialSetupToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "CredentialTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialSetupToken_tokenHash_key" ON "CredentialSetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CredentialSetupToken_userId_idx" ON "CredentialSetupToken"("userId");

-- CreateIndex
CREATE INDEX "CredentialSetupToken_expiresAt_idx" ON "CredentialSetupToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CredentialSetupToken" ADD CONSTRAINT "CredentialSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

> ⚠️ `ALTER TYPE … ADD VALUE` non può girare nella stessa transazione di un successivo uso del valore; qui non usiamo `reset_admin_password` nella stessa migrazione, quindi è ok. Se `migrate deploy` protesta, spostare l'`ALTER TYPE` in una migrazione precedente separata.

- [ ] **Step 3: Applicare a dev + test e rigenerare il client**

Run (da `apps/api/`):
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy
corepack pnpm exec prisma generate
```
Expected: entrambe le migrazioni "applied"; generate crea i tipi `CredentialSetupToken`/`CredentialTokenPurpose`.

- [ ] **Step 4: Verifica typecheck**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260705140000_credential_setup_token
git commit -m "feat(api): modello CredentialSetupToken + migrazione (dev+test)"
```

---

## Task 3: Sottosistema mail — porta `MailerService` + adapter SMTP + builder

**Files:**
- Modify: `apps/api/package.json` (dep `nodemailer` + `@types/nodemailer`)
- Create: `apps/api/src/mail/credential-setup.email.ts` (builder puro)
- Create: `apps/api/src/mail/credential-setup.email.spec.ts`
- Create: `apps/api/src/mail/mailer.service.ts` (porta astratta + tipi)
- Create: `apps/api/src/mail/smtp-mailer.service.ts` (adapter nodemailer)
- Create: `apps/api/src/mail/mail.module.ts`

- [ ] **Step 1: Aggiungere nodemailer**

Run (dalla root):
```bash
corepack pnpm --filter @coralyn/api add nodemailer
corepack pnpm --filter @coralyn/api add -D @types/nodemailer
```
Expected: `apps/api/package.json` elenca `nodemailer` in dependencies e `@types/nodemailer` in devDependencies.

- [ ] **Step 2: Scrivere il test del builder (fallisce)**

Create `apps/api/src/mail/credential-setup.email.spec.ts`:

```ts
import { buildCredentialSetupEmail } from './credential-setup.email';

describe('buildCredentialSetupEmail', () => {
  const base = {
    to: 'admin@lido.test',
    rawToken: 'RAW-TOKEN-123',
    expiresAt: new Date('2026-07-08T10:00:00.000Z'),
    webStaffUrl: 'http://localhost:8080',
  };

  it('invito: subject di attivazione, link con token, nessuna password nel corpo', () => {
    const m = buildCredentialSetupEmail({ ...base, purpose: 'invite' });
    expect(m.subject).toMatch(/attiv/i);
    expect(m.text).toContain('http://localhost:8080/imposta-password?token=RAW-TOKEN-123');
    expect(m.html).toContain('http://localhost:8080/imposta-password?token=RAW-TOKEN-123');
    expect(m.text.toLowerCase()).not.toContain('password:');
  });

  it('reset: subject di reimpostazione', () => {
    const m = buildCredentialSetupEmail({ ...base, purpose: 'reset' });
    expect(m.subject).toMatch(/reimposta|reset/i);
    expect(m.text).toContain('RAW-TOKEN-123');
  });
});
```

- [ ] **Step 3: Run test → FAIL**

Run: `corepack pnpm --filter @coralyn/api exec jest src/mail/credential-setup.email.spec.ts`
Expected: FAIL — `buildCredentialSetupEmail` non esiste.

- [ ] **Step 4: Implementare il builder**

Create `apps/api/src/mail/credential-setup.email.ts`:

```ts
import type { CredentialTokenPurpose } from '@coralyn/contracts';

export interface CredentialSetupEmailModel {
  to: string;
  rawToken: string;
  purpose: CredentialTokenPurpose;
  expiresAt: Date;
  webStaffUrl: string;
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
});

/** Costruisce l'email di set-password (invito o reset). Puro: nessun side-effect, nessuna password. */
export function buildCredentialSetupEmail(m: CredentialSetupEmailModel): { subject: string; text: string; html: string } {
  const link = `${m.webStaffUrl}/imposta-password?token=${m.rawToken}`;
  const scad = DATE_FMT.format(m.expiresAt);
  const isReset = m.purpose === 'reset';
  const subject = isReset ? 'Reimposta la tua password Coralyn' : 'Attiva il tuo accesso a Coralyn';
  const intro = isReset
    ? 'Abbiamo ricevuto una richiesta di reimpostazione della password del tuo account Coralyn.'
    : 'Il tuo account Coralyn è stato creato. Imposta la password per iniziare a usare il gestionale.';
  const text = [
    intro,
    '',
    `Imposta la password da questo link (valido fino al ${scad}, utilizzabile una sola volta):`,
    link,
    '',
    'Se non hai richiesto questa email, puoi ignorarla: senza impostare la password, l’accesso non è attivo.',
  ].join('\n');
  const html = `<p>${intro}</p>
<p>Imposta la password da questo link (valido fino al <strong>${scad}</strong>, utilizzabile una sola volta):</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#666;font-size:13px">Se non hai richiesto questa email, puoi ignorarla: senza impostare la password, l’accesso non è attivo.</p>`;
  return { subject, text, html };
}
```

- [ ] **Step 5: Run test → PASS**

Run: `corepack pnpm --filter @coralyn/api exec jest src/mail/credential-setup.email.spec.ts`
Expected: PASS (2 test).

- [ ] **Step 6: Definire la porta `MailerService`**

Create `apps/api/src/mail/mailer.service.ts`:

```ts
import type { CredentialTokenPurpose } from '@coralyn/contracts';

export interface CredentialSetupEmailInput {
  to: string;
  rawToken: string;
  purpose: CredentialTokenPurpose;
  expiresAt: Date;
}

/** Porta di invio email (ADR-0042). Astratta: usata come token DI. L'adapter reale è SMTP. */
export abstract class MailerService {
  abstract sendCredentialSetup(input: CredentialSetupEmailInput): Promise<void>;
}
```

- [ ] **Step 7: Implementare l'adapter SMTP**

Create `apps/api/src/mail/smtp-mailer.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MailerService, type CredentialSetupEmailInput } from './mailer.service';
import { buildCredentialSetupEmail } from './credential-setup.email';

/** Adapter SMTP (nodemailer). Config da env: MAIL_HOST/PORT/SECURE/USER/PASS/FROM + APP_WEB_STAFF_URL.
 *  In dev/test punta a Mailpit; in prod a un provider (Postmark/SES) via env — nessun cambio di codice. */
@Injectable()
export class SmtpMailerService extends MailerService {
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    super();
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port: Number(this.config.get<string>('MAIL_PORT') ?? '1025'),
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendCredentialSetup(input: CredentialSetupEmailInput): Promise<void> {
    const { subject, text, html } = buildCredentialSetupEmail({
      to: input.to,
      rawToken: input.rawToken,
      purpose: input.purpose,
      expiresAt: input.expiresAt,
      webStaffUrl: this.config.getOrThrow<string>('APP_WEB_STAFF_URL'),
    });
    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: input.to,
      subject, text, html,
    });
  }
}
```

- [ ] **Step 8: Modulo mail**

Create `apps/api/src/mail/mail.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SmtpMailerService } from './smtp-mailer.service';

@Module({
  providers: [{ provide: MailerService, useClass: SmtpMailerService }],
  exports: [MailerService],
})
export class MailModule {}
```

- [ ] **Step 9: Typecheck + commit**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: exit 0.

```bash
git add apps/api/package.json apps/api/src/mail pnpm-lock.yaml
git commit -m "feat(api): sottosistema mail (porta MailerService + adapter SMTP + builder)"
```

---

## Task 4: `CredentialModule` — issue+send / redeem / context del token

**Files:**
- Create: `apps/api/src/credential/token-hash.ts` (helper sha256 + generazione raw)
- Create: `apps/api/src/credential/credential-setup.service.ts`
- Create: `apps/api/src/credential/credential-setup.service.spec.ts`
- Create: `apps/api/src/credential/credential.module.ts`

- [ ] **Step 1: Helper token (puro)**

Create `apps/api/src/credential/token-hash.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

/** Token opaco da mettere nel link: 32 byte random, url-safe (~43 char). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash a riposo del token: sha256 esadecimale. Il raw NON viene mai persistito. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
```

- [ ] **Step 2: Scrivere i test del service (falliscono)**

Create `apps/api/src/credential/credential-setup.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { CredentialSetupService } from './credential-setup.service';
import { hashToken } from './token-hash';

// Fake Prisma minimale in-memory per la logica del token.
function makePrisma() {
  const tokens: any[] = [];
  const users: any[] = [{ id: 'u1', email: 'a@lido.test', passwordHash: 'old' }];
  const client: any = {
    credentialSetupToken: {
      create: ({ data }: any) => { const row = { id: `t${tokens.length + 1}`, consumedAt: null, ...data }; tokens.push(row); return Promise.resolve(row); },
      updateMany: ({ where, data }: any) => { tokens.filter((t) => t.userId === where.userId && t.consumedAt === null).forEach((t) => Object.assign(t, data)); return Promise.resolve({ count: 0 }); },
      findUnique: ({ where, include }: any) => { const t = tokens.find((x) => x.tokenHash === where.tokenHash) ?? null; if (t && include?.user) t.user = users.find((u) => u.id === t.userId); return Promise.resolve(t); },
    },
    user: { update: ({ where, data }: any) => { const u = users.find((x) => x.id === where.id); Object.assign(u, data); return Promise.resolve(u); } },
    $transaction: (fn: any) => fn(client),
  };
  return { client, tokens, users };
}

const hasher = { hash: (p: string) => Promise.resolve(`hash(${p})`), verify: () => Promise.resolve(true) } as any;
const mailer = { sendCredentialSetup: jest.fn().mockResolvedValue(undefined) } as any;
const config = { get: () => '72', getOrThrow: () => 'x' } as any;

describe('CredentialSetupService', () => {
  it('issueAndSend: crea un token hashato (mai il raw), invalida i precedenti, invia email', async () => {
    const { client, tokens } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    const { expiresAt } = await svc.issueAndSend('u1', 'a@lido.test', 'invite', 'su1');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].purpose).toBe('invite');
    expect(expiresAt).toBeInstanceOf(Date);
    expect(mailer.sendCredentialSetup).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@lido.test', purpose: 'invite' }));
  });

  it('redeem: imposta la password, consuma il token, invalida i fratelli', async () => {
    const { client, tokens, users } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    // seed un token valido noto
    const raw = 'known-raw';
    tokens.push({ id: 't1', userId: 'u1', tokenHash: hashToken(raw), purpose: 'invite', consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    await svc.redeem(raw, 'nuova-password-123');
    expect(users[0].passwordHash).toBe('hash(nuova-password-123)');
    expect(tokens[0].consumedAt).not.toBeNull();
  });

  it('redeem: token scaduto → NotFoundException', async () => {
    const { client, tokens } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    const raw = 'expired-raw';
    tokens.push({ id: 't1', userId: 'u1', tokenHash: hashToken(raw), purpose: 'invite', consumedAt: null, expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.redeem(raw, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getContext: token valido → email+purpose; inesistente → NotFoundException', async () => {
    const { client, tokens } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    const raw = 'ctx-raw';
    tokens.push({ id: 't1', userId: 'u1', tokenHash: hashToken(raw), purpose: 'reset', consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await svc.getContext(raw)).toEqual({ email: 'a@lido.test', purpose: 'reset' });
    await expect(svc.getContext('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run → FAIL**

Run: `corepack pnpm --filter @coralyn/api exec jest src/credential/credential-setup.service.spec.ts`
Expected: FAIL — service inesistente.

- [ ] **Step 4: Implementare `CredentialSetupService`**

Create `apps/api/src/credential/credential-setup.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CredentialSetupContext, CredentialTokenPurpose } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { MailerService } from '../mail/mailer.service';
import { generateRawToken, hashToken } from './token-hash';

const INVALID = 'Link non valido o scaduto';

@Injectable()
export class CredentialSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private ttlHours(): number {
    return Number(this.config.get<string>('CREDENTIAL_TOKEN_TTL_HOURS') ?? '72');
  }

  /** Emette un token (invalidando i precedenti dello stesso utente) e invia l'email. Il raw
   *  non lascia mai il service se non verso il mailer. Ritorna la scadenza per la UI. */
  async issueAndSend(
    userId: string,
    email: string,
    purpose: CredentialTokenPurpose,
    createdByUserId: string,
  ): Promise<{ expiresAt: Date }> {
    const raw = generateRawToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.credentialSetupToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.credentialSetupToken.create({ data: { userId, tokenHash, purpose, expiresAt, createdByUserId } });
    });
    await this.mailer.sendCredentialSetup({ to: email, rawToken: raw, purpose, expiresAt });
    return { expiresAt };
  }

  /** Valida un token e ne ritorna il contesto per la pagina. Errore generico se non valido. */
  async getContext(rawToken: string): Promise<CredentialSetupContext> {
    const token = await this.prisma.credentialSetupToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) throw new NotFoundException(INVALID);
    return { email: token.user.email, purpose: token.purpose as CredentialTokenPurpose };
  }

  /** Imposta la password dell'utente e consuma il token (monouso), invalidando i fratelli. */
  async redeem(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.prisma.credentialSetupToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) throw new NotFoundException(INVALID);
    const passwordHash = await this.hasher.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.credentialSetupToken.updateMany({ where: { userId: token.userId, consumedAt: null }, data: { consumedAt: new Date() } });
    });
  }
}
```

- [ ] **Step 5: Run → PASS**

Run: `corepack pnpm --filter @coralyn/api exec jest src/credential/credential-setup.service.spec.ts`
Expected: PASS (4 test).

- [ ] **Step 6: Modulo credential**

Create `apps/api/src/credential/credential.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialSetupService } from './credential-setup.service';

// PasswordHasher è stateless: lo ri-provvediamo qui (come fa PlatformModule) per non creare
// una dipendenza circolare Identity↔Credential. PrismaService è @Global.
@Module({
  imports: [MailModule],
  providers: [CredentialSetupService, PasswordHasher],
  exports: [CredentialSetupService],
})
export class CredentialModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/credential
git commit -m "feat(api): CredentialSetupService (issue+send/redeem/context) + CredentialModule"
```

---

## Task 5: Endpoint pubblici redeem — `GET/POST /auth/credential-setup`

**Files:**
- Create: `apps/api/src/identity/dto/set-password.dto.ts`
- Modify: `apps/api/src/identity/auth.controller.ts`
- Modify: `apps/api/src/identity/identity.module.ts` (import `CredentialModule`)
- Create: `apps/api/test/credential-setup.e2e-spec.ts`
- Create: `apps/api/test/helpers/fake-mailer.ts`

- [ ] **Step 1: DTO set-password**

Create `apps/api/src/identity/dto/set-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';
import type { SetPasswordInput } from '@coralyn/contracts';

export class SetPasswordDto implements SetPasswordInput {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10, { message: 'La password deve avere almeno 10 caratteri' })
  password!: string;
}
```

- [ ] **Step 2: Fake mailer per i test**

Create `apps/api/test/helpers/fake-mailer.ts`:

```ts
import { MailerService, type CredentialSetupEmailInput } from '../../src/mail/mailer.service';

/** Mailer di test: non invia nulla, cattura gli input (incluso il rawToken) per le asserzioni. */
export class FakeMailerService extends MailerService {
  readonly sent: CredentialSetupEmailInput[] = [];
  async sendCredentialSetup(input: CredentialSetupEmailInput): Promise<void> {
    this.sent.push(input);
  }
  last(): CredentialSetupEmailInput { return this.sent[this.sent.length - 1]; }
  reset(): void { this.sent.length = 0; }
}
```

- [ ] **Step 3: Scrivere l'e2e del redeem (fallisce)**

Create `apps/api/test/credential-setup.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { CredentialSetupService } from '../src/credential/credential-setup.service';
import { createUser } from './helpers/seed-auth';

const EMAIL = 'redeem.admin@platform.test';

describe('Credential setup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: FakeMailerService;
  let credentials: CredentialSetupService;
  let estId: string;
  let userId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);
    credentials = app.get(CredentialSetupService);
    estId = (await prisma.establishment.create({ data: { name: 'REDEEM HOST' } })).id;
    await createUser(prisma, { email: EMAIL, password: 'unusable-initial', role: Role.admin, establishmentId: estId });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).id;
  });

  afterAll(async () => {
    await prisma.credentialSetupToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.establishment.deleteMany({ where: { id: estId } });
    await app.close();
  });

  it('GET context: token valido → email+purpose; POST redeem → 204; poi login con la nuova password', async () => {
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'invite', userId);
    const raw = mailer.last().rawToken;

    const ctx = await request(app.getHttpServer()).get(`/api/auth/credential-setup/${raw}`).expect(200);
    expect(ctx.body).toEqual({ email: EMAIL, purpose: 'invite' });

    // login prima del redeem → 401 (hash iniziale sconosciuto)
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: EMAIL, password: 'la-nuova-password' }).expect(401);

    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'la-nuova-password' }).expect(204);

    await request(app.getHttpServer()).post('/api/auth/login').send({ email: EMAIL, password: 'la-nuova-password' }).expect(200);
  });

  it('token già consumato → GET 404 e POST 404', async () => {
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'invite', userId);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'altra-password-1' }).expect(204);
    await request(app.getHttpServer()).get(`/api/auth/credential-setup/${raw}`).expect(404);
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'altra-password-2' }).expect(404);
  });

  it('token inesistente → 404; password troppo corta → 400', async () => {
    await request(app.getHttpServer()).get('/api/auth/credential-setup/nope').expect(404);
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'reset', userId);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'corta' }).expect(400);
  });
});
```

- [ ] **Step 4: Run → FAIL**

Run: `corepack pnpm --filter @coralyn/api exec jest --config test/jest-e2e.json credential-setup`
Expected: FAIL — rotte inesistenti (404 su tutto / route non registrata).

- [ ] **Step 5: Aggiungere gli endpoint pubblici**

Modify `apps/api/src/identity/auth.controller.ts` — aggiungere gli import e i due metodi:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { CredentialSetupService } from '../credential/credential-setup.service';
import { CredentialSetupContext, LoginResponse, UserDTO } from '@coralyn/contracts';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly credentials: CredentialSetupService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.identity.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDTO> {
    return this.identity.me(user.id);
  }

  @Public()
  @Get('credential-setup/:token')
  credentialSetupContext(@Param('token') token: string): Promise<CredentialSetupContext> {
    return this.credentials.getContext(token);
  }

  @Public()
  @Post('credential-setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@Body() body: SetPasswordDto): Promise<void> {
    return this.credentials.redeem(body.token, body.password);
  }
}
```

- [ ] **Step 6: Wire `CredentialModule` in `IdentityModule`**

Modify `apps/api/src/identity/identity.module.ts` — aggiungere l'import del modulo:

```ts
import { CredentialModule } from '../credential/credential.module';
// ...
@Module({
  imports: [
    JwtModule.registerAsync({ /* invariato */
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h' },
      }),
    }),
    CredentialModule,
  ],
  controllers: [AuthController],
  providers: [
    IdentityService,
    PasswordHasher,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class IdentityModule {}
```

- [ ] **Step 7: Run e2e → PASS**

Run: `corepack pnpm --filter @coralyn/api exec jest --config test/jest-e2e.json credential-setup`
Expected: PASS (3 test).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/identity/auth.controller.ts apps/api/src/identity/identity.module.ts apps/api/src/identity/dto/set-password.dto.ts apps/api/test/credential-setup.e2e-spec.ts apps/api/test/helpers/fake-mailer.ts
git commit -m "feat(api): endpoint pubblici GET/POST /auth/credential-setup + e2e"
```

---

## Task 6: Emissione dei token — provisioning modificato + reset-admin-password

**Files:**
- Modify: `apps/api/src/platform/platform-provisioning.service.ts`
- Modify: `apps/api/src/platform/platform.controller.ts`
- Modify: `apps/api/src/platform/platform.module.ts` (import `CredentialModule`)
- Modify: `apps/api/test/platform.e2e-spec.ts`

- [ ] **Step 1: Aggiornare l'e2e Platform (rispecchia il nuovo comportamento) — deve fallire**

In `apps/api/test/platform.e2e-spec.ts`:

1. Nel setup del modulo, override del mailer + presa dei riferimenti. Sostituire la riga di `compile()`:

```ts
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
// ...
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
```
e dopo `prisma = app.get(PrismaService);` aggiungere:
```ts
    mailer = app.get(MailerService);
```
con la dichiarazione `let mailer: FakeMailerService;` in cima al describe.

2. Rimuovere `let tempPassword: string;` e sostituire il test "crea un lido" con:

```ts
  it('superuser: crea un lido + primo admin → 201 SENZA password; l’admin la imposta via invito e fa login', async () => {
    mailer.reset();
    const res = await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Lido Nuovo', adminEmail: NEW_ADMIN_EMAIL })
      .expect(201);
    expect(res.body.adminEmail).toBe(NEW_ADMIN_EMAIL);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(typeof res.body.expiresAt).toBe('string');
    expect(res.body.establishment).toEqual(expect.objectContaining({ name: 'Lido Nuovo', suspendedAt: null, umbrellas: 0 }));
    createdEstId = res.body.establishment.id;

    // l’admin non può ancora entrare; imposta la password dal token dell’invito, poi entra
    const raw = mailer.last().rawToken;
    expect(mailer.last().purpose).toBe('invite');
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'admin-nuova-pw-1' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(200);
  });
```

3. Nel test suspend/reactivate, sostituire `tempPassword` con `'admin-nuova-pw-1'`.

4. Aggiungere un test per il reset:

```ts
  it('reset-admin-password: emette invito reset; la vecchia password smette di funzionare al redeem', async () => {
    mailer.reset();
    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/reset-admin-password`).set(...bearer(superT)).expect(201);
    expect(mailer.last().purpose).toBe('reset');
    expect(mailer.last().to).toBe(NEW_ADMIN_EMAIL);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'admin-reset-pw-2' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-reset-pw-2' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(401);
  });
```

5. Nell'`afterAll`, aggiungere la pulizia dei token:
```ts
    await prisma.credentialSetupToken.deleteMany({ where: { user: { email: NEW_ADMIN_EMAIL } } });
```
(prima della `deleteMany` degli User).

6. Nel test dell'audit, aggiungere `'reset_admin_password'` all'`arrayContaining`.

Run: `corepack pnpm --filter @coralyn/api exec jest --config test/jest-e2e.json platform`
Expected: FAIL (response contiene ancora `temporaryPassword`, rotta reset 404).

- [ ] **Step 2: Modificare `PlatformProvisioningService`**

Modify `apps/api/src/platform/platform-provisioning.service.ts` — nuovo import + costruttore + `create` che non ritorna più la password + metodo `resetAdminPassword`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { PlatformMetricsService } from './platform-metrics.service';
import { CredentialSetupService } from '../credential/credential-setup.service';

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly metrics: PlatformMetricsService,
    private readonly credentials: CredentialSetupService,
  ) {}

  async create(input: CreateEstablishmentInput, actorUserId: string): Promise<CreateEstablishmentResponse> {
    // Hash INUTILIZZABILE: l'admin non conosce alcuna password finché non la imposta via invito.
    const unusableHash = await this.hasher.hash(randomBytes(32).toString('base64url'));
    let establishmentId: string;
    let adminUserId: string;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const est = await tx.establishment.create({ data: { name: input.name } });
        const user = await tx.user.create({
          data: { establishmentId: est.id, email: input.adminEmail, passwordHash: unusableHash, role: 'admin' },
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId,
            action: 'create_establishment',
            targetEstablishmentId: est.id,
            metadata: { name: input.name, adminEmail: input.adminEmail, invited: true },
          },
        });
        return { estId: est.id, userId: user.id };
      });
      establishmentId = created.estId;
      adminUserId = created.userId;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    const { expiresAt } = await this.credentials.issueAndSend(adminUserId, input.adminEmail, 'invite', actorUserId);
    const establishment = await this.metrics.getOne(establishmentId);
    return { establishment, adminEmail: input.adminEmail, expiresAt: expiresAt.toISOString() };
  }

  /** Reset password dell'admin del lido: emette un invito `reset` via email. 409 se ≠1 admin attivo. */
  async resetAdminPassword(establishmentId: string, actorUserId: string): Promise<ResetAdminPasswordResponse> {
    const est = await this.prisma.establishment.findUnique({ where: { id: establishmentId }, select: { id: true } });
    if (!est) throw new NotFoundException('Stabilimento non trovato');
    const admins = await this.prisma.user.findMany({
      where: { establishmentId, role: 'admin', disabledAt: null },
      select: { id: true, email: true },
    });
    if (admins.length !== 1) {
      throw new ConflictException('Il lido non ha un unico admin attivo: reset non disponibile da qui');
    }
    const admin = admins[0];
    const { expiresAt } = await this.credentials.issueAndSend(admin.id, admin.email, 'reset', actorUserId);
    await this.prisma.platformAuditLog.create({
      data: { actorUserId, action: 'reset_admin_password', targetEstablishmentId: establishmentId, metadata: { adminEmail: admin.email } },
    });
    return { adminEmail: admin.email, expiresAt: expiresAt.toISOString() };
  }

  // suspend / reactivate / setSuspended — INVARIATI (restano come sono).
  async suspend(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, true);
  }

  async reactivate(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, false);
  }

  private async setSuspended(id: string, actorUserId: string, suspended: boolean): Promise<PlatformEstablishmentDTO> {
    const existing = await this.prisma.establishment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Stabilimento non trovato');
    await this.prisma.$transaction(async (tx) => {
      await tx.establishment.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } });
      await tx.platformAuditLog.create({
        data: {
          actorUserId,
          action: suspended ? 'suspend_establishment' : 'reactivate_establishment',
          targetEstablishmentId: id,
        },
      });
    });
    return this.metrics.getOne(id);
  }
}
```

- [ ] **Step 3: Endpoint reset nel controller**

Modify `apps/api/src/platform/platform.controller.ts` — aggiungere l'import del tipo e la rotta:

```ts
import type { CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
// ...dentro la classe, dopo reactivate:
  @Post('establishments/:id/reset-admin-password')
  resetAdminPassword(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ResetAdminPasswordResponse> {
    return this.provisioning.resetAdminPassword(id, user.id);
  }
```

- [ ] **Step 4: Wire `CredentialModule` in `PlatformModule`**

Modify `apps/api/src/platform/platform.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialModule } from '../credential/credential.module';

@Module({
  imports: [CredentialModule],
  controllers: [PlatformController],
  providers: [PlatformMetricsService, PlatformProvisioningService, PasswordHasher],
})
export class PlatformModule {}
```

- [ ] **Step 5: Run e2e Platform → PASS**

Run: `corepack pnpm --filter @coralyn/api exec jest --config test/jest-e2e.json platform`
Expected: PASS (tutti i test, inclusi i nuovi invito/reset).

- [ ] **Step 6: Suite api COMPLETA (RolesGuard globale)**

Run:
```bash
corepack pnpm --filter @coralyn/api exec jest
corepack pnpm --filter @coralyn/api exec jest --config test/jest-e2e.json
```
Expected: unit ≥ 178+ verdi; e2e ≥ 222+ verdi (nessuna regressione).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/platform apps/api/test/platform.e2e-spec.ts
git commit -m "feat(api): provisioning via invito email + reset-admin-password (audit)"
```

---

## Task 7: web-platform — modal senza password + azione reset

**Files:**
- Modify: `apps/web-platform/src/features/establishments/usePlatformEstablishments.ts`
- Modify: `apps/web-platform/src/features/establishments/CreateEstablishmentModal.vue`
- Modify: `apps/web-platform/src/features/establishments/EstablishmentDetailView.vue`
- Modify: `apps/web-platform/src/mocks/handlers.ts`
- Modify/Create: i relativi `*.spec.ts` accanto ai componenti (seguire i test esistenti nella cartella)

- [ ] **Step 1: Composable — reset + create senza password**

In `usePlatformEstablishments.ts`, aggiornare gli import e aggiungere l'hook reset:

```ts
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
// ...in fondo:
export function useResetAdminPassword() {
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<ResetAdminPasswordResponse>(`/platform/establishments/${id}/reset-admin-password`, { method: 'POST' }),
    invalidates: () => [],
  });
}
```
(`useCreateEstablishment` resta invariato nella firma: `CreateEstablishmentResponse` ora ha `expiresAt` al posto di `temporaryPassword`.)

- [ ] **Step 2: Aggiornare i mock MSW**

In `apps/web-platform/src/mocks/handlers.ts`, sostituire la POST create e aggiungere la rotta reset:

```ts
  http.post('/api/platform/establishments', async ({ request }) => {
    const body = (await request.json()) as { name: string; adminEmail: string };
    const dto = baseDto({ id: `e-${seed.length + 1}`, name: body.name });
    seed.push(dto);
    return HttpResponse.json({ establishment: dto, adminEmail: body.adminEmail, expiresAt: '2026-07-08T10:00:00.000Z' }, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/reset-admin-password', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ adminEmail: 'admin@lido.test', expiresAt: '2026-07-08T10:00:00.000Z' }, { status: 201 });
  }),
```

- [ ] **Step 3: Modal — sostituire la fase "password" con "invito inviato"**

Riscrivere `CreateEstablishmentModal.vue`. Rimuovere `copied`, `copyPassword`; la fase result mostra l'esito invito. Script `<script setup>`: eliminare `copied` e `copyPassword`, aggiungere un formatter data. Template `phase === 'result'`:

```vue
    <div v-else class="flex flex-col gap-4">
      <p class="text-sm text-[var(--color-text)]">
        Lido <strong>{{ result?.establishment.name }}</strong> creato.
      </p>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-raised)] p-4 text-sm text-[var(--color-text)]">
        Un invito per impostare la password è stato inviato a
        <strong data-testid="invite-email">{{ result?.adminEmail }}</strong>.
        Il link è valido fino al <strong data-testid="invite-expires">{{ fmtExpires(result?.expiresAt) }}</strong>
        ed è utilizzabile una sola volta.
      </div>
      <div class="flex justify-end">
        <Button data-testid="create-done" @click="done">Fatto</Button>
      </div>
    </div>
```
Aggiungere allo script:
```ts
const EXPIRES_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
function fmtExpires(iso: string | undefined): string { return iso ? EXPIRES_FMT.format(new Date(iso)) : '—'; }
```

- [ ] **Step 4: Dettaglio — azione "Reset password admin"**

In `EstablishmentDetailView.vue`, aggiungere l'hook reset, uno stato per la conferma reset e un toast. Import:
```ts
import { useEstablishmentDetail, useSuspendEstablishment, useReactivateEstablishment, useResetAdminPassword } from './usePlatformEstablishments';
import { useToasts } from '@/lib/toasts';
```
Script:
```ts
const resetPw = useResetAdminPassword();
const resetOpen = ref(false);
const toasts = useToasts();
function askReset(): void { resetOpen.value = true; }
async function onConfirmReset(): Promise<void> {
  resetOpen.value = false;
  const e = data.value;
  if (!e) return;
  const res = await resetPw.mutateAsync(e.id);
  toasts.push({ tone: 'success', message: `Invito di reset inviato a ${res.adminEmail}.` });
}
```
Template — accanto al bottone suspend, aggiungere:
```vue
        <Button
          data-testid="reset-admin"
          variant="secondary"
          :disabled="resetPw.isPending.value"
          @click="askReset"
        >Reset password admin</Button>
```
E un secondo `ConfirmDialog`:
```vue
    <ConfirmDialog
      v-model:open="resetOpen"
      title="Reset password admin?"
      :description="`Invieremo a «${data?.name}» un'email con un link per reimpostare la password dell'amministratore.`"
      confirm-label="Invia invito di reset"
      @confirm="onConfirmReset"
    />
```
> Verificare l'API reale di `useToasts()` in `apps/web-platform/src/lib/toasts.ts` e adeguare la chiamata `push(...)` alla firma esistente (usata anche in `ToastHost`).

- [ ] **Step 5: Test dei componenti**

Adeguare/aggiungere i test seguendo il pattern della cartella (teleport + `settle()`):
- `CreateEstablishmentModal.spec.ts`: dopo submit, la fase result mostra `[data-testid="invite-email"]` con l'email e **non** esiste più `[data-testid="temp-password"]`.
- `EstablishmentDetailView.spec.ts`: click su `[data-testid="reset-admin"]` → conferma → il mock reset risponde → toast atteso (o mutation chiamata).

Esempio di asserzione chiave nel test del modal (adeguare al mount helper esistente nella cartella):
```ts
// dopo aver compilato e inviato il form:
expect(document.querySelector('[data-testid="temp-password"]')).toBeNull();
expect(document.querySelector('[data-testid="invite-email"]')?.textContent).toContain('admin@lido.test');
```

- [ ] **Step 6: Run web-platform + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/contracts build
corepack pnpm --filter @coralyn/web-platform test
corepack pnpm --filter @coralyn/web-platform exec vue-tsc -b
```
Expected: test ≥ 14 verdi (con i nuovi), typecheck pulito.

- [ ] **Step 7: Commit**

```bash
git add apps/web-platform/src
git commit -m "feat(web-platform): invito email nel provisioning + reset password admin"
```

---

## Task 8: web-staff — pagina pubblica set-password + verifica RegisterView

**Files:**
- Create: `apps/web-staff/src/features/auth/SetPasswordView.vue`
- Create: `apps/web-staff/src/features/auth/SetPasswordView.spec.ts`
- Modify: `apps/web-staff/src/router/index.ts` (rotta pubblica)
- Create: `apps/web-staff/src/features/auth/RegisterView.spec.ts` (verifica: nessuna chiamata auth)

- [ ] **Step 1: Scrivere il test della view (fallisce)**

Create `apps/web-staff/src/features/auth/SetPasswordView.spec.ts` seguendo il pattern di test view della cartella. Punti chiave (adeguare al mount helper reale del repo, es. `mountApp`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del data-layer HTTP: nessuna dipendenza da un server MSW.
const apiFetch = vi.fn();
vi.mock('@/lib/http', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a), ApiError: class extends Error {} }));

describe('SetPasswordView', () => {
  beforeEach(() => apiFetch.mockReset());

  it('token valido → mostra il form con l’email', async () => {
    apiFetch.mockResolvedValueOnce({ email: 'admin@lido.test', purpose: 'invite' }); // GET context
    // montare la view con route query ?token=abc e attendere il settle
    // expect: il testo contiene 'admin@lido.test' e il form password è presente
  });

  it('token invalido → stato d’errore + link a /login', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Link non valido o scaduto')); // GET context 404
    // expect: messaggio d’errore visibile, link a /login
  });

  it('submit valido → POST redeem poi redirect a /login', async () => {
    apiFetch.mockResolvedValueOnce({ email: 'admin@lido.test', purpose: 'invite' }); // GET
    apiFetch.mockResolvedValueOnce(null); // POST 204
    // compilare password+conferma, submit, attendere
    // expect: seconda chiamata a POST '/auth/credential-setup' con { token, password }; router push '/login'
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `corepack pnpm --filter @coralyn/web-staff test SetPasswordView`
Expected: FAIL — view inesistente.

- [ ] **Step 3: Implementare `SetPasswordView.vue`**

Create `apps/web-staff/src/features/auth/SetPasswordView.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Field, Input, Button } from '@coralyn/ui-kit';
import type { CredentialSetupContext } from '@coralyn/contracts';
import AuthLayout from '@/app/AuthLayout.vue';
import { apiFetch } from '@/lib/http';

const route = useRoute();
const router = useRouter();
const token = String(route.query.token ?? '');

type Phase = 'loading' | 'form' | 'invalid' | 'done';
const phase = ref<Phase>('loading');
const email = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const submitting = ref(false);

onMounted(async () => {
  if (!token) { phase.value = 'invalid'; return; }
  try {
    const ctx = await apiFetch<CredentialSetupContext>(`/auth/credential-setup/${encodeURIComponent(token)}`);
    email.value = ctx.email;
    phase.value = 'form';
  } catch {
    phase.value = 'invalid';
  }
});

async function submit(): Promise<void> {
  error.value = '';
  if (password.value.length < 10) { error.value = 'La password deve avere almeno 10 caratteri.'; return; }
  if (password.value !== confirm.value) { error.value = 'Le due password non coincidono.'; return; }
  submitting.value = true;
  try {
    await apiFetch<null>('/auth/credential-setup', { method: 'POST', body: JSON.stringify({ token, password: password.value }) });
    await router.push({ name: 'login', query: { setPassword: '1' } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossibile impostare la password.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <template #footer>Attivazione su invito · servizio per stabilimenti</template>

    <p v-if="phase === 'loading'" class="py-6 text-center text-sm text-[var(--color-text-muted)]">Verifica del link…</p>

    <template v-else-if="phase === 'invalid'">
      <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Link non valido</h1>
      <p class="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
        Questo link per impostare la password non è valido o è scaduto. Richiedi un nuovo invito o accedi se hai già impostato la password.
      </p>
      <RouterLink to="/login" class="font-semibold text-[var(--color-brand-ink)]">Vai al login</RouterLink>
    </template>

    <form v-else-if="phase === 'form'" class="flex flex-col gap-4" @submit.prevent="submit">
      <div>
        <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Imposta la password</h1>
        <p class="text-sm text-[var(--color-text-muted)]">Per l'account <strong data-testid="sp-email">{{ email }}</strong>.</p>
      </div>
      <Field label="Nuova password">
        <Input name="sp-password" data-testid="sp-password" v-model="password" type="password" placeholder="Almeno 10 caratteri" />
      </Field>
      <Field label="Conferma password">
        <Input name="sp-confirm" data-testid="sp-confirm" v-model="confirm" type="password" />
      </Field>
      <p v-if="error" data-testid="sp-error" class="text-xs text-[var(--color-danger)]">{{ error }}</p>
      <Button type="submit" data-testid="sp-submit" :disabled="submitting">Imposta password</Button>
    </form>
  </AuthLayout>
</template>
```

- [ ] **Step 4: Rotta pubblica**

In `apps/web-staff/src/router/index.ts`, aggiungere dopo la rotta `/register`:

```ts
  { path: '/imposta-password', name: 'set-password', component: () => import('@/features/auth/SetPasswordView.vue'), meta: { public: true, bare: true } },
```
(Il `beforeEach` esistente lascia passare le rotte `public: true` senza sessione — nessuna altra modifica alla guard.)

- [ ] **Step 5: Run → PASS**

Run: `corepack pnpm --filter @coralyn/web-staff test SetPasswordView`
Expected: PASS.

- [ ] **Step 6: Verifica RegisterView (già informativa, ADR-0028)**

Create `apps/web-staff/src/features/auth/RegisterView.spec.ts`: monta la view e asserisce che **non** effettua chiamate di rete e non ha un form di submit (è solo informativa). Esempio:
```ts
import { describe, it, expect, vi } from 'vitest';
const apiFetch = vi.fn();
vi.mock('@/lib/http', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
// montare RegisterView; expect(apiFetch).not.toHaveBeenCalled(); expect(container.querySelector('form')).toBeNull();
```

- [ ] **Step 7: Suite web-staff completa + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff exec vue-tsc -b
```
Expected: ≥ 210+ test verdi, typecheck pulito.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src
git commit -m "feat(web-staff): pagina pubblica set-password + verifica RegisterView informativa"
```

---

## Task 9: Infra (Mailpit) + ADR-0042 + deferred.md + verifica LIVE

**Files:**
- Modify: `docker-compose.yml` (servizio `mailpit` + env `api`)
- Create: `docs/architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md`
- Modify: `docs/architecture/deferred.md` (D-025)

- [ ] **Step 1: Aggiungere Mailpit e le env `MAIL_*` al compose**

In `docker-compose.yml`, aggiungere il servizio (senza profilo, utile anche in dev):

```yaml
  mailpit:
    image: axllent/mailpit:latest
    container_name: coralyn-mailpit
    ports:
      - "8025:8025"   # UI web
      - "1025:1025"   # SMTP
```
E nel blocco `api.environment`, aggiungere:
```yaml
      MAIL_HOST: "mailpit"
      MAIL_PORT: "1025"
      MAIL_SECURE: "false"
      MAIL_FROM: "Coralyn <no-reply@coralyn.dev>"
      APP_WEB_STAFF_URL: "http://localhost:8080"
      CREDENTIAL_TOKEN_TTL_HOURS: "72"
```
Aggiungere `mailpit` a `api.depends_on` (semplice, senza condition).

> Per `pnpm dev` locale (api sull'host): esportare `MAIL_HOST=localhost MAIL_PORT=1025 MAIL_FROM=... APP_WEB_STAFF_URL=http://localhost:5173 CREDENTIAL_TOKEN_TTL_HOURS=72` prima di avviare l'api, con `docker compose up -d mailpit` attivo.

- [ ] **Step 2: Scrivere ADR-0042**

Create `docs/architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md` con: Status Accepted, data 2026-07-05, context (zero email oggi, serve consegna credenziali senza password in chiaro), decision (porta `MailerService` + adapter SMTP nodemailer, Mailpit dev/test, provider-swappable via env; token opaco 256-bit hashato a riposo, monouso via `consumedAt`, TTL 72h; pagina pubblica set-password su web-staff, redirect-to-login; endpoint pubblici `GET/POST /auth/credential-setup`), alternatives scartate (provider SDK ora = vendor-lock; JWT+blocklist = stato senza vantaggi; auto-login = superficie token e accoppiamento), consequences, rubric check (i 4 filtri come da spec §8). Registrare i deferiti: rate-limiting D-027, timing D-029, template ricchi/bounce webhook.

- [ ] **Step 3: Aggiornare `deferred.md`**

In `docs/architecture/deferred.md`, aggiornare la voce **D-025**: marcare come **realizzata** la parte "invito-via-email" (admin provisioning + reset-admin) con riferimento a questo slice + ADR-0042; restano deferiti cambio-ruolo e reset **self-service** dello staff. Non serve un nuovo D (il meccanismo è generico e riusabile per gli inviti staff).

- [ ] **Step 4: Commit docs+infra**

```bash
git add docker-compose.yml docs/architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md docs/architecture/deferred.md
git commit -m "docs(adr): ADR-0042 trasporto email e consegna credenziali + Mailpit + D-025"
```

- [ ] **Step 5: Verifica LIVE (Docker + Mailpit)**

```bash
docker compose --profile full up -d --build api web web-platform mailpit
```
Sequenza di verifica (autenticato come superuser dev `super@coralyn.dev`):
1. Login superuser su web-platform (8081) → crea un nuovo lido con `adminEmail=live.admin@coralyn.test`. La modal mostra **"Invito inviato a … scade il …"** (nessuna password).
2. Aprire Mailpit UI `http://localhost:8025` → l'email di invito è presente; copiare il link `http://localhost:8080/imposta-password?token=…`.
3. Aprire il link su web-staff (8080) → il form mostra l'email; impostare una password ≥10 char → redirect a `/login`.
4. Login su web-staff con `live.admin@coralyn.test` + la password scelta → entra. Riaprire lo stesso link → **"Link non valido"** (monouso).
5. Su web-platform, dettaglio del lido → **Reset password admin** → conferma → nuova email di reset in Mailpit → impostare nuova password → login con la nuova OK, con la vecchia **401**.
6. Controprova permessi: `GET /api/auth/credential-setup/<token>` senza auth risponde (pubblico); `POST /api/platform/establishments/:id/reset-admin-password` come admin di lido → **403**.

Registrare gli esiti (curl/screenshot) prima di presentare.

- [ ] **Step 6: Typecheck globale finale**

Run (dalla root): `corepack pnpm --filter @coralyn/contracts build` poi `corepack pnpm -r exec tsc --noEmit` (o i typecheck per-pacchetto già usati sopra).
Expected: pulito ovunque (baseline `map.projection` già risolta).

---

## Self-review — copertura spec

- Token model (§3.1) → Task 2 + Task 4. ✅
- Mail port + SMTP + builder + Mailpit (§3.2, §3.6) → Task 3 + Task 9. ✅
- Endpoint issue (provisioning modificato + reset) (§3.3) → Task 6. ✅
- Endpoint redeem pubblici (§3.3) → Task 5. ✅
- Contracts (§3.5) → Task 1. ✅
- FE web-platform (§3.4) → Task 7. ✅
- FE web-staff set-password + RegisterView (§3.4) → Task 8. ✅
- ADR-0042 + deferred (§6) → Task 9. ✅
- Verifica LIVE (§6) → Task 9 Step 5. ✅
- Baseline non-regressione → controlli per-task (api Step 6 di Task 6; FE Task 7/8). ✅

**Nota su ordine enum/uso:** l'`ALTER TYPE … ADD VALUE 'reset_admin_password'` (Task 2) è in una migrazione **separata** dall'uso runtime del valore (Task 6), quindi nessun conflitto "unsafe use of new enum value" (che si verifica solo se lo si usa nella stessa transazione dell'ADD).
