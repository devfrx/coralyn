import { Role } from '@coralyn/contracts';

/**
 * Permesso richiesto da un endpoint. Sostituisce `@Roles` come vocabolario
 * dell'autorizzazione (ADR-0057, emenda ADR-0039).
 *
 * Granularità: una voce per **area funzionale della UI** — le sezioni che l'operatore vede
 * nella sidebar — più le azioni che oggi sono admin-only dentro un'area. È la granularità a
 * cui l'admin di un lido ragionerà quando potrà concedere permessi al proprio staff (D-063):
 * dichiarare qui il *permesso* invece del *ruolo* rende quella slice un cambio di risoluzione
 * (tabella → configurazione per tenant) e non una riannotazione di ~60 endpoint.
 *
 * Il valore stringa è stabile e finirà in configurazione/DB: non rinominarlo alla leggera.
 */
export enum Permission {
  /** Mappa della giornata (sola lettura della struttura + stato slot). */
  MapRead = 'map.read',
  /** Banco prenotazioni: preventivo, elenco, creazione, rinnovo, disdetta, incasso. */
  BookingsManage = 'bookings.manage',
  /** Ciclo di vita dell'abbonamento: sospensione, riattivazione, cessione, assenze. */
  BookingsAdminister = 'bookings.administer',
  /** Anagrafica bagnanti: consultazione, creazione, modifica. */
  CustomersManage = 'customers.manage',
  /** Cancellazione GDPR del cliente (art. 17): erasure o anonimizzazione. */
  CustomersErase = 'customers.erase',
  /** Accesso self-service del bagnante: generazione QR+PIN e revoca. */
  CustomerAccessManage = 'customer-access.manage',
  /** Banco noleggi della giornata: consegna, rientro, annullo, incasso. */
  RentalsOperate = 'rentals.operate',
  /** Listino noleggi: articoli e tariffe stagionali. */
  RentalCatalogManage = 'rental-catalog.manage',
  /** Listino: stagioni, tariffe, pacchetti, dotazioni, fasce orarie. */
  PricingManage = 'pricing.manage',
  /** Campagne di rinnovo abbonamenti. */
  RenewalsManage = 'renewals.manage',
  /** Report di andamento della stagione. */
  ReportsRead = 'reports.read',
  /** Scheda dello stabilimento in sola lettura (usata anche dall'app-shell). */
  EstablishmentRead = 'establishment.read',
  /** Configurazione dello stabilimento: rinomina, stato di setup. */
  EstablishmentManage = 'establishment.manage',
  /**
   * Profilo legale del lido (titolare del trattamento nell'informativa al bagnante).
   * Deliberatamente separato da `establishment.manage`: è la superficie che alimenta un
   * documento di legge (ADR-0055/0056), concederla non deve essere un effetto collaterale
   * del concedere la configurazione generale.
   */
  LegalProfileManage = 'legal-profile.manage',
  /** Lettura della struttura (settori, file, ombrelloni) senza poterla modificare. */
  StructureRead = 'structure.read',
  /** Editor della struttura: settori, file, ombrelloni, tipologie. */
  StructureManage = 'structure.manage',
  /** Gestione degli operatori del lido (invito, disabilitazione, reset password). */
  TeamManage = 'team.manage',
  /** Console di piattaforma, cross-tenant: solo il distributore (ADR-0015). */
  PlatformAdminister = 'platform.administer',
  /** Profilo della propria sessione: ogni identità autenticata lo legge. */
  SessionRead = 'session.read',
}

/**
 * Quali ruoli detengono ciascun permesso, **oggi**.
 *
 * Tabella statica e volutamente banale: riproduce **esattamente** la copertura in vigore prima
 * dell'inversione fail-closed, così l'inversione chiude il buco strutturale senza cambiare cosa
 * un operatore può fare. Dove il repo dichiarava `@Roles(Role.Admin)` il permesso è admin-only;
 * dove non dichiarava nulla — e quindi lo staff passava — il permesso è admin+staff.
 *
 * ⚠️ Il superuser NON compare nei permessi tenant-scoped: non ha un ruolo dentro il lido
 * (ADR-0039 lo dice già esplicitamente). Prima dell'inversione le rotte non annotate gli davano
 * 400 «tenant assente» invece di 403; era un effetto del default permissivo, non una decisione.
 *
 * Quando i permessi diventeranno configurabili dall'admin (D-063) questa tabella resta il
 * **default di fabbrica**: cambia solo chi la può sovrascrivere per il proprio tenant.
 */
export const PERMISSION_ROLES: Readonly<Record<Permission, readonly Role[]>> = {
  [Permission.MapRead]: [Role.Admin, Role.Staff],
  [Permission.BookingsManage]: [Role.Admin, Role.Staff],
  [Permission.BookingsAdminister]: [Role.Admin],
  [Permission.CustomersManage]: [Role.Admin, Role.Staff],
  [Permission.CustomersErase]: [Role.Admin],
  [Permission.CustomerAccessManage]: [Role.Admin],
  [Permission.RentalsOperate]: [Role.Admin, Role.Staff],
  [Permission.RentalCatalogManage]: [Role.Admin, Role.Staff],
  [Permission.PricingManage]: [Role.Admin, Role.Staff],
  [Permission.RenewalsManage]: [Role.Admin, Role.Staff],
  [Permission.ReportsRead]: [Role.Admin, Role.Staff],
  [Permission.EstablishmentRead]: [Role.Admin, Role.Staff],
  [Permission.EstablishmentManage]: [Role.Admin],
  [Permission.LegalProfileManage]: [Role.Admin],
  [Permission.StructureRead]: [Role.Admin, Role.Staff],
  [Permission.StructureManage]: [Role.Admin],
  [Permission.TeamManage]: [Role.Admin],
  [Permission.PlatformAdminister]: [Role.Superuser],
  [Permission.SessionRead]: [Role.Admin, Role.Staff, Role.Superuser],
};

/** Il ruolo detiene il permesso secondo il default di fabbrica. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_ROLES[permission].includes(role);
}
