import { Permission } from '@coralyn/contracts';

/**
 * Le voci di navigazione del gestionale, ciascuna col permesso che la governa (ADR-0063).
 *
 * ⚠️ **Una sola lista, letta da due posti.** Prima di questa slice `SidebarNav.vue` mostrava
 * `operativeNav` a **ogni** ruolo e il router gestiva a parte due `meta.role`: due letture di
 * «cosa fa lo staff» che potevano divergere in silenzio, ed è il rischio che il brief di D-063
 * segnalava per primo. Ora la sidebar rende queste voci e il router ci pesca la destinazione di
 * ripiego, quindi non possono più raccontare cose diverse.
 *
 * ⚠️ **Il permesso qui è quello PRIMARIO della sezione, non l'insieme di ciò che la vista
 * compone.** Una schermata legge anche endpoint governati da altri permessi — la Mappa chiama
 * `/bookings`, `/customers` e `/packages` — e pretendere l'insieme completo renderebbe la feature
 * inutile: `pricing.manage` compare in 6 delle 8 voci operative, quindi revocarlo (l'esempio con cui ADR-0063
 * apre) svuoterebbe la sidebar. Le dipendenze vicine si governano dove nascono: ogni query
 * dichiara il permesso del suo endpoint (`enabled`), presidiato da `query-permissions.spec.ts`, e
 * ciò che resta vuoto lo dice invece di fingersi un insieme vuoto. Vedi ADR-0064.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: string;
  permission: Permission;
}

export interface NavSection {
  eyebrow: string;
  items: readonly NavItem[];
}

export const OPERATIVE_NAV: readonly NavItem[] = [
  { to: '/map', label: 'Mappa', icon: 'map', permission: Permission.MapRead },
  { to: '/bookings', label: 'Prenotazioni', icon: 'calendar', permission: Permission.BookingsManage },
  { to: '/rentals', label: 'Noleggi', icon: 'waves', permission: Permission.RentalsOperate },
  { to: '/renewals', label: 'Rinnovi', icon: 'renew', permission: Permission.RenewalsManage },
  { to: '/customers', label: 'Clienti', icon: 'users', permission: Permission.CustomersManage },
  { to: '/pricing', label: 'Listino', icon: 'tag', permission: Permission.PricingManage },
  { to: '/rentals/catalogo', label: 'Listino noleggi', icon: 'layers', permission: Permission.RentalCatalogManage },
  { to: '/report', label: 'Report', icon: 'chart', permission: Permission.ReportsRead },
];

// /onboarding resta fuori di proposito: ha già i suoi ingressi (card in Stabilimento,
// empty-state della Mappa) e a setup completo sarebbe una voce-rumore permanente.
export const ADMIN_NAV: readonly NavItem[] = [
  { to: '/establishment/structure', label: 'Struttura', icon: 'umbrella', permission: Permission.StructureManage },
];

/**
 * Ordine in cui il router cerca una destinazione accessibile quando nega quella richiesta.
 * L'operativo prima dell'amministrazione: è ciò che un operatore si aspetta di vedere aprendo
 * l'applicazione.
 */
export const FALLBACK_NAV: readonly NavItem[] = [...OPERATIVE_NAV, ...ADMIN_NAV];
