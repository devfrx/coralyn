<script setup lang="ts"></script>
<template>
  <div class="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <div class="relative hidden w-[44%] max-w-[540px] flex-none flex-col justify-between overflow-hidden p-12 text-[var(--color-on-sidebar)] md:flex"
      style="background:linear-gradient(158deg,var(--color-teal-650) 0%,var(--color-teal-800) 52%,var(--color-teal-900) 100%);">
      <div class="pointer-events-none absolute -bottom-20 -left-16 size-[320px] rounded-full" style="background:radial-gradient(circle,rgba(133,180,178,.20),transparent 70%);"></div>
      <div class="pointer-events-none absolute -right-12 -top-10 size-[220px] rounded-full" style="background:radial-gradient(circle,rgba(224,121,90,.18),transparent 70%);"></div>
      <div class="relative flex items-center gap-3">
        <img src="/coralyn-logo.png" alt="Coralyn" class="size-[46px] rounded-[13px] object-cover" style="box-shadow:0 4px 14px rgba(0,0,0,.28);" />
        <div class="leading-tight">
          <div class="text-[22px] font-bold tracking-[-.01em] text-[var(--color-on-sidebar-strong)]">Coralyn</div>
          <div class="text-[11px] font-medium uppercase tracking-[.1em] text-[var(--color-on-sidebar-muted)]">Gestionale lidi</div>
        </div>
      </div>
      <div class="relative max-w-[380px]"><slot name="hero" /></div>
      <div class="relative flex items-center gap-2 text-xs text-[var(--color-on-sidebar-muted)]"><span class="size-[7px] rounded-full bg-[var(--color-brand)]"></span><slot name="footer" /></div>
    </div>
    <div class="flex flex-1 items-center justify-center overflow-auto p-8"><div class="w-full max-w-[400px]"><slot /></div></div>
  </div>
</template>
