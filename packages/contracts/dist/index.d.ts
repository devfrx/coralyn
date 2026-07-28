/** Application roles. See ADR-0015 (platform superuser). */
export declare enum Role {
    Admin = "admin",
    Staff = "staff",
    Superuser = "superuser"
}
/**
 * Permesso richiesto da un endpoint. Sostituisce `@Roles` come vocabolario
 * dell'autorizzazione (ADR-0057, emenda ADR-0039).
 *
 * Granularità: una voce per **area funzionale della UI** — le sezioni che l'operatore vede
 * nella sidebar — più le azioni che oggi sono admin-only dentro un'area. È la granularità a
 * cui l'admin di un lido ragiona quando concede permessi al proprio staff (ADR-0063).
 *
 * Il valore stringa è stabile e **vive in configurazione/DB**: non rinominarlo alla leggera.
 *
 * ⚠️ Vive qui e non più in `apps/api/` da ADR-0063: la schermata di amministrazione deve
 * enumerare i permessi per renderne gli interruttori, e il gating del frontend è su permesso.
 * Il prezzo è che rinominare un valore ora rompe due app e non solo l'API.
 */
export declare enum Permission {
    /** Mappa della giornata (sola lettura della struttura + stato slot). */
    MapRead = "map.read",
    /** Banco prenotazioni: preventivo, elenco, creazione, rinnovo, disdetta, incasso. */
    BookingsManage = "bookings.manage",
    /** Ciclo di vita dell'abbonamento: sospensione, riattivazione, cessione, assenze. */
    BookingsAdminister = "bookings.administer",
    /** Anagrafica bagnanti: consultazione, creazione, modifica. */
    CustomersManage = "customers.manage",
    /** Cancellazione GDPR del cliente (art. 17): erasure o anonimizzazione. */
    CustomersErase = "customers.erase",
    /** Accesso self-service del bagnante: generazione QR+PIN e revoca. */
    CustomerAccessManage = "customer-access.manage",
    /** Banco noleggi della giornata: consegna, rientro, annullo, incasso. */
    RentalsOperate = "rentals.operate",
    /** Listino noleggi: articoli e tariffe stagionali. */
    RentalCatalogManage = "rental-catalog.manage",
    /** Listino: stagioni, tariffe, pacchetti, dotazioni, fasce orarie. */
    PricingManage = "pricing.manage",
    /** Campagne di rinnovo abbonamenti. */
    RenewalsManage = "renewals.manage",
    /** Report di andamento della stagione. */
    ReportsRead = "reports.read",
    /** Scheda dello stabilimento in sola lettura (usata anche dall'app-shell). */
    EstablishmentRead = "establishment.read",
    /** Configurazione dello stabilimento: rinomina, stato di setup. */
    EstablishmentManage = "establishment.manage",
    /**
     * Profilo legale del lido (titolare del trattamento nell'informativa al bagnante).
     * Deliberatamente separato da `establishment.manage`: è la superficie che alimenta un
     * documento di legge (ADR-0055/0056), concederla non deve essere un effetto collaterale
     * del concedere la configurazione generale.
     */
    LegalProfileManage = "legal-profile.manage",
    /** Lettura della struttura (settori, file, ombrelloni) senza poterla modificare. */
    StructureRead = "structure.read",
    /** Editor della struttura: settori, file, ombrelloni, tipologie. */
    StructureManage = "structure.manage",
    /** Gestione degli operatori del lido (invito, disabilitazione, reset password, permessi). */
    TeamManage = "team.manage",
    /** Console di piattaforma, cross-tenant: solo il distributore (ADR-0015). */
    PlatformAdminister = "platform.administer",
    /** Profilo della propria sessione: ogni identità autenticata lo legge. */
    SessionRead = "session.read"
}
/**
 * I due permessi che l'admin di un lido **non** può concedere né revocare (ADR-0063 §5.1),
 * per ragioni diverse:
 *
 * - `platform.administer` è cross-tenant e del solo distributore (ADR-0015): non è del lido
 *   da concedere.
 * - `session.read` è il permesso di leggere la **propria** sessione. Revocarlo non esprime una
 *   divisione dei compiti: disabilita l'account — e per quello esiste già `User.disabledAt`.
 */
