import { Role } from '@coralyn/contracts';

/** Forma di `req.user` dopo la guard. */
export interface AuthUser {
  id: string;
  role: Role;
  establishmentId: string | null;
}
