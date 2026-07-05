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