export declare const NON_CONFIGURABLE_PERMISSIONS: readonly Permission[];
/**
 * I 17 permessi che l'admin del lido concede o revoca al proprio staff.
 *
 * Derivato, non scritto a mano: aggiungere una voce all'enum la rende configurabile per
 * costruzione, e dimenticarla qui diventa impossibile.
 */
export declare const CONFIGURABLE_PERMISSIONS: readonly Permission[];
/**
 * Etichetta italiana dell'interruttore nella schermata di amministrazione.
 *
 * `Record` completo e non parziale: un permesso nuovo senza etichetta **non compila**, che è la
 * sola forma di copertura che non invecchia (stesso spirito di `authorization-coverage.spec.ts`).
 */
export declare const PERMISSION_LABELS: Readonly<Record<Permission, string>>;
/**
 * Quali ruoli detengono ciascun permesso **per difetto di fabbrica** (ADR-0057, ADR-0063).
 *
 * ⚠️ **Da ADR-0063 questa tabella è il default, non la risposta.** Per lo `staff` la risposta la
 * dà `StaffPermissionsService`, che applica sopra gli override configurati dall'admin del lido.
 * Resta ciò che vale per un lido che non ha configurato nulla — e per ogni permesso aggiunto in
 * futuro all'enum, che eredita il default invece di nascere negato.
 *
 * ⚠️ **Vive qui e non in `apps/api/`** (ADR-0064): il banco di prova di web-staff deve poter
 * costruire un operatore realistico, e la lista dello staff era *ricopiata a mano* in
 * `apps/web-staff/src/test/utils.ts` con un commento che la dichiarava derivata. Con il gating
 * per query di ADR-0064 una divergenza avrebbe fatto esercitare a tutta la suite un operatore
 * inesistente. `apps/api/src/identity/permission.ts` la ri-esporta, come già fa per `Permission`.
 *
 * `Record` completo e non parziale: un permesso nuovo senza riga **non compila**.
 */
export declare const PERMISSION_ROLES: Readonly<Record<Permission, readonly Role[]>>;
/** I permessi che un ruolo detiene per difetto di fabbrica. */
export declare function permissionsOfRoleDefault(role: Role): readonly Permission[];
/** DTO of a Customer (the bather). Shared FE/BE. Optional contacts (ADR-0023). */
export interface CustomerDTO {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    notes?: string;
    anonymizedAt?: string;
}
/** Esito della cancellazione GDPR di un cliente. */
export type DeleteCustomerResult = {
    outcome: 'deleted' | 'anonymized';
};
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
export type SlotState = 'free' | 'season' | 'daily' | 'booked' | 'covered';
/** Umbrella type (ADR-0016). `icon` = icon-registry key (additive, ADR-0020). */
export interface UmbrellaTypeDTO {
    id: string;
    name: string;
    sortOrder: number;
    icon?: string;
}
export interface TimeSlotDTO {
    id: string;
    name: string;
    startTime?: string;
    endTime?: string;
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
    label: string;
    umbrellaTypeId: string | null;
    rowId: string;
    stateBySlot: Record<string, SlotState>;
    coveredBySlot?: Record<string, string[]>;
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
    kind: SectorKind;
    rows: RowDTO[];
}
/** Map view for a date (ADR-0020). FE proposal aligned with the backend. */
export interface DayMapDTO {
    date: string;
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
    establishmentName: string | null;
    /**
     * Insieme **effettivo** dei permessi: default di fabbrica del ruolo, corretto dagli override
     * per operatore (ADR-0063). Viaggia qui e non in una chiamata a parte perché `login` e
     * `rehydrate` lo hanno già, ed è il solo punto da cui il frontend lo legge.
     */
    permissions: Permission[];
}
/** Permessi effettivi di un operatore del team, per la schermata di amministrazione (ADR-0063). */
export interface StaffPermissionsDTO {
    userId: string;
    permissions: Permission[];
}
/**
 * L'insieme **completo** dei permessi configurabili che l'admin vuole per quell'operatore: ciò
 * che non è elencato è revocato. Il server persiste solo lo scarto dal default di fabbrica.
 */
