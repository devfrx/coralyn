import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { CustomersModule } from './customers/customers.module';
import { MapModule } from './map/map.module';
import { IdentityModule } from './identity/identity.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    IdentityModule,
    CustomersModule,
    MapModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
