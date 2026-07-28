import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { IdentityService } from './identity.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { StaffPermissionsService } from './staff-permissions.service';
import { CredentialModule } from '../credential/credential.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h' },
      }),
    }),
    CredentialModule,
  ],
  controllers: [AuthController],
  providers: [
    IdentityService,
    TokenService,
    StaffPermissionsService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // L'ordine conta: JwtAuthGuard popola req.user, PermissionsGuard lo legge (ADR-0057).
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  // ⚠️ Esportato, non ri-provveduto altrove: `EstablishmentModule` importa questo modulo per
  // amministrare i permessi. È l'errore che `crypto.module.ts` ha dovuto correggere per
  // `PasswordHasher`, che cinque moduli istanziavano ciascuno per conto proprio (ADR-0063).
  exports: [StaffPermissionsService],
})
export class IdentityModule {}