export interface UpdateStaffPermissionsInput {
    permissions: Permission[];
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
    equipment: PackageEquipmentDTO[];
    archived?: boolean;
}
/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). Stessa forma della create. */
export interface QuoteBookingInput {
    umbrellaId: string;
    timeSlotId: string;
    type: BookingType;
    startDate: string;
    endDate?: string;
    packageId?: string;
}
/** Preventivo calcolato dall'engine + provenienza (la Rate vincente, ADR-0032). */
export interface BookingQuoteDTO {
    totalPrice: number;
    matchedRate: RateDTO;
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
    paymentMethod?: PaymentMethod;
    collectionDate?: string;
    packageId?: string;
    previousBookingId?: string;
    refundedAmount?: number;
    terminatedAt?: string;
    terminationReason?: string;
}
/** Input per creare una prenotazione. Prezzo e (per subscription) durata sono server-autoritativi (A4.1). */
export interface CreateBookingInput {
    customerId: string;
    umbrellaId: string;
    timeSlotId: string;
    type: BookingType;
    startDate: string;
    endDate?: string;
    packageId?: string;
}
/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione (per id);
 *  tutto il resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
    destinationSeasonId: string;
}
/** Input disdetta anticipata di un abbonamento (D-013, admin-only). `effectiveDate` = primo giorno
 *  in cui il posto torna libero; `refundAmount` = importo rimborsato deciso dall'operatore. */
