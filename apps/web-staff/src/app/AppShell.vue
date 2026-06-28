<script setup lang="ts">
import Topbar from './Topbar.vue';
import Sidebar from './Sidebar.vue';
</script>
<template>
  <div class="min-h-screen bg-[var(--color-canvas)] p-3">
    <Topbar />
    <div class="flex items-stretch gap-3">
      <Sidebar />
      <main class="min-h-[70vh] flex-1 rounded-[var(--radius-lg)] bg-[var(--color-surface)] [box-shadow:var(--shadow-sm)]">
        <RouterView />
      </main>
    </div>
  </div>
</template>
