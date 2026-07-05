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
  startTime?: string; // "HH:MM" (semiaperto [start,end)); assente per consumatori legacy
  endTime?: string;   // "HH:MM"
  sortOrder: number;
}

/** Input creazione fascia: orari "HH:MM" obbligatori; sortOrder default = append in coda. */
export interface CreateTimeSlotInput {
  name: string;
  startTime: string;
  endTime: string;
  sortOrder?: number;
}

/** Input modifica fascia: tutti opzionali (patch). Orari "HH:MM". */
export interface UpdateTimeSlotInput {
  name?: string;
  startTime?: string;
  endTime?: string;
  sortOrder?: number;
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

/** Tipo di dotazione a catalogo (tenant-scoped). `archived` presente solo se archiviato. */
export interface EquipmentTypeDTO {
  id: string;
  name: string;
  archived?: true;
}

/** Input creazione tipo di dotazione. */
export interface CreateEquipmentTypeInput {
  name: string;
}

/** Input modifica tipo di dotazione. */
export interface UpdateEquipmentTypeInput {
  name?: string;
}

/** Voce di dotazione di un pacchetto (nome risolto dal catalogo). */
export interface PackageEquipmentDTO {
  equipmentTypeId: string;
  name: string;
  quantity: number;
}

/** Pacchetto/dotazione prenotabile (ADR-0006). `archived` presente solo quando archiviato. */
export interface PackageDTO {
  id: string;
  name: string;
  equipment: PackageEquipmentDTO[]; // voci risolte dal catalogo, ordinate per nome
  archived?: boolean; // true = ritirato dalla circolazione (soft-delete); assente = attivo
}

/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). Stessa forma della create. */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito (A4.1): 'daily' | 'periodic' | 'subscription'
  startDate: string;   // ISO yyyy-mm-dd
  endDate?: string;    // ISO. periodic: fine · daily: omesso · subscription: derivata dalla stagione (server)
  packageId?: string;  // opzionale (nessun pacchetto = assente)
}

/** Preventivo calcolato dall'engine + provenienza (la Rate vincente, ADR-0032). */
export interface BookingQuoteDTO {
  totalPrice: number;    // EUR, 2 decimali
  matchedRate: RateDTO;  // la Rate che ha prodotto il prezzo (sempre presente: il quote risponde 200 solo se ok)
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

/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione (per id);
 *  tutto il resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
  destinationSeasonId: string;   // id della Season di destinazione
}

/**
 * DTO arricchito di una prenotazione, per la Scheda Cliente 360°. Deriva da BookingDTO
 * (senza `customerId`, implicito nella route) + arricchimenti di sola presentazione.
 * Date ISO yyyy-mm-dd.
 */
export interface CustomerBookingDTO {
  id: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  type: BookingType;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  amountCollected: number;
  paymentMethod?: PaymentMethod;
  collectionDate?: string;
  packageId?: string;
  previousBookingId?: string;
  // — arricchimenti server-side —
  umbrellaLabel: string;          // join Umbrella.label (il FE non carica la mappa)
  packageName?: string;           // nome del Package (se packageId presente); il FE non carica il catalogo
  sectorName?: string;            // nome del Settore dell'ombrellone (per il chip «Centro · A12»)
  seasonName?: string;            // Season che contiene startDate; assente se nessuna
  seniority?: number;             // SOLO subscription: lunghezza catena rinnovi (>=1)
  renewed?: boolean;              // SOLO subscription: esiste un rinnovo confermato
  prelazione?: {                  // SOLO subscription confermata con finestra APERTA. Assente altrimenti.
    destinationSeasonName: string;
    deadline: string;             // ISO yyyy-mm-dd
  };
}

export type ReportPeriod = 'today' | 'week' | 'season';

