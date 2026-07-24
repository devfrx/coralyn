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

  // Art. 14.3(a) GDPR: i dati dell'operatore li comunica il suo datore di lavoro, non lui, quindi
  // l'informativa va RESA entro un mese dalla raccolta. Questa email e' il primo contatto con
  // l'interessato, quindi e' il veicolo dell'adempimento: se il rinvio sparisce, l'adempimento
  // salta in silenzio. Vale per entrambi gli scopi, non solo per l'invito.
  it.each(['invite', 'reset'] as const)('%s: rinvia all informativa OPERATORI (art. 14.3.a)', (purpose) => {
    const m = buildCredentialSetupEmail({ ...base, purpose });
    expect(m.text).toContain('http://localhost:8080/legale/informativa');
    expect(m.html).toContain('href="http://localhost:8080/legale/informativa"');
  });

  it('il link sta sulla stessa origin del link di set-password', () => {
    const m = buildCredentialSetupEmail({ ...base, purpose: 'invite', webStaffUrl: 'https://app.esempio.it' });
    expect(m.text).toContain('https://app.esempio.it/legale/informativa');
    expect(m.text).not.toContain('localhost');
  });

  // L'email va all'OPERATORE: deve puntare alla policy che riguarda LUI (titolare = Coralyn), mai
  // a `/privacy`, che e' il path dell'informativa al BAGNANTE servita da web-customer con
  // ?e=<establishmentId> e titolare = il lido. Sono documenti diversi per interessati diversi.
  it('non punta mai al path dell informativa del bagnante', () => {
    const m = buildCredentialSetupEmail({ ...base, purpose: 'invite' });
    expect(m.text).not.toMatch(/localhost:8080\/privacy(\?|\s|$)/);
    expect(m.html).not.toContain('href="http://localhost:8080/privacy"');
  });

  it('non introduce trattamenti nascosti: nessuna immagine, quindi nessun pixel di tracciamento', () => {
    // Provv. Garante n. 284 del 17/04/2026 sui tracking pixel nelle email. Il template deve restare
    // testo + link: e' cio' che i documenti in docs/legal/ dichiarano verificato.
    const m = buildCredentialSetupEmail({ ...base, purpose: 'invite' });
    expect(m.html).not.toMatch(/<img/i);
  });
});
