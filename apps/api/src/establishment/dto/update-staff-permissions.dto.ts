import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { CONFIGURABLE_PERMISSIONS, Permission, type UpdateStaffPermissionsInput } from '@coralyn/contracts';

/**
 * L'insieme **completo** dei permessi configurabili che l'admin vuole per quell'operatore: ciò che
 * non è elencato è revocato (ADR-0063, Decision 7).
 *
 * ⚠️ `@IsIn(CONFIGURABLE_PERMISSIONS)` e non `@IsEnum(Permission)`: i due permessi non
 * configurabili — `platform.administer` e `session.read` — devono dare **400**, non essere
 * silenziosamente ignorati. Un input rifiutato dice all'admin che ha chiesto una cosa impossibile;
 * uno ignorato gli fa credere di averla ottenuta.
 */
export class UpdateStaffPermissionsDto implements UpdateStaffPermissionsInput {
  @IsArray()
  @ArrayUnique()
  @IsIn(CONFIGURABLE_PERMISSIONS as Permission[], { each: true })
  permissions!: Permission[];
}
