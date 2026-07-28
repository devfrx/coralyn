"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_ROLES = exports.PERMISSION_LABELS = exports.CONFIGURABLE_PERMISSIONS = exports.NON_CONFIGURABLE_PERMISSIONS = exports.Permission = exports.Role = void 0;
exports.permissionsOfRoleDefault = permissionsOfRoleDefault;
/** Application roles. See ADR-0015 (platform superuser). */
var Role;
(function (Role) {
    Role["Admin"] = "admin";
    Role["Staff"] = "staff";
    Role["Superuser"] = "superuser";
})(Role || (exports.Role = Role = {}));
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
var Permission;
(function (Permission) {
    /** Mappa della giornata (sola lettura della struttura + stato slot). */
    Permission["MapRead"] = "map.read";
    /** Banco prenotazioni: preventivo, elenco, creazione, rinnovo, disdetta, incasso. */
    Permission["BookingsManage"] = "bookings.manage";
    /** Ciclo di vita dell'abbonamento: sospensione, riattivazione, cessione, assenze. */
    Permission["BookingsAdminister"] = "bookings.administer";
    /** Anagrafica bagnanti: consultazione, creazione, modifica. */
    Permission["CustomersManage"] = "customers.manage";
    /** Cancellazione GDPR del cliente (art. 17): erasure o anonimizzazione. */
    Permission["CustomersErase"] = "customers.erase";
    /** Accesso self-service del bagnante: generazione QR+PIN e revoca. */
    Permission["CustomerAccessManage"] = "customer-access.manage";
    /** Banco noleggi della giornata: consegna, rientro, annullo, incasso. */
    Permission["RentalsOperate"] = "rentals.operate";
    /** Listino noleggi: articoli e tariffe stagionali. */
    Permission["RentalCatalogManage"] = "rental-catalog.manage";
    /** Listino: stagioni, tariffe, pacchetti, dotazioni, fasce orarie. */
    Permission["PricingManage"] = "pricing.manage";
    /** Campagne di rinnovo abbonamenti. */
    Permission["RenewalsManage"] = "renewals.manage";
    /** Report di andamento della stagione. */
    Permission["ReportsRead"] = "reports.read";
    /** Scheda dello stabilimento in sola lettura (usata anche dall'app-shell). */
    Permission["EstablishmentRead"] = "establishment.read";
    /** Configurazione dello stabilimento: rinomina, stato di setup. */
    Permission["EstablishmentManage"] = "establishment.manage";
    /**
     * Profilo legale del lido (titolare del trattamento nell'informativa al bagnante).
     * Deliberatamente separato da `establishment.manage`: è la superficie che alimenta un
     * documento di legge (ADR-0055/0056), concederla non deve essere un effetto collaterale
     * del concedere la configurazione generale.
     */
    Permission["LegalProfileManage"] = "legal-profile.manage";
    /** Lettura della struttura (settori, file, ombrelloni) senza poterla modificare. */
    Permission["StructureRead"] = "structure.read";
    /** Editor della struttura: settori, file, ombrelloni, tipologie. */
    Permission["StructureManage"] = "structure.manage";
    /** Gestione degli operatori del lido (invito, disabilitazione, reset password, permessi). */
    Permission["TeamManage"] = "team.manage";
    /** Console di piattaforma, cross-tenant: solo il distributore (ADR-0015). */
    Permission["PlatformAdminister"] = "platform.administer";
    /** Profilo della propria sessione: ogni identità autenticata lo legge. */
    Permission["SessionRead"] = "session.read";
})(Permission || (exports.Permission = Permission = {}));
/**
 * I due permessi che l'admin di un lido **non** può concedere né revocare (ADR-0063 §5.1),
 * per ragioni diverse:
 *
 * - `platform.administer` è cross-tenant e del solo distributore (ADR-0015): non è del lido
 *   da concedere.
 * - `session.read` è il permesso di leggere la **propria** sessione. Revocarlo non esprime una
 *   divisione dei compiti: disabilita l'account — e per quello esiste già `User.disabledAt`.
 */
exports.NON_CONFIGURABLE_PERMISSIONS = [
    Permission.PlatformAdminister,
    Permission.SessionRead,
];
/**
 * I 17 permessi che l'admin del lido concede o revoca al proprio staff.
 *
 * Derivato, non scritto a mano: aggiungere una voce all'enum la rende configurabile per
 * costruzione, e dimenticarla qui diventa impossibile.
 */
exports.CONFIGURABLE_PERMISSIONS = Object.values(Permission).filter((p) => !exports.NON_CONFIGURABLE_PERMISSIONS.includes(p));
/**
 * Etichetta italiana dell'interruttore nella schermata di amministrazione.
 *
 * `Record` completo e non parziale: un permesso nuovo senza etichetta **non compila**, che è la
 * sola forma di copertura che non invecchia (stesso spirito di `authorization-coverage.spec.ts`).
 */
exports.PERMISSION_LABELS = {
    [Permission.MapRead]: 'Mappa della giornata',
    [Permission.BookingsManage]: 'Banco prenotazioni',
    [Permission.BookingsAdminister]: 'Ciclo di vita degli abbonamenti',
    [Permission.CustomersManage]: 'Anagrafica bagnanti',
    [Permission.CustomersErase]: 'Cancellazione di un cliente',
    [Permission.CustomerAccessManage]: 'Accesso self-service del bagnante',
    [Permission.RentalsOperate]: 'Banco noleggi',
    [Permission.RentalCatalogManage]: 'Listino noleggi',
    [Permission.PricingManage]: 'Listino',
    [Permission.RenewalsManage]: 'Campagne di rinnovo',
    [Permission.ReportsRead]: 'Report della stagione',
    [Permission.EstablishmentRead]: 'Scheda dello stabilimento',
    [Permission.EstablishmentManage]: 'Configurazione dello stabilimento',
    [Permission.LegalProfileManage]: 'Profilo legale del lido',
    [Permission.StructureRead]: 'Lettura della struttura',
    [Permission.StructureManage]: 'Editor della struttura',
    [Permission.TeamManage]: 'Gestione degli operatori',
    [Permission.PlatformAdminister]: 'Console di piattaforma',
    [Permission.SessionRead]: 'Lettura della propria sessione',
};
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
exports.PERMISSION_ROLES = {
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
/** I permessi che un ruolo detiene per difetto di fabbrica. */
function permissionsOfRoleDefault(role) {
    return Object.values(Permission).filter((p) => exports.PERMISSION_ROLES[p].includes(role));
}
//# sourceMappingURL=index.js.map