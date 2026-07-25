import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission';

export const PERMISSION_KEY = 'permission';

/**
 * Dichiara il permesso richiesto da una rotta (o da un intero controller).
 *
 * È **obbligatorio**: il `PermissionsGuard` nega in assenza del metadato (ADR-0057). Su una
 * classe vale per tutti i suoi handler; un handler può restringere o allargare dichiarando il
 * proprio (in `getAllAndOverride` il metodo vince sulla classe).
 */
export const RequiresPermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
