<script setup lang="ts"></script>

<template>
  <div class="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
    <div
      class="relative hidden w-[44%] max-w-[540px] flex-none flex-col justify-between overflow-hidden p-12 text-[var(--color-on-sidebar)] md:flex"
      style="background:linear-gradient(158deg,var(--color-teal-650) 0%,var(--color-teal-800) 52%,var(--color-teal-900) 100%);"
    >
      <div class="pointer-events-none absolute -bottom-24 -left-20 size-[340px] rounded-full" style="background:radial-gradient(circle,rgba(133,180,178,.20),transparent 70%);"></div>
      <div class="pointer-events-none absolute -right-14 -top-12 size-[240px] rounded-full" style="background:radial-gradient(circle,rgba(224,121,90,.16),transparent 70%);"></div>

      <div class="relative flex items-center gap-3">
        <span
          class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[17px] font-bold text-white"
          style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);box-shadow:0 4px 14px rgba(0,0,0,.28);"
        >C</span>
        <div class="leading-tight">
          <div class="text-[22px] font-bold tracking-[-.01em] text-[var(--color-on-sidebar-strong)]">Coralyn <span class="font-medium opacity-80">Platform</span></div>
          <div class="text-[11px] font-medium uppercase tracking-[.1em] text-[var(--color-on-sidebar-muted)]">Console distributore</div>
        </div>
      </div>

      <div class="relative max-w-[380px]">
        <slot name="hero">
          <h2 class="mb-3.5 text-[30px] font-bold leading-[1.22] tracking-[-.02em] text-[var(--color-on-sidebar-strong)]">Tutti i lidi, sotto un unico controllo.</h2>
          <p class="text-[14.5px] leading-relaxed text-[var(--color-on-teal-2nd)]">Attiva, monitora e amministra gli stabilimenti Coralyn dei tuoi clienti da un'unica console.</p>
        </slot>
      </div>

      <div class="relative flex items-center gap-2 text-xs text-[var(--color-on-sidebar-muted)]">
        <span class="size-[7px] rounded-full bg-[var(--color-brand)]"></span>
        <slot name="footer">Accesso riservato agli operatori della piattaforma</slot>
      </div>
    </div>

    <div class="flex flex-1 items-center justify-center overflow-auto p-8">
      <div class="w-full max-w-[400px]">
        <slot />
      </div>
    </div>
  </div>
</template>
