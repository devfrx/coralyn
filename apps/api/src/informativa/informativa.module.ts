import { Module } from '@nestjs/common';
import { EstablishmentModule } from '../establishment/establishment.module';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { PublicInformativaController } from './public-informativa.controller';
import { CustomerInformativaController } from './customer-informativa.controller';

@Module({
  imports: [EstablishmentModule, CustomerAuthModule],
  controllers: [PublicInformativaController, CustomerInformativaController],
})
export class InformativaModule {}
