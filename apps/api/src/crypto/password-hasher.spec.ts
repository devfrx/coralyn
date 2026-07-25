import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produce un hash diverso dal plaintext e lo verifica', async () => {
    const hash = await hasher.hash('s3cret-password');
    expect(hash).not.toBe('s3cret-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 's3cret-password')).toBe(true);
  });

  it('rifiuta una password errata', async () => {
    const hash = await hasher.hash('s3cret-password');
    expect(await hasher.verify(hash, 'password-sbagliata')).toBe(false);
  });
});
