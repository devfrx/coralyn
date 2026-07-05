import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialModule } from '../credential/credential.module';

@Module({
  imports: [CredentialModule],
  controllers: [PlatformController],
  providers: [PlatformMetricsService, PlatformProvisioningService, PasswordHasher],
})
export class PlatformModule {}
