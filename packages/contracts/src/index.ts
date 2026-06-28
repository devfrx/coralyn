/** Ruoli applicativi. Vedi ADR-0015 (superuser di piattaforma). */
export enum Ruolo {
  Admin = 'admin',
  Staff = 'staff',
  Superuser = 'superuser',
}

/** DTO minimale di un Cliente (il bagnante). Condiviso FE/BE. */
export interface ClienteDTO {
  id: string;
  nome: string;
  cognome: string;
}
