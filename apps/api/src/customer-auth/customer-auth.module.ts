import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CustomerTokenService } from './customer-token.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerAccessService } from './customer-access.service';
import { CustomerSessionService } from './customer-session.service';
import { CustomerAuthController } from './customer-auth.controller';
import { TenantModule } from '../tenant/tenant.module';

// TenantModule è @Global ma lo importiamo esplicitamente per dichiarare la dipendenza
// (TenantContext usato da CustomerAccessService).
//
// ⛔ Qui c'era: «PasswordHasher lo ri-provvediamo per non creare una dipendenza circolare
// Identity↔CustomerAuth». Il ciclo NON esisteva — IdentityModule importa solo JwtModule e
// CredentialModule, mai questo — ed era una copia del commento di CredentialModule, dove invece
// è vero. Ora l'hasher arriva da CryptoModule (@Global), unico per tutto il processo.
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
      ],
  exports: [CustomerTokenService, CustomerJwtGuard, CustomerAccessService, CustomerSessionService],
})
export class CustomerAuthModule {}
