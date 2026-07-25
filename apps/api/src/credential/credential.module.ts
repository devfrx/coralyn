import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CredentialSetupService } from './credential-setup.service';

@Module({
  imports: [MailModule],
  providers: [CredentialSetupService],
  exports: [CredentialSetupService],
})
export class CredentialModule {}
