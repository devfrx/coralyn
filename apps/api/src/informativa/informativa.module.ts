import { Module } from '@nestjs/common';
import { EstablishmentModule } from '../establishment/establishment.module';
import { PublicInformativaController } from './public-informativa.controller';

@Module({
  imports: [EstablishmentModule],
  controllers: [PublicInformativaController],
})
export class InformativaModule {}
