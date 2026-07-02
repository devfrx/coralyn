<script setup lang="ts">
import { useRoute } from 'vue-router';
import Topbar from './Topbar.vue';
import Sidebar from './Sidebar.vue';
import ToastHost from './ToastHost.vue';
const route = useRoute();
</script>
<template>
  <RouterView v-if="route.meta.bare" />
  <div v-else class="flex h-screen min-h-[620px] bg-[var(--color-canvas)] text-[var(--color-text)]">
    <Sidebar />
    <main class="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <Topbar />
      <div class="min-h-0 flex-1 overflow-auto"><RouterView /></div>
    </main>
  </div>
  <ToastHost />
</template>
