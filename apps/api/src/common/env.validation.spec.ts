import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Ambiente minimo valido: le sole obbligatorie, con i valori che un dev locale ha davvero. */
const MINIMO = {
  DATABASE_URL: 'postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public',
  JWT_SECRET: 'test-secret-change-me-at-least-32-characters-long',
  MAIL_HOST: 'localhost',
  MAIL_FROM: 'Coralyn <no-reply@coralyn.dev>',
  APP_WEB_STAFF_URL: 'http://localhost:5173',
  CUSTOMER_APP_URL: 'http://localhost:5175',
};

const messaggio = (env: Record<string, unknown>): string => {
  try {
    validateEnv(env);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('atteso un errore di validazione, non è stato sollevato');
};

describe('validateEnv', () => {
  it('accetta l’ambiente minimo di sviluppo, URL localhost compresi', () => {
    expect(() => validateEnv({ ...MINIMO })).not.toThrow();
  });

  it('accetta l’ambiente di produzione (https, porte SMTP reali, proxy davanti)', () => {
    expect(() =>
      validateEnv({
        ...MINIMO,
        NODE_ENV: 'production',
        APP_WEB_STAFF_URL: 'https://app.esempio.it',
        CUSTOMER_APP_URL: 'https://my.esempio.it',
        MAIL_PORT: '587',
        MAIL_SECURE: 'false',
        TRUST_PROXY_HOPS: '2',
        STAFF_AUTH_THROTTLE_LIMIT: '20',
      }),
    ).not.toThrow();
  });

  it('restituisce l’oggetto ricevuto INVARIATO (i lettori fanno Number(...) e === "true")', () => {
    const env = { ...MINIMO, MAIL_PORT: '1025', MAIL_SECURE: 'false', ALTRO_NON_DICHIARATO: 'x' };
    const out = validateEnv(env);
    expect(out).toBe(env); // identità, non copia: nessuna trasformazione può sfuggire
    expect(out.MAIL_PORT).toBe('1025'); // stringa, non 1025
    expect(out.MAIL_SECURE).toBe('false');
    expect(out.ALTRO_NON_DICHIARATO).toBe('x'); // le variabili non dichiarate passano
  });

  describe('ferma l’avvio e dice quale variabile', () => {
    it('CUSTOMER_APP_URL mancante — è il caso che degradava in silenzio bruciando il token', () => {
      const { CUSTOMER_APP_URL: _omessa, ...senza } = MINIMO;
      expect(messaggio(senza)).toContain('CUSTOMER_APP_URL');
    });

    it('CUSTOMER_APP_URL vuota — produceva un activationUrl relativo', () => {
      expect(messaggio({ ...MINIMO, CUSTOMER_APP_URL: '' })).toContain('CUSTOMER_APP_URL');
    });

    it('CUSTOMER_APP_URL senza protocollo', () => {
      expect(messaggio({ ...MINIMO, CUSTOMER_APP_URL: 'my.esempio.it' })).toContain('CUSTOMER_APP_URL');
    });

    it('JWT_SECRET troppo corto', () => {
      expect(messaggio({ ...MINIMO, JWT_SECRET: 'corto' })).toContain('JWT_SECRET');
    });

    it('DATABASE_URL che non è postgres', () => {
      expect(messaggio({ ...MINIMO, DATABASE_URL: 'mysql://x/y' })).toContain('DATABASE_URL');
    });

    it('APP_WEB_STAFF_URL mancante — prima falliva al PRIMO INVITO, non all’avvio', () => {
      const { APP_WEB_STAFF_URL: _omessa, ...senza } = MINIMO;
      expect(messaggio(senza)).toContain('APP_WEB_STAFF_URL');
    });

    it('MAIL_FROM mancante — idem', () => {
      const { MAIL_FROM: _omessa, ...senza } = MINIMO;
      expect(messaggio(senza)).toContain('MAIL_FROM');
    });

    it('CUSTOMER_THROTTLE_LIMIT non numerico — arrivava al throttler come NaN', () => {
      expect(messaggio({ ...MINIMO, CUSTOMER_THROTTLE_LIMIT: 'abc' })).toContain('CUSTOMER_THROTTLE_LIMIT');
    });

    it('TRUST_PROXY_HOPS=true — Express lo accetterebbe col significato «fidati di tutta la catena»', () => {
      expect(messaggio({ ...MINIMO, TRUST_PROXY_HOPS: 'true' })).toContain('TRUST_PROXY_HOPS');
    });

    it('NODE_ENV con un valore inatteso', () => {
      expect(messaggio({ ...MINIMO, NODE_ENV: 'staging' })).toContain('NODE_ENV');
    });

    it('elenca TUTTE le variabili sbagliate insieme, non solo la prima', () => {
      const msg = messaggio({ ...MINIMO, JWT_SECRET: 'corto', CUSTOMER_APP_URL: '' });
      expect(msg).toContain('JWT_SECRET');
      expect(msg).toContain('CUSTOMER_APP_URL');
    });
  });

  /**
   * Che la funzione validi non basta: deve essere AGGANCIATA, e l'aggancio deve fermare
   * l'inizializzazione del modulo. Una `validate` scritta bene ma non passata a `forRoot`
   * lascerebbe verdi tutti i test qui sopra. `ignoreEnvFile` rende il caso deterministico:
   * senza, il risultato dipenderebbe da quali `.env` esistono sulla macchina che lo esegue.
   */
  describe('aggancio a ConfigModule', () => {
    const originale = process.env;
    const conAmbiente = (env: Record<string, string>) => {
      process.env = { NODE_ENV: 'test', TZ: originale.TZ, ...env };
      return Test.createTestingModule({
        imports: [ConfigModule.forRoot({ ignoreEnvFile: true, validate: validateEnv })],
      }).compile();
    };
    afterEach(() => {
      process.env = originale;
    });

    it('ambiente completo → il modulo si monta', async () => {
      await expect(conAmbiente({ ...MINIMO })).resolves.toBeDefined();
    });

    it('CUSTOMER_APP_URL mancante → il modulo NON si monta', async () => {
      const { CUSTOMER_APP_URL: _omessa, ...senza } = MINIMO;
      await expect(conAmbiente(senza)).rejects.toThrow(/CUSTOMER_APP_URL/);
    });
  });
});
