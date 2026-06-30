import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { ClientiModule } from './clienti/clienti.module';
import { MappaModule } from './mappa/mappa.module';
import { IdentitaModule } from './identita/identita.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    IdentitaModule,
    ClientiModule,
    MappaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
