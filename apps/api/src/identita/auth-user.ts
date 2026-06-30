import { Ruolo } from '@coralyn/contracts';

/** Forma di `req.user` dopo la guard. */
export interface AuthUser {
  id: string;
  ruolo: Ruolo;
  stabilimentoId: string | null;
}
