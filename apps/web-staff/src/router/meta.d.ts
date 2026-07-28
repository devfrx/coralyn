import 'vue-router';
import type { Permission } from '@coralyn/contracts';
declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    subtitle?: string;
    public?: boolean;
    bare?: boolean;
    /**
     * Il permesso richiesto dalla superficie della rotta (ADR-0063). Sostituisce `role`.
     *
     * ⚠️ `RouteMeta` ha un index signature in vue-router, quindi una chiave sbagliata **non** è un
     * errore di compilazione: dichiararla qui serve a tipizzare il valore, non a impedire il typo.
     * Ciò che intercetta una rotta senza permesso è la guardia, non il compilatore.
     */
    permission?: Permission;
  }
}
