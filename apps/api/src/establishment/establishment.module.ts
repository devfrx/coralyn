import { Module } from '@nestjs/common';
import { EstablishmentController } from './establishment.controller';
import { EstablishmentService } from './establishment.service';
import { EstablishmentUsersController } from './establishment-users.controller';
import { EstablishmentUsersService } from './establishment-users.service';
import { EstablishmentStructureController } from './establishment-structure.controller';
import { EstablishmentStructureService } from './establishment-structure.service';
import { UmbrellaTypesController } from './umbrella-types.controller';
import { UmbrellaTypesService } from './umbrella-types.service';
import { SectorsController } from './sectors.controller';
import { SectorsService } from './sectors.service';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';
import { UmbrellasController } from './umbrellas.controller';
import { UmbrellasService } from './umbrellas.service';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialModule } from '../credential/credential.module';

@Module({
  imports: [CredentialModule],
  controllers: [
    EstablishmentController,
    EstablishmentUsersController,
    EstablishmentStructureController,
    UmbrellaTypesController,
    SectorsController,
    RowsController,
    UmbrellasController,
  ],
  providers: [
    EstablishmentService,
    EstablishmentUsersService,
    EstablishmentStructureService,
    UmbrellaTypesService,
    SectorsService,
    RowsService,
    UmbrellasService,
    PasswordHasher,
  ],
})
export class EstablishmentModule {}
