import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CustomerTokenService } from './customer-token.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerAccessService } from './customer-access.service';
import { CustomerSessionService } from './customer-session.service';
import { CustomerAuthController } from './customer-auth.controller';
import { TenantModule } from '../tenant/tenant.module';
import { PasswordHasher } from '../identity/password-hasher';

// PasswordHasher è stateless: lo ri-provvediamo qui (come fa CredentialModule) per non creare
// una dipendenza circolare Identity↔CustomerAuth. TenantModule è @Global ma lo importiamo
// esplicitamente per dichiarare la dipendenza (TenantContext usato da CustomerAccessService).
@Module({
  imports: [
    TenantModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('CUSTOMER_JWT_EXPIRES_IN') ?? '30m' },
      }),
    }),
  ],
  controllers: [CustomerAuthController],
  providers: [
    CustomerTokenService,
    CustomerJwtGuard,
    CustomerAccessService,
    CustomerSessionService,
    PasswordHasher,
  ],
  exports: [CustomerTokenService, CustomerJwtGuard, CustomerAccessService, CustomerSessionService],
})
export class CustomerAuthModule {}
