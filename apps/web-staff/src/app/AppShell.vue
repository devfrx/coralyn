<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NavDrawer } from '@coralyn/ui-kit';
import Topbar from './Topbar.vue';
import Sidebar from './Sidebar.vue';
import SidebarNav from './SidebarNav.vue';
import ToastHost from './ToastHost.vue';
import { useMediaQuery } from '@/lib/useMediaQuery';
const route = useRoute();
const navOpen = ref(false);
// Chiudi il drawer su ogni navigazione (voci nav, switcher, logout).
watch(() => route.fullPath, () => { navOpen.value = false; });
// Chiudi il drawer quando si entra in fascia esteso (>= lg), per non lasciare overlay fantasma al resize.
const isDesktop = useMediaQuery('(min-width: 1024px)');
watch(isDesktop, (v) => { if (v) navOpen.value = false; });
</script>
<template>
  <RouterView v-if="route.meta.bare" />
  <div v-else class="flex h-screen min-h-[620px] bg-[var(--color-canvas)] text-[var(--color-text)]">
    <Sidebar />
    <main class="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <Topbar @open-nav="navOpen = true" />
      <div class="min-h-0 flex-1 overflow-auto"><RouterView /></div>
    </main>
  </div>
  <NavDrawer v-model:open="navOpen"><SidebarNav /></NavDrawer>
  <ToastHost />
</template>
