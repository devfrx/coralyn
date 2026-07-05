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