export interface TerminateSubscriptionInput {
    effectiveDate: string;
    refundAmount: number;
    reason?: string;
}
/** Una sospensione registrata su un abbonamento (D-013). endDate assente = aperta (in corso). */
export interface SuspensionDTO {
    id: string;
    startDate: string;
    endDate?: string;
    refundedAmount: number;
    reason?: string;
    reactivatedAt?: string;
}
/** Sospendi un abbonamento. endDate presente = chiusa [S, R-1]; assente = aperta [S, …). */
export interface SuspendSubscriptionInput {
    startDate: string;
    endDate?: string;
    refundAmount?: number;
    reason?: string;
}
/** Riattiva la sospensione aperta di un abbonamento. */
export interface ReactivateSubscriptionInput {
    returnDate: string;
    refundAmount: number;
    reason?: string;
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
    refundedAmount?: number;
    terminatedAt?: string;
    terminationReason?: string;
    suspensions?: SuspensionDTO[];
    transfers?: TransferDTO[];
    absenceConsentAt?: string | null;
    absenceReleases?: AbsenceReleaseDTO[];
    umbrellaLabel: string;
    packageName?: string;
    sectorName?: string;
    umbrellaRetiredAt?: string;
    umbrellaRetiredFrom?: string;
    seasonName?: string;
    seniority?: number;
    renewed?: boolean;
    prelazione?: {
        destinationSeasonName: string;
        deadline: string;
    };
}
/** Una cessione registrata su un abbonamento (D-013, ADR-0047). Storia del passaggio di titolarità. */
export interface TransferDTO {
    id: string;
    effectiveDate: string;
    previousCustomerId: string;
    previousCustomerName: string;
    newCustomerId: string;
    newCustomerName: string;
    refundToPrevious: number;
    collectedFromNew: number;
    reason?: string;
    createdAt: string;
}
/** Riga "cessioni effettuate" nella Scheda del CEDENTE: abbonamenti che questo cliente ha ceduto ad altri. */
export interface CededSubscriptionDTO {
    transferId: string;
    bookingId: string;
    effectiveDate: string;
    newCustomerName: string;
    umbrellaLabel: string;
    seasonName?: string;
    refundToPrevious: number;
    reason?: string;
    createdAt: string;
}
export type AbsenceReleaseSource = 'operator' | 'customer';
/** Un'assenza comunicata registrata su un abbonamento (D-035 S1/S2, ADR-0048). */
export interface AbsenceReleaseDTO {
    id: string;
    date: string;
    source: AbsenceReleaseSource;
    canceledAt: string | null;
    resold: boolean;
    reason?: string;
    createdAt: string;
}
/** Grant/revoke del consenso "assenze comunicate" (admin-only). */
export interface SetAbsenceConsentInput {
    consent: boolean;
}
/** Registrazione di un'assenza comunicata per un giorno (admin-only). */
export interface ReleaseAbsenceInput {
    date: string;
    reason?: string;
}
/** Attivazione: enrollment token (dal link) + PIN operatore. */
export interface CustomerActivateInput {
    enrollmentToken: string;
    pin: string;
}
/** Rotazione della sessione: refresh token corrente (dal device). */
export interface CustomerRefreshInput {
    refreshToken: string;
}
/** Risposta auth cliente. I raw NON vanno mai loggati/persistiti lato server. */
export interface CustomerAuthResponse {
    accessToken: string;
    refreshToken: string;
}
/** Session-check del cliente autenticato (mirror di /auth/me). */
export interface CustomerMeDTO {
    customerId: string;
    firstName: string;
    lastName: string;
    establishmentName: string;
}
/** Ritorno del provisioning operatore. Il PIN e l'URL sono mostrati UNA volta. */
export interface CustomerProvisionResponse {
    activationUrl: string;
    pin: string;
    expiresAt: string;
}
/** Stato dell'accesso cliente per la Scheda cliente (nessun segreto). */
export type CustomerAccessState = 'none' | 'issued' | 'active' | 'revoked';
export interface CustomerAccessStatusDTO {
    state: CustomerAccessState;
    lastActivatedAt: string | null;
}
/** Input cessione/subentro (D-013, admin-only). Cambia il titolare A->B e riconcilia l'incasso.
 *  refundToPrevious/collectedFromNew = movimento netto su amountCollected (refundedAmount intatto). */
export interface TransferSubscriptionInput {
    newCustomerId: string;
    effectiveDate: string;
    refundToPrevious: number;
    collectedFromNew: number;
    reason?: string;
}
export type ReportPeriod = 'today' | 'week' | 'season';
export interface ReportSummaryDTO {
    period: ReportPeriod;
    kpis: {
        revenue: number;
        outstanding: number;
        occupancyPct: number;
        activeSubscriptions: number;
    };
    revenueSeries: {
        label: string;
        value: number;
    }[];
    umbrellaStateMix: {
        state: SlotState;
        count: number;
        pct: number;
    }[];
    expiringRenewals: {
        customerId: string;
        customerName: string;
        umbrellaLabel: string;
        seniority: number;
        deadline: string;
    }[];
}
/** Voce dell'elenco abbonati di una stagione (campagna rinnovi, A4.2). */
export interface SubscriptionListItemDTO {
    id: string;
    customerId: string;
    umbrellaId: string;
    timeSlotId: string;
    packageId?: string;
    startDate: string;
    endDate: string;
    totalPrice: number;
    seniority: number;
    renewed: boolean;
}
/** Input per registrare l'incasso base (ADR-0011). Lo stato è derivato server-side. */
export interface SettlePaymentInput {
    amountCollected: number;
    paymentMethod?: PaymentMethod;
    collectionDate?: string;
}
/** Input per aprire una campagna di prelazione. Le stagioni sono identificate per id. Server-autoritativo. */
export interface OpenRenewalCampaignInput {
    originSeasonId: string;
    destinationSeasonId: string;
    deadline: string;
}
/** Campagna di prelazione (una per stagione di destinazione). */
export interface RenewalCampaignDTO {
    id: string;
    originSeasonId: string;
    destinationSeasonId: string;
    deadline: string;
}
/** Stato della finestra di un avente-diritto (derivato lazy). */
export type RenewalWindowState = 'open' | 'exercised' | 'expired';
/** Finestra di prelazione di un abbonato uscente, con priorità (anzianità) e stato derivato. */
export interface RenewalWindowItemDTO {
    sourceBookingId: string;
    customerId: string;
    umbrellaId: string;
    timeSlotId: string;
    packageId?: string;
    seniority: number;
    state: RenewalWindowState;
}
/** Campagna + finestre (ordinate per anzianità decrescente). Ritorno di GET /renewal-campaigns. */
export interface RenewalCampaignDetailDTO extends RenewalCampaignDTO {
    windows: RenewalWindowItemDTO[];
}
/** Stagione operativa dello Stabilimento (ADR-0031). Date ISO yyyy-mm-dd. */
export interface SeasonDTO {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
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
    periodStart?: string;
    periodEnd?: string;
    price: number;
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
    equipment: {
        equipmentTypeId: string;
        quantity: number;
    }[];
}
/** Input modifica pacchetto: tutti i campi opzionali. */
export type UpdatePackageInput = Partial<CreatePackageInput>;
/** Membro del team dello stabilimento (superuser escluso: è di piattaforma).
 *  Servito da GET /api/establishment/users, sotto `team.manage` (admin). */
