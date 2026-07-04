import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MapModule } from '../map/map.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [MapModule, BookingsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
