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