export interface EstablishmentMemberDTO {
    id: string;
    email: string;
    role: 'admin' | 'staff';
    disabledAt: string | null;
}
/** Proiezione read-only della schermata Stabilimento (GET /api/establishment/overview).
 *
 *  ⚠️ NIENTE PII qui dentro. È il read-model dell'app-shell: `SidebarNav` lo carica a ogni
 *  navigazione per il nome della stagione attiva, quindi è leggibile con `establishment.read`,
 *  cioè anche dallo staff. Finché conteneva `team[]` esponeva le email di tutti gli operatori a
 *  chi non ne ha bisogno (D-064, AUD-004): il team vive ora su GET /api/establishment/users,
 *  sotto `team.manage`. Un campo con dati personali aggiunto qui torna a essere leggibile da
 *  tutto lo staff — `establishment.e2e-spec.ts` fa rosso se ricompare un'email nel payload. */
export interface EstablishmentOverviewDTO {
    establishment: {
        id: string;
        name: string;
    };
    activeSeason: {
        name: string;
        startDate: string;
        endDate: string;
    } | null;
    timeSlots: {
        id: string;
        name: string;
    }[];
    structure: {
        sectors: number;
        umbrellas: number;
        types: number;
        packages: number;
    };
}
/** Input rinomina stabilimento (admin-only). */
export interface UpdateEstablishmentInput {
    name: string;
}
/** Passi della prima configurazione, nell'ordine della catena di prerequisiti (ADR-0054). */
export type SetupStepKey = 'structure' | 'timeSlots' | 'seasons' | 'rates';
/** Stato di completezza della prima configurazione (GET /establishment/setup-status, admin-only).
 *  Misura la catena reale dei prerequisiti di prenotazione: la stessa semantica dei 422
 *  NO_SEASON / NO_RATE / UMBRELLA_NOT_FOUND, resa interrogabile (ADR-0054). */
export interface SetupStatusDTO {
    structure: {
        sectors: number;
        rows: number;
        activeUmbrellas: number;
        complete: boolean;
    };
    timeSlots: {
        count: number;
        complete: boolean;
    };
    /** usable = stagioni con endDate >= oggi (Europe/Rome): una stagione tutta nel passato non permette di incassare. */
    seasons: {
        usable: number;
        complete: boolean;
    };
    /** count = tariffe delle stagioni usable; hasCatchAll = esiste una tariffa tutta-wildcard (advisory, non blocca). */
    rates: {
        count: number;
        hasCatchAll: boolean;
        complete: boolean;
    };
    complete: boolean;
    firstIncompleteStep: SetupStepKey | null;
}
/** Input creazione staff (admin-only). Lo staff riceve un invito via email per
 *  impostare la password (ADR-0042); nessuna password in chiaro. Ruolo mai `superuser`. */
