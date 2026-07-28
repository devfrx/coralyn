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
import { SetupStatusService } from './setup-status.service';
import { LegalProfileService } from './legal-profile.service';
import { LegalProfileController } from './legal-profile.controller';
import { CredentialModule } from '../credential/credential.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  // `IdentityModule` per `StaffPermissionsService`, che è provveduto ed esportato da lì una volta
  // sola. ⚠️ Non ri-provvederlo qui: è l'errore che `crypto.module.ts` ha corretto per
  // `PasswordHasher`. Nessun ciclo: IdentityModule → CredentialModule → MailModule.
  imports: [CredentialModule, IdentityModule],
  controllers: [
    EstablishmentController,
    EstablishmentUsersController,
    EstablishmentStructureController,
    UmbrellaTypesController,
    SectorsController,
    RowsController,
    UmbrellasController,
    LegalProfileController,
  ],
  providers: [
    EstablishmentService,
    EstablishmentUsersService,
    EstablishmentStructureService,
    UmbrellaTypesService,
    SectorsService,
    RowsService,
    UmbrellasService,
    SetupStatusService,
    LegalProfileService,
      ],
  exports: [SetupStatusService, LegalProfileService],
})
export class EstablishmentModule {}
