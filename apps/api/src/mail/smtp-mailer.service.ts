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
    if ((user && !pass) || (!user && pass)) {
      throw new Error('MAIL_USER e MAIL_PASS vanno impostati insieme (o entrambi assenti per SMTP senza auth).');
    }
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('MAIL_HOST'),
      port: Number(this.config.get<string>('MAIL_PORT') || '1025'),
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
