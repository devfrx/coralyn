import { SetMetadata } from '@nestjs/common';
import type { Role } from '@coralyn/contracts';

export const ROLES_KEY = 'roles';

/** Restringe una rotta ai ruoli indicati; il RolesGuard applica il check. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
