/** Ruoli applicativi. Vedi ADR-0015 (superuser di piattaforma). */
export enum Ruolo {
  Admin = 'admin',
  Staff = 'staff',
  Superuser = 'superuser',
}

/** DTO di un Cliente (il bagnante). Condiviso FE/BE. Contatti opzionali (ADR-0023). */
export interface ClienteDTO {
  id: string;
  nome: string;
  cognome: string;
  telefono?: string;
  email?: string;
  note?: string;
}

/** Input di creazione di un Cliente (contatti opzionali). */
export interface CreaClienteInput {
  nome: string;
  cognome: string;
  telefono?: string;
  email?: string;
  note?: string;
}

/** Input di modifica anagrafica: tutti i campi opzionali. */
export type ModificaClienteInput = Partial<CreaClienteInput>;

/** Stato di uno slot (ombrellone, data, fascia). Derivato dal backend. ADR-0013/0020. */
export type StatoSlot = 'libero' | 'abbonato' | 'giornaliero' | 'prenotato';

/** Tipologia ombrellone (ADR-0016). `icona` = nome del registry icone (additivo, ADR-0020). */
export interface TipologiaDTO {
  id: string;
  nome: string;
  ordine: number;
  icona?: string; // fallback FE finché il backend non la espone
}

export interface FasciaDTO {
  id: string;
  nome: string;
  ordine: number;
}

export interface OmbrelloneDTO {
  id: string;
  etichetta: string;               // numero fisico reale (ADR-0016)
  tipologiaId: string | null;      // null = Normale
  filaId: string;
  statoPerFascia: Record<string, StatoSlot>; // chiave = FasciaDTO.id
}

export interface FilaDTO {
  id: string;
  etichetta: string;
  ordine: number;
  ombrelloni: OmbrelloneDTO[];
}

export interface SettoreDTO {
  id: string;
  nome: string;
  ordine: number;
  file: FilaDTO[];
}

/** Vista della mappa per una data (ADR-0020). Proposta FE da allineare col backend. */
export interface MappaGiornoDTO {
  data: string; // ISO yyyy-mm-dd
  tipologie: TipologiaDTO[];
  fasce: FasciaDTO[];
  settori: SettoreDTO[];
}
