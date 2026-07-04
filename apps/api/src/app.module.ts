import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { CustomersModule } from './customers/customers.module';
import { MapModule } from './map/map.module';
import { BookingsModule } from './bookings/bookings.module';
import { IdentityModule } from './identity/identity.module';
import { CatalogModule } from './catalog/catalog.module';
import { ReportsModule } from './reports/reports.module';
import { EstablishmentModule } from './establishment/establishment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    IdentityModule,
    CustomersModule,
    MapModule,
    CatalogModule,
    BookingsModule,
    ReportsModule,
    EstablishmentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
