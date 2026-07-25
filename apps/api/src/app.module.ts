import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { CustomersModule } from './customers/customers.module';
import { MapModule } from './map/map.module';
import { BookingsModule } from './bookings/bookings.module';
import { CryptoModule } from './crypto/crypto.module';
import { IdentityModule } from './identity/identity.module';
import { CatalogModule } from './catalog/catalog.module';
import { ReportsModule } from './reports/reports.module';
import { EstablishmentModule } from './establishment/establishment.module';
import { PlatformModule } from './platform/platform.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { RentalsModule } from './rentals/rentals.module';
import { InformativaModule } from './informativa/informativa.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { validateEnv } from './common/env.validation';

@Module({
  imports: [
    // `validate`: la configurazione è verificata all'AVVIO. Prima le variabili obbligatorie
    // fallivano in tre momenti diversi — avvio, primo invito, mai — e l'ultima categoria
    // degradava in silenzio bruciando un token monouso. Vedi common/env.validation.ts.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Rate-limit env-driven. NESSUN APP_GUARD globale: il ThrottlerGuard è applicato solo al
    // CustomerAuthController (controller-scoped) così tocca esclusivamente /customer/* (D-027).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: Number(config.get<string>('CUSTOMER_THROTTLE_LIMIT') || '10') },
      ],
    }),
    PrismaModule,
    TenantModule,
    CryptoModule,
    IdentityModule,
    CustomersModule,
    MapModule,
    CatalogModule,
    BookingsModule,
    ReportsModule,
    EstablishmentModule,
    PlatformModule,
    CustomerAuthModule,
    RentalsModule,
    InformativaModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {}
