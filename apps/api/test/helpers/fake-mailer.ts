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
