<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import ToastHost from './ToastHost.vue';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const bare = computed(() => route.meta.bare === true);

function logout(): void {
  session.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <header class="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3.5">
      <div class="flex items-center gap-7">
        <div class="flex items-center gap-2.5">
          <span
            class="grid size-8 flex-none place-items-center rounded-[10px] text-sm font-bold text-white"
            style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);box-shadow:0 2px 8px rgba(0,0,0,.16);"
          >C</span>
          <span class="text-[15px] font-semibold tracking-[-.01em]">Coralyn <span class="opacity-60">Platform</span></span>
        </div>
        <nav class="flex items-center gap-1 text-sm">
          <RouterLink
            to="/establishments"
            active-class="bg-[var(--color-accent-tint)] text-[var(--color-accent)] font-semibold"
            data-testid="nav-establishments"
            class="rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--color-text-2nd)] transition-colors hover:bg-[var(--color-warm-025)]"
          >Lidi</RouterLink>
        </nav>
      </div>
      <div class="flex items-center gap-3.5 text-sm">
        <span class="text-[var(--color-text-muted)]" data-testid="current-user">{{ session.userEmail }}</span>
        <Button variant="secondary" data-testid="logout" @click="logout">
          <Icon name="logout" :size="15" />
          Esci
        </Button>
      </div>
    </header>
    <main class="p-6">
      <RouterView />
    </main>
  </div>
  <ToastHost />
</template>
