<template>
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <slot name="left" />
    <div class="flex-1"></div>
    <slot name="right" />
    <slot name="actions" />
  </div>
</template>
