/** Application roles. See ADR-0015 (platform superuser). */
export enum Role {
  Admin = 'admin',
  Staff = 'staff',
  Superuser = 'superuser',
}

/** DTO of a Customer (the bather). Shared FE/BE. Optional contacts (ADR-0023). */
export interface CustomerDTO {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** Input to create a Customer (optional contacts). */
export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** Input to edit a Customer: all fields optional. */
export type UpdateCustomerInput = Partial<CreateCustomerInput>;

/** State of a slot (umbrella, date, time slot). Derived from the backend. ADR-0013/0020. */
export type SlotState = 'free' | 'season' | 'daily' | 'booked';

/** Umbrella type (ADR-0016). `icon` = icon-registry key (additive, ADR-0020). */
export interface UmbrellaTypeDTO {
  id: string;
  name: string;
  sortOrder: number;
  icon?: string; // FE fallback until the backend exposes it
}

export interface TimeSlotDTO {
  id: string;
  name: string;
  sortOrder: number;
}

export interface UmbrellaDTO {
  id: string;
  label: string;                  // real physical number (ADR-0016)
  umbrellaTypeId: string | null;  // null = Normal
  rowId: string;
  stateBySlot: Record<string, SlotState>; // key = TimeSlotDTO.id
}

export interface RowDTO {
  id: string;
  label: string;
  sortOrder: number;
  umbrellas: UmbrellaDTO[];
}

export interface SectorDTO {
  id: string;
  name: string;
  sortOrder: number;
  rows: RowDTO[];
}

/** Map view for a date (ADR-0020). FE proposal aligned with the backend. */
export interface DayMapDTO {
  date: string; // ISO yyyy-mm-dd
  umbrellaTypes: UmbrellaTypeDTO[];
  timeSlots: TimeSlotDTO[];
  sectors: SectorDTO[];
}

/** Staff user profile. `establishmentId` null = platform superuser. */
export interface UserDTO {
  id: string;
  email: string;
  role: Role;
  establishmentId: string | null;
}

/** Login credentials. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Login response: access token + profile. */
export interface LoginResponse {
  accessToken: string;
  user: UserDTO;
}

/** Tipo di prenotazione (ADR-0006). A1 usa solo `daily`. */
export type BookingType = 'daily' | 'periodic' | 'subscription';

/** Pacchetto/dotazione prenotabile (ADR-0006). */
export interface PackageDTO {
  id: string;
  name: string;
  equipment: Record<string, number>; // es. { sunbeds: 2, deckchairs: 1 }
}

/** Unità di prezzo di una Tariffa (ADR-0006). */
export type RateUnit = 'day' | 'period';

/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  date: string;          // ISO yyyy-mm-dd
  packageId?: string;    // A3.1: assente (nessun pacchetto)
  type?: BookingType;    // default 'daily'
}

/** Preventivo calcolato dall'engine. */
export interface BookingQuoteDTO {
  totalPrice: number;    // EUR, 2 decimali
}

/** Stato del ciclo di vita. A1: `confirmed` alla creazione, `cancelled` all'annullo. */
export type BookingStatus = 'confirmed' | 'cancelled';

/** Stato incasso base (ADR-0011). A1: sempre `unpaid`. */
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

/** Metodo di pagamento (ADR-0011). A1: null. */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

/** DTO di una prenotazione. Date ISO yyyy-mm-dd. */
export interface BookingDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  type: BookingType;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  amountCollected: number;
  paymentMethod?: PaymentMethod; // A2 (additivo): assente finché non si incassa
  collectionDate?: string;       // A2 (additivo): ISO yyyy-mm-dd, assente finché non si incassa
  packageId?: string;            // A3.1 (additivo): assente finché non si sceglie (A3.2)
}

/** Input per creare una prenotazione giornaliera. Il prezzo è calcolato dal pricing engine (A3.1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string; // ISO yyyy-mm-dd
}

/** Input per registrare l'incasso base (ADR-0011). Lo stato è derivato server-side. */
export interface SettlePaymentInput {
  amountCollected: number;       // 0..totalPrice, max 2 decimali
  paymentMethod?: PaymentMethod; // obbligatorio se amountCollected > 0
  collectionDate?: string;       // ISO yyyy-mm-dd; default oggi Europe/Rome
}
