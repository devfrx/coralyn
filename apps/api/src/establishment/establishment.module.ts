import { Module } from '@nestjs/common';
import { EstablishmentController } from './establishment.controller';
import { EstablishmentService } from './establishment.service';
import { EstablishmentUsersController } from './establishment-users.controller';
import { EstablishmentUsersService } from './establishment-users.service';
import { PasswordHasher } from '../identity/password-hasher';

@Module({
  controllers: [EstablishmentController, EstablishmentUsersController],
  providers: [EstablishmentService, EstablishmentUsersService, PasswordHasher],
})
export class EstablishmentModule {}
