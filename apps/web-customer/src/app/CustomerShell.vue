<script setup lang="ts">
import { watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import ToastHost from '@/app/ToastHost.vue';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const router = useRouter();
const route = useRoute();

// La fine della sessione deve PORTARE VIA il bagnante, non solo svuotare lo stato. Il guard del
// router scatta sulle navigazioni: dopo un 401 terminale nessuno naviga, e l'utente resta su
// «I miei abbonamenti» che, senza dati, mostra «Non hai abbonamenti attivi» — una sessione morta
// travestita da risposta legittima (AUD-010). Le rotte pubbliche sono escluse: /privacy è
// l'informativa del bagnante e deve restare raggiungibile anche senza sessione.
watch(
  () => session.authenticated,
  (isAuthenticated) => {
    if (!isAuthenticated && route.meta.public !== true) void router.replace({ name: 'activation' });
  },
);
</script>
<template>
  <RouterView />
  <ToastHost />
</template>