export interface CreateStaffUserInput {
    email: string;
    role: 'admin' | 'staff';
}
/** Input abilita/disabilita utente (admin-only, soft-disable). */
export interface UpdateStaffUserInput {
    disabled: boolean;
}
/** Disposizione di un settore (editor struttura). */
export type SectorKind = 'grid' | 'special';
/** Ombrellone nell'editor struttura (senza stato prenotazioni, a differenza di UmbrellaDTO della mappa). */
export interface StructureUmbrellaDTO {
    id: string;
    label: string;
    umbrellaTypeId: string | null;
}
export interface StructureRowDTO {
    id: string;
    label: string;
    sortOrder: number;
    umbrellas: StructureUmbrellaDTO[];
}
export interface StructureSectorDTO {
    id: string;
    name: string;
    sortOrder: number;
    kind: SectorKind;
    rows: StructureRowDTO[];
}
/** Albero completo (GET /api/establishment/structure, admin-only). */
export interface EstablishmentStructureDTO {
    sectors: StructureSectorDTO[];
    umbrellaTypes: UmbrellaTypeDTO[];
}
/** Input creazione tipologia (admin-only). icon = chiave icon-registry ui-kit. */
export interface CreateUmbrellaTypeInput {
    name: string;
    icon: string;
}
export interface UpdateUmbrellaTypeInput {
    name?: string;
    icon?: string;
}
/** Settori (editor struttura, admin-only). */
export interface CreateSectorInput {
    name: string;
    kind: SectorKind;
}
export interface UpdateSectorInput {
    name?: string;
    kind?: SectorKind;
}
/** File (editor struttura, admin-only). Slice 2 = create-fila (label); il generatore è Slice 3. */
export interface CreateRowInput {
    sectorId: string;
    label: string;
}
export interface UpdateRowInput {
    label?: string;
}
/** Ombrelloni singoli (editor struttura, admin-only). umbrellaTypeId null = Normale. */
export interface CreateUmbrellaInput {
    rowId: string;
    label: string;
    umbrellaTypeId: string | null;
}
export interface UpdateUmbrellaInput {
    label?: string;
    umbrellaTypeId?: string | null;
}
/** Generatore a numerazione automatica in una fila (admin-only). */
export interface GenerateUmbrellasInput {
    rowId: string;
    prefix: string;
    start: number;
    count: number;
    umbrellaTypeId: string | null;
}
export interface GenerateUmbrellasResultDTO {
    created: number;
    skipped: number;
    umbrellas: StructureUmbrellaDTO[];
}
/** Bulk-delete ombrelloni (Cantiere): elimina i non-prenotati, salta i protetti. Mai 409 sul batch. */
export interface BulkDeleteUmbrellasInput {
    ids: string[];
}
export interface BulkDeleteUmbrellasResultDTO {
    deleted: number;
    skipped: number;
}
/** Bulk-assegnazione tipologia (null = Normale). */
export interface BulkAssignUmbrellaTypeInput {
    ids: string[];
    umbrellaTypeId: string | null;
}
export interface BulkAssignUmbrellaTypeResultDTO {
    updated: number;
}
/** Ombrellone ritirato (soft-delete, D-055): fuori da struttura/mappa, storico conservato. */
export interface RetiredUmbrellaDTO {
    id: string;
    label: string;
    umbrellaTypeId: string | null;
    retiredAt: string;
    retiredFrom: string | null;
}
export interface RestoreUmbrellaInput {
    rowId: string;
}
/** Metriche aggregate di un lido per la Platform Console (superuser). PII-free per costruzione
 *  (solo count/sum/timestamp): nessun dato personale dei bagnanti. Vedi ADR-0040. */
