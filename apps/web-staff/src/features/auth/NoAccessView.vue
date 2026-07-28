<script setup lang="ts">
import { EmptyState, Button } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';

/**
 * Lo stato terminale «nessuna sezione assegnata» (ADR-0064).
 *
 * ⚠️ Esiste per una ragione precisa. `resolvePermissionGuard` lascia passare quando NESSUNA
 * destinazione è accessibile, e il suo commento motivava la scelta con «meglio una vista che
 * mostra il proprio errore di un router che gira a vuoto». Quella premessa era vera finché le
 * query partivano comunque e prendevano 403: la vista rendeva il suo `ErrorState`. Da quando ogni
 * query dichiara il permesso del suo endpoint (ADR-0064) la query **non parte affatto**, quindi
 * non c'è né errore né caricamento — la Mappa rendeva mare, battigia e ZERO ombrelloni, in
 * silenzio, come schermata di atterraggio dopo il login.
 *
 * Qui lo stato viene detto una volta sola, invece di essere gestito in dodici viste.
 */
const session = useSessionStore();
</script>

<template>
  <section class="flex min-h-[60vh] items-center justify-center">
    <EmptyState
      data-testid="no-access"
      icon="lock"
      title="Non hai ancora una sezione assegnata"
    >
      <p class="text-sm leading-relaxed text-[var(--color-text-muted)]">
        L'amministratore del tuo stabilimento non ti ha assegnato nessuna area del gestionale.
        Chiedigli di configurare i tuoi permessi da <strong>Stabilimento → Team → Permessi</strong>:
        appena lo fa, ti basta ricaricare la pagina.
      </p>
      <template #action>
        <Button data-testid="no-access-logout" variant="secondary" @click="session.logout()">Esci</Button>
      </template>
    </EmptyState>
  </section>
</template>
