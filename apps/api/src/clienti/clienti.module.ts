import { Module } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClientiController } from './clienti.controller';

@Module({
  controllers: [ClientiController],
  providers: [ClientiService],
})
export class ClientiModule {}