export interface ReportSummaryDTO {
  period: ReportPeriod;
  kpis: {
    revenue: number;             // incasso nel periodo
    outstanding: number;         // da incassare ora
    occupancyPct: number;        // occupazione attuale (oggi)
    activeSubscriptions: number; // abbonamenti attivi ora
  };
  revenueSeries: { label: string; value: number }[];
  umbrellaStateMix: { state: SlotState; count: number; pct: number }[];
  expiringRenewals: {
    customerId: string; customerName: string; umbrellaLabel: string; seniority: number; deadline: string;
  }[];
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

// --- Prelazione abbonamenti (D-011) -----------------------------------------

/** Input per aprire una campagna di prelazione. Le stagioni sono identificate per id. Server-autoritativo. */
export interface OpenRenewalCampaignInput {
  originSeasonId: string;       // id della Season di ORIGINE (aventi-diritto)
  destinationSeasonId: string;  // id della Season di DESTINAZIONE (da riservare)
  deadline: string;             // ISO yyyy-mm-dd: scadenza della finestra (uniforme per campagna)
}

/** Campagna di prelazione (una per stagione di destinazione). */
export interface RenewalCampaignDTO {
  id: string;
  originSeasonId: string;
  destinationSeasonId: string;
  deadline: string;         // ISO yyyy-mm-dd
}

/** Stato della finestra di un avente-diritto (derivato lazy). */
export type RenewalWindowState = 'open' | 'exercised' | 'expired';

/** Finestra di prelazione di un abbonato uscente, con priorità (anzianità) e stato derivato. */
export interface RenewalWindowItemDTO {
  sourceBookingId: string;  // l'abbonamento di ORIGINE (avente-diritto)
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  seniority: number;        // catena rinnovi (derivata, >= 1) — chiave d'ordinamento (priorità)
  state: RenewalWindowState;
}

/** Campagna + finestre (ordinate per anzianità decrescente). Ritorno di GET /renewal-campaigns. */
export interface RenewalCampaignDetailDTO extends RenewalCampaignDTO {
  windows: RenewalWindowItemDTO[];
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
}

/** Input creazione pacchetto. */
export interface CreatePackageInput {
  name: string;
  equipment: { equipmentTypeId: string; quantity: number }[];
}

/** Input modifica pacchetto: tutti i campi opzionali. */
export type UpdatePackageInput = Partial<CreatePackageInput>;

/** Membro del team dello stabilimento (superuser escluso: è di piattaforma). */
export interface EstablishmentMemberDTO {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  disabledAt: string | null; // ISO datetime = disabilitato (soft); null = attivo
}

/** Proiezione read-only della schermata Stabilimento (GET /api/establishment/overview). */
export interface EstablishmentOverviewDTO {
  establishment: { id: string; name: string };
  activeSeason: { name: string; startDate: string; endDate: string } | null; // copre oggi, else null
  timeSlots: { id: string; name: string }[]; // fasce operative, ordinate per sortOrder
  structure: {
    sectors: number;
    umbrellas: number;
    types: number;
    packages: number; // solo non archiviati
  };
  team: EstablishmentMemberDTO[]; // admin-first, poi email asc
}

/** Input rinomina stabilimento (admin-only). */
export interface UpdateEstablishmentInput {
  name: string;
}

/** Input creazione staff (admin-only). Password iniziale impostata dall'admin;
 *  invito-via-email deferito (D-025). Ruolo mai `superuser`. */
export interface CreateStaffUserInput {
  email: string;
  password: string;
  role: 'admin' | 'staff';
}

/** Input abilita/disabilita utente (admin-only, soft-disable). */
export interface UpdateStaffUserInput {
  disabled: boolean;
}

/** Disposizione di un settore (editor struttura). */
export type SectorKind = 'grid' | 'special';

/** Ombrellone nell'editor struttura (senza stato prenotazioni, a differenza di UmbrellaDTO della mappa). */
export interface StructureUmbrellaDTO { id: string; label: string; umbrellaTypeId: string | null; }
export interface StructureRowDTO { id: string; label: string; sortOrder: number; umbrellas: StructureUmbrellaDTO[]; }
export interface StructureSectorDTO { id: string; name: string; sortOrder: number; kind: SectorKind; rows: StructureRowDTO[]; }
/** Albero completo (GET /api/establishment/structure, admin-only). */
export interface EstablishmentStructureDTO {
  sectors: StructureSectorDTO[];   // ordinati per sortOrder; ogni fila per sortOrder, ombrelloni per logicalOrder
  umbrellaTypes: UmbrellaTypeDTO[]; // ordinati per sortOrder ("Normale" = null, non in lista)
}

/** Input creazione tipologia (admin-only). icon = chiave icon-registry ui-kit. */
export interface CreateUmbrellaTypeInput { name: string; icon: string; }
export interface UpdateUmbrellaTypeInput { name?: string; icon?: string; }

/** Settori (editor struttura, admin-only). */
export interface CreateSectorInput { name: string; kind: SectorKind; }
export interface UpdateSectorInput { name?: string; kind?: SectorKind; }
/** File (editor struttura, admin-only). Slice 2 = create-fila (label); il generatore è Slice 3. */
export interface CreateRowInput { sectorId: string; label: string; }
export interface UpdateRowInput { label?: string; }

/** Ombrelloni singoli (editor struttura, admin-only). umbrellaTypeId null = Normale. */
export interface CreateUmbrellaInput { rowId: string; label: string; umbrellaTypeId: string | null; }
export interface UpdateUmbrellaInput { label?: string; umbrellaTypeId?: string | null; }
/** Generatore a numerazione automatica in una fila (admin-only). */
export interface GenerateUmbrellasInput {
  rowId: string;
  prefix: string;                // '' = solo numero
  start: number;                 // "Da numero"
  count: number;                 // "Quantità" (1..60)
  umbrellaTypeId: string | null; // tipologia predefinita del batch
}
export interface GenerateUmbrellasResultDTO { created: number; skipped: number; umbrellas: StructureUmbrellaDTO[]; }

// --- Platform Console (superuser) --------------------------------------------

/** Metriche aggregate di un lido per la Platform Console (superuser). PII-free per costruzione
 *  (solo count/sum/timestamp): nessun dato personale dei bagnanti. Vedi ADR-0040. */
export interface PlatformEstablishmentDTO {
  id: string;
  name: string;
  createdAt: string; // ISO
  suspendedAt: string | null; // ISO | null
  // capacità (struttura)
  sectors: number;
  rows: number;
  umbrellas: number;
  // vitalità / engagement
  staffUsersActive: number;
  lastActivityAt: string | null; // max(Booking.createdAt) del lido — proxy "è vivo?" (D-044)
  // valore commerciale
  revenueSeasonTotal: number; // somma incassato della stagione attiva
  activeSubscriptions: number;
  bookingsThisSeason: number;
  // operatività live
  occupancyPctToday: number; // 0..100 — quota ombrelloni con prenotazione confermata oggi
}

/** Input di provisioning di un nuovo lido (superuser). */
export interface CreateEstablishmentInput {
  name: string;
  adminEmail: string;
}

/** Risposta della create: il DTO del lido + esito dell'invito email all'admin.
 *  Nessuna password in chiaro: l'admin la imposta via link. */
export interface CreateEstablishmentResponse {
  establishment: PlatformEstablishmentDTO;
  adminEmail: string;
  expiresAt: string; // ISO — scadenza del link di invito
}

/** Esito di un reset-password admin avviato dal console superuser. */
export interface ResetAdminPasswordResponse {
  adminEmail: string;
  expiresAt: string; // ISO — scadenza del link di reset
}

/** Contesto minimo mostrato dalla pagina set-password (nessun dato sensibile). */
export type CredentialTokenPurpose = 'invite' | 'reset';
export interface CredentialSetupContext {
  email: string;
  purpose: CredentialTokenPurpose;
}

/** Input del redeem: token dal link + nuova password scelta dall'utente. */
export interface SetPasswordInput {
  token: string;
  password: string;
}
