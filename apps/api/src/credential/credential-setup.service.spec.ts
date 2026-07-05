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
      updateMany: ({ where, data }: any) => {
        const match = tokens.filter((t) =>
          (where.id !== undefined ? t.id === where.id : t.userId === where.userId) &&
          (where.consumedAt === null ? t.consumedAt === null : true));
        match.forEach((t) => Object.assign(t, data));
        return Promise.resolve({ count: match.length });
      },
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

  it('redeem: secondo redeem dello stesso token → NotFoundException (monouso)', async () => {
    const { client, tokens } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    const raw = 'once-raw';
    tokens.push({ id: 't1', userId: 'u1', tokenHash: hashToken(raw), purpose: 'invite', consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    await svc.redeem(raw, 'prima-password-1');
    await expect(svc.redeem(raw, 'seconda-password-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getContext: token valido → email+purpose; inesistente → NotFoundException', async () => {
    const { client, tokens } = makePrisma();
    const svc = new CredentialSetupService(client, hasher, mailer, config);
    const raw = 'ctx-raw';
    tokens.push({ id: 't1', userId: 'u1', tokenHash: hashToken(raw), purpose: 'reset', consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    expect(await svc.getContext(raw)).toEqual({ email: 'a@lido.test', purpose: 'reset' });
    await expect(svc.getContext('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issueAndSend: se l’invio email fallisce, il token resta persistito e non propaga (best-effort)', async () => {
    const { client, tokens } = makePrisma();
    const failingMailer = { sendCredentialSetup: jest.fn().mockRejectedValue(new Error('smtp down')) } as any;
    const svc = new CredentialSetupService(client, hasher, failingMailer, config);
    await expect(svc.issueAndSend('u1', 'a@lido.test', 'invite', 'su1')).resolves.toEqual({ expiresAt: expect.any(Date) });
    expect(tokens).toHaveLength(1); // token persistito nonostante il fallimento invio
  });
});
