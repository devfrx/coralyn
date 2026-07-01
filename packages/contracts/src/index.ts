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

/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). Stessa forma della create. */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito (A4.1): 'daily' | 'periodic' | 'subscription'
  startDate: string;   // ISO yyyy-mm-dd
  endDate?: string;    // ISO. periodic: fine · daily: omesso · subscription: derivata dalla stagione (server)
  packageId?: string;  // opzionale (nessun pacchetto = assente)
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
  packageId?: string;            // A3.1 (additivo): valorizzato dal selettore Pacchetto (A3.2); assente = nessun pacchetto
  previousBookingId?: string;    // A4.2 (additivo): valorizzato per i rinnovi (link al precedente)
}

/** Input per creare una prenotazione. Prezzo e (per subscription) durata sono server-autoritativi (A4.1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito: daily | periodic | subscription
  startDate: string;   // ISO. daily: il giorno · periodic: inizio · subscription: data che identifica la Stagione
  endDate?: string;    // ISO. periodic: OBBLIGATORIO (≥ startDate) · daily: omesso (=startDate) · subscription: VIETATO
  packageId?: string;  // opzionale (null = tariffa base)
}

/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione; tutto il
 *  resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
  startDate: string;   // ISO yyyy-mm-dd: una data DENTRO la stagione di destinazione (identifica la Season)
}

/** Voce dell'elenco abbonati di una stagione (campagna rinnovi, A4.2). */
export interface SubscriptionListItemDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  startDate: string;   // = season.startDate
  endDate: string;     // = season.endDate
  totalPrice: number;
  seniority: number;   // lunghezza catena dei rinnovi (derivata, >= 1)
  renewed: boolean;    // esiste già un rinnovo CONFERMATO di questo abbonamento
}

/** Input per registrare l'incasso base (ADR-0011). Lo stato è derivato server-side. */
export interface SettlePaymentInput {
  amountCollected: number;       // 0..totalPrice, max 2 decimali
  paymentMethod?: PaymentMethod; // obbligatorio se amountCollected > 0
  collectionDate?: string;       // ISO yyyy-mm-dd; default oggi Europe/Rome
}

// --- Listino / editor (D-032) -----------------------------------------------

/** Stagione operativa dello Stabilimento (ADR-0031). Date ISO yyyy-mm-dd. */
export interface SeasonDTO {
  id: string;
  name: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
}

/** Input per creare una stagione (il Pricing 1:1 lo crea il backend). */
export interface CreateSeasonInput {
  name: string;
  startDate: string;
  endDate: string;
}

/** Tariffa (Rate): regola di prezzo multi-dimensione. Ogni dimensione assente = wildcard.
 *  Esposta al FE con `seasonId` (non `pricingId`): `Pricing` è plumbing interno. */
export interface RateDTO {
  id: string;
  seasonId: string;
  type?: BookingType;
  sectorId?: string;
  rowId?: string;
  packageId?: string;
  timeSlotId?: string;
  periodStart?: string; // ISO yyyy-mm-dd
  periodEnd?: string;   // ISO yyyy-mm-dd
  price: number;        // EUR, max 2 decimali
  unit: RateUnit;
}

/** Input creazione tariffa: come RateDTO senza `id` (include `seasonId`). */
export type CreateRateInput = Omit<RateDTO, 'id'>;

/** Input modifica tariffa: tutte le dimensioni/prezzo opzionali; `seasonId` non modificabile.
 *  Le dimensioni accettano esplicitamente `null` per azzerare il vincolo (wildcard): `undefined`
 *  = campo non toccato, `null` = campo svuotato. `JSON.stringify` droppa `undefined` ma preserva
 *  `null`, quindi il FE deve inviare `null` per cancellare una dimensione in modifica. */
export interface UpdateRateInput {
  type?: BookingType | null;
  sectorId?: string | null;
  rowId?: string | null;
  packageId?: string | null;
  timeSlotId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  price?: number;
  unit?: RateUnit;
}

/** Input creazione pacchetto. */
export interface CreatePackageInput {
  name: string;
  equipment: Record<string, number>;
}

/** Input modifica pacchetto: tutti i campi opzionali. */
export type UpdatePackageInput = Partial<CreatePackageInput>;