export interface PlatformEstablishmentDTO {
    id: string;
    name: string;
    createdAt: string;
    suspendedAt: string | null;
    sectors: number;
    rows: number;
    umbrellas: number;
    staffUsersActive: number;
    lastActivityAt: string | null;
    revenueSeasonTotal: number;
    activeSubscriptions: number;
    bookingsThisSeason: number;
    occupancyPctToday: number;
    setupComplete: boolean;
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
    expiresAt: string;
}
/** Esito di un reset-password admin avviato dal console superuser. */
export interface ResetAdminPasswordResponse {
    adminEmail: string;
    expiresAt: string;
}
/** Esito di un reset-password staff avviato dall'admin del lido (tenant-scoped). */
export interface ResetStaffPasswordResponse {
    email: string;
    expiresAt: string;
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
export interface RentalItemDTO {
    id: string;
    name: string;
    stock: number | null;
    archived?: true;
}
export interface CreateRentalItemInput {
    name: string;
    stock?: number | null;
}
export interface UpdateRentalItemInput {
    name?: string;
    stock?: number | null;
}
export interface RentalTariffDTO {
    id: string;
    rentalItemId: string;
    seasonId: string;
    label: string;
    price: number;
    durationMinutes: number | null;
    archived?: true;
}
export interface CreateRentalTariffInput {
    label: string;
    price: number;
    durationMinutes?: number | null;
    sortOrder?: number;
}
export interface UpdateRentalTariffInput {
    label?: string;
    price?: number;
    durationMinutes?: number | null;
    sortOrder?: number;
}
export type RentalStatus = 'active' | 'returned' | 'cancelled';
export interface RentalDTO {
    id: string;
    rentalItemId: string;
    rentalItemName: string;
    rentalTariffId: string;
    tariffLabel: string;
    customerId: string | null;
    customerName: string | null;
    units: number;
    startAt: string;
    returnedAt: string | null;
    status: RentalStatus;
    totalPrice: number;
    paymentStatus: PaymentStatus;
    amountCollected: number;
    paymentMethod?: PaymentMethod;
    collectionDate?: string;
}
export interface RentalAvailabilityDTO {
    rentalItemId: string;
    stock: number | null;
    out: number;
    available: number | null;
}
export interface RentalsDayDTO {
    rentals: RentalDTO[];
    availability: RentalAvailabilityDTO[];
}
export interface CheckoutRentalInput {
    rentalItemId: string;
    rentalTariffId: string;
    customerId?: string | null;
    units?: number;
}
/** Dati del titolare del trattamento del lido (form staff dell'informativa, 5.6a). */
export interface EstablishmentLegalProfileDTO {
    legalName: string | null;
    registeredAddress: string | null;
    vatOrTaxId: string | null;
    contactEmail: string | null;
    pec: string | null;
    legalRepresentative: string | null;
    dataRightsContact: string | null;
    dpoNominated: boolean;
    dpoContact: string | null;
    updatedAt: string | null;
}
/** Upsert del profilo legale (tutti i campi opzionali; assenti = invariati). */
export interface UpdateEstablishmentLegalProfileInput {
    legalName?: string | null;
    registeredAddress?: string | null;
    vatOrTaxId?: string | null;
    contactEmail?: string | null;
    pec?: string | null;
    legalRepresentative?: string | null;
    dataRightsContact?: string | null;
    dpoNominated?: boolean;
    dpoContact?: string | null;
}
/** Dati del titolare esposti per il render dell'informativa (pubblici per natura). */
export interface PublicTitolareDTO {
    establishmentName: string;
    legalName: string | null;
    registeredAddress: string | null;
    vatOrTaxId: string | null;
    contactEmail: string | null;
    pec: string | null;
    legalRepresentative: string | null;
    dataRightsContact: string | null;
    dpoNominated: boolean;
    dpoContact: string | null;
}
