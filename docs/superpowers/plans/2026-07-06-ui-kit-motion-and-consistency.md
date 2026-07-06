# ui-kit Motion Foundations + Consistency Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere uno strato di motion token-driven agli overlay/toast, completare gli stati dei componenti caldi (`Button`, `EmptyState`), estrarre una primitiva condivisa `IconButton`, e uniformare focus/hover/disabled sugli interattivi di `@coralyn/ui-kit` — senza regredire la baseline test.

**Architecture:** Tutti i valori di movimento sono variabili CSS + `@keyframes` in `theme.css` (unico stylesheet importato dalle app); i componenti applicano le animazioni via i `data-[state=open|closed]` che reka-ui espone su `DialogOverlay`/`DialogContent`. Nessun cambio di dominio/API/contracts/schema. Ogni slice è additiva e retro-compatibile a livello di API pubblica.

**Tech Stack:** Vue 3 `<script setup>` + Tailwind v4 (`@theme` in `ui-kit/src/styles/theme.css`), reka-ui (dialog/teleport), lucide via `unplugin-icons` (`~icons/lucide/*`) dietro il registry, Vitest + @vue/test-utils (ui-kit **e** web-staff — quest'ultima globa gli spec ui-kit), pnpm workspace (`corepack pnpm`, MAI npm).

---

## Convenzioni di esecuzione (leggere prima)

- **pnpm, mai npm.** Comandi dalla root del repo.
- **Test ui-kit:** `corepack pnpm --filter @coralyn/ui-kit test` (Vitest, non-watch: il progetto usa `vitest run` di default nello script `test`; se parte in watch, usare `-- run`).
- **Test web-staff:** `corepack pnpm --filter @coralyn/web-staff test` — ⚠️ **globa anche gli spec ui-kit** (`apps/web-staff/vitest.config.ts`): ogni nuovo spec ui-kit conta in **entrambe** le suite. Dopo aver aggiunto/rimosso uno spec, aggiornare mentalmente la baseline attesa in entrambe.
- **Test web-platform:** `corepack pnpm --filter @coralyn/web-platform test`.
- **Typecheck:** `corepack pnpm -r typecheck` (o per-filtro). Deve restare **pulito**.
- **Baseline da NON regredire** (aumenta solo per i nuovi test attesi): ui-kit **79** · web-staff **284** · web-platform **16** · api unit **209** · api e2e **243**. **api non è toccata**: non serve rieseguirla, ma non deve rompersi il typecheck condiviso (contracts non cambia).
- **Teleport nei test (reka-ui):** montare con `attachTo: document.body`, `await nextTick()`, e interrogare `document.body.querySelector(...)`; `afterEach(() => { document.body.innerHTML = ''; })`. Vedi `Modal.spec.ts` come riferimento.
- **Verifica LIVE del motion:** il movimento non si unit-testa a fondo → usare i tool `preview_*` (dev server web-staff `:8080`) su Modal/Drawer/Toast/Button. NON claude-in-chrome. reduced-motion già neutralizza tutto via il killer globale in theme.css.
- **Commit frequenti**, un set coerente per task. **Presenta e attendi conferma alla fine di ogni Slice** (Task) prima della successiva. Nessun push su `main` senza ok esplicito.

---

## File map

**Slice 0 — motion primitives**
- Modify: `packages/ui-kit/src/styles/theme.css` — token durata + `@keyframes` (fuori dal blocco `@theme`).
- Create: `packages/ui-kit/src/styles/motion.spec.ts` — guard: token/keyframe presenti.

**Slice 1 — overlay/toast motion**
- Modify: `packages/ui-kit/src/components/Modal.vue`, `Drawer.vue`.
- Modify: `packages/ui-kit/src/components/Modal.spec.ts`; Create: `Drawer.spec.ts`.
- Modify: `apps/web-staff/src/app/ToastHost.vue`, `apps/web-platform/src/app/ToastHost.vue` — `TransitionGroup`.

**Slice 2 — IconButton**
- Create: `packages/ui-kit/src/components/IconButton.vue`, `IconButton.spec.ts`.
- Modify: `packages/ui-kit/src/index.ts` (export), `Modal.vue`, `Drawer.vue`, `Toast.vue` (usano IconButton per il close).

**Slice 3 — Button completeness**
- Modify: `packages/ui-kit/src/components/Button.vue`, `Button.spec.ts`.
- Modify: `packages/ui-kit/src/icons/registry.ts` (`loader-2`), `Icon.spec.ts`.

**Slice 4 — EmptyState structured**
- Modify: `packages/ui-kit/src/components/EmptyState.vue`, `EmptyState.spec.ts`.
- Modify: call-site che improvvisano un empty (censiti nel Task 4, Step 1).

**Slice 5 — consistency sweep**
- Modify (mirato): `Select.vue`, `SegmentedControl.vue`, `SearchInput.vue`, `PageToolbar.vue`, `Textarea.vue`, `DataTable.vue` (righe) + relativi spec dove asseriscono classi.
- Modify: `docs/design/design-system.md` — nota sullo standard di stato interattivo.

---

## Task 0: Primitive di motion (Slice 0)

**Files:**
- Modify: `packages/ui-kit/src/styles/theme.css`
- Test: `packages/ui-kit/src/styles/motion.spec.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

Create `packages/ui-kit/src/styles/motion.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

describe('motion tokens & keyframes (theme.css)', () => {
  it('definisce i token di durata', () => {
    for (const token of ['--motion-fast', '--motion-base', '--motion-slow']) {
      expect(css).toContain(token);
    }
  });
  it('definisce le keyframes usate dagli overlay e dai toast', () => {
    for (const kf of ['overlay-in', 'overlay-out', 'dialog-in', 'dialog-out', 'drawer-in', 'drawer-out', 'toast-in', 'toast-out']) {
      expect(css).toContain(`@keyframes ${kf}`);
    }
  });
  it('le keyframes del dialog preservano la centratura (-50%, -50%)', () => {
    expect(css).toMatch(/@keyframes dialog-in[^}]*translate\(-50%,\s*-50%\)/s);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarne il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run motion.spec`
Expected: FAIL (i token/keyframes non esistono ancora).

- [ ] **Step 3: Implementare — aggiungere token e keyframes a theme.css**

In `packages/ui-kit/src/styles/theme.css`, dentro il blocco `@theme { … }`, subito dopo la riga degli `--ease-*` (l'ultima riga prima della `}` di chiusura del blocco), aggiungere i token di durata:

```css
  --motion-fast: 140ms; --motion-base: 200ms; --motion-slow: 260ms;
```

Poi, **fuori** dal blocco `@theme` (dopo la sua `}` di chiusura, prima di `:root {`), aggiungere le keyframes:

```css
/* ===== MOTION — keyframes (guidate dai token --ease-* / --motion-*). Neutralizzate da prefers-reduced-motion (vedi sotto). ===== */
@keyframes overlay-in  { from { opacity: 0 } to { opacity: 1 } }
@keyframes overlay-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes dialog-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.96) }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1) }
}
@keyframes dialog-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1) }
  to   { opacity: 0; transform: translate(-50%, -50%) scale(.96) }
}
@keyframes drawer-in  { from { opacity: .5; transform: translateX(16px) } to { opacity: 1; transform: translateX(0) } }
@keyframes drawer-out { from { opacity: 1; transform: translateX(0) } to { opacity: 0; transform: translateX(16px) } }
@keyframes toast-in   { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@keyframes toast-out  { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(8px) } }
```

> Il killer `@media (prefers-reduced-motion: reduce) { … animation: none !important; … }` è già presente in fondo a theme.css e disabilita queste animazioni per default sugli utenti che lo richiedono. Non duplicarlo.

- [ ] **Step 4: Eseguire i test per verificarne il successo**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run motion.spec`
Expected: PASS (3 test).

- [ ] **Step 5: Suite completa ui-kit + web-staff (nuovo spec conta in entrambe)**

Run: `corepack pnpm --filter @coralyn/ui-kit test` → Expected: **82** test (79 + 3), tutti verdi.
Run: `corepack pnpm --filter @coralyn/web-staff test` → Expected: **287** (284 + 3), tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/styles/theme.css packages/ui-kit/src/styles/motion.spec.ts
git commit -m "feat(ui-kit): token e keyframes di motion in theme.css (Slice 0)"
```

---

## Task 1: Motion degli overlay e dei toast (Slice 1)

**Files:**
- Modify: `packages/ui-kit/src/components/Modal.vue`, `packages/ui-kit/src/components/Drawer.vue`
- Modify: `packages/ui-kit/src/components/Modal.spec.ts`
- Create: `packages/ui-kit/src/components/Drawer.spec.ts`
- Modify: `apps/web-staff/src/app/ToastHost.vue`, `apps/web-platform/src/app/ToastHost.vue`

- [ ] **Step 1: Test che fallisce — Modal applica le animazioni su data-state**

In `packages/ui-kit/src/components/Modal.spec.ts`, aggiungere in coda al `describe('Modal', …)`:

```ts
  it('overlay e content portano le animazioni di entrata/uscita su data-state', async () => {
    await mountModal({});
    const overlay = document.body.querySelector('[data-reka-dialog-overlay], .fixed.inset-0')!;
    const content = document.body.querySelector('[role="dialog"]')!;
    const overlayCls = overlay.getAttribute('class') ?? '';
    const contentCls = content.getAttribute('class') ?? '';
    expect(overlayCls).toContain('data-[state=open]:[animation:overlay-in');
    expect(overlayCls).toContain('data-[state=closed]:[animation:overlay-out');
    expect(contentCls).toContain('data-[state=open]:[animation:dialog-in');
    expect(contentCls).toContain('data-[state=closed]:[animation:dialog-out');
  });
```

> Nota: reka-ui non aggiunge un attributo di test dedicato all'overlay; il selettore `.fixed.inset-0` è un fallback robusto perché l'overlay è l'unico nodo con quelle classi. Se il primo selettore non matcha, il secondo sì.

- [ ] **Step 2: Verificare il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Modal.spec`
Expected: FAIL (le classi di animazione non ci sono).

- [ ] **Step 3: Implementare — Modal.vue**

In `packages/ui-kit/src/components/Modal.vue`, aggiungere le classi di animazione a `DialogOverlay` e `DialogContent`.

`DialogOverlay` — classe attuale:
```
class="fixed inset-0 z-[80] bg-[rgba(11,53,67,.46)]"
```
diventa:
```
class="fixed inset-0 z-[80] bg-[rgba(11,53,67,.46)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]"
```

`DialogContent` — aggiungere in coda alla classe esistente (senza rimuovere nulla):
```
data-[state=open]:[animation:dialog-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:dialog-out_var(--motion-fast)_var(--ease-standard)]
```

- [ ] **Step 4: Verificare il successo Modal**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Modal.spec`
Expected: PASS (i 4 test precedenti + il nuovo).

- [ ] **Step 5: Test che fallisce — Drawer**

Create `packages/ui-kit/src/components/Drawer.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Drawer from './Drawer.vue';

const mountDrawer = async (props: Record<string, unknown> = {}) => {
  const w = mount(Drawer, { props: { open: true, title: 'Dettaglio', ...props }, attachTo: document.body });
  await nextTick();
  return w;
};
afterEach(() => { document.body.innerHTML = ''; });

describe('Drawer', () => {
  it('rende il titolo e il ruolo dialog', async () => {
    await mountDrawer();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Dettaglio');
  });
  it('applica le animazioni slide su data-state', async () => {
    await mountDrawer();
    const cls = document.body.querySelector('[role="dialog"]')!.getAttribute('class') ?? '';
    expect(cls).toContain('data-[state=open]:[animation:drawer-in');
    expect(cls).toContain('data-[state=closed]:[animation:drawer-out');
  });
  it('ha un bottone di chiusura accessibile', async () => {
    await mountDrawer();
    expect(document.body.querySelector('button[aria-label="Chiudi"]')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Verificare il fallimento Drawer**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Drawer.spec`
Expected: FAIL sul test delle animazioni (le classi non ci sono ancora).

- [ ] **Step 7: Implementare — Drawer.vue**

In `packages/ui-kit/src/components/Drawer.vue`, aggiungere in coda alla classe di `DialogContent`:
```
data-[state=open]:[animation:drawer-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:drawer-out_var(--motion-fast)_var(--ease-standard)]
```
(Facoltativo, per coerenza con Modal: se il Drawer non ha overlay animato, lasciarlo com'è — l'overlay del Drawer usa `z-40` senza animazione; aggiungere `data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]` all'overlay del Drawer per uniformità.)

- [ ] **Step 8: Verificare il successo Drawer**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Drawer.spec`
Expected: PASS (3 test).

- [ ] **Step 9: Implementare — TransitionGroup nei ToastHost (entrambe le app)**

In `apps/web-staff/src/app/ToastHost.vue`, sostituire il `v-for` nudo con un `TransitionGroup` che usa le keyframes toast. Nuovo template:

```vue
<template>
  <TransitionGroup
    tag="div"
    class="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2"
    enter-active-class="[animation:toast-in_var(--motion-base)_var(--ease-emphasized)]"
    leave-active-class="[animation:toast-out_var(--motion-fast)_var(--ease-standard)]"
  >
    <Toast v-for="t in toasts.items" :key="t.id" class="pointer-events-auto" :message="t.message" @dismiss="dismissToast(t.id)" />
  </TransitionGroup>
</template>
```
(Import invariati.) Applicare **identica** modifica a `apps/web-platform/src/app/ToastHost.vue` (stesse classi/attributi; adeguare solo eventuali import/percorsi già presenti in quel file).

> `TransitionGroup` di Vue attende la fine dell'animazione prima di rimuovere il nodo in leave: la scomparsa del toast diventa visibile. Nessun cambiamento al componente `Toast.vue` in questa slice.

- [ ] **Step 10: Test suite app (regressione)**

Run: `corepack pnpm --filter @coralyn/web-staff test` → Expected: verde. Se esiste uno spec che monta `ToastHost` e asseriva la struttura del `<div>` radice, aggiornarlo al nuovo root `TransitionGroup` (che renderizza comunque un `<div>` grazie a `tag="div"`, quindi le asserzioni sul `<div>` restano valide).
Run: `corepack pnpm --filter @coralyn/web-platform test` → Expected: verde.
Run: `corepack pnpm --filter @coralyn/ui-kit test` → Expected: **85** (82 + 3 di Drawer.spec), verde.

- [ ] **Step 11: Verifica LIVE (motion)**

Avviare il dev server web-staff via `preview_start` (vedi `.claude/launch.json`; se assente, crearlo con lo script `dev` di web-staff sulla porta 8080). Aprire/chiudere un Modal (es. dalla Scheda cliente), un Drawer (card ombrellone in mappa) e provocare un Toast (azione che fallisce): confermare fade+scale del modal, slide del drawer, slide/fade dei toast. Catturare uno screenshot come prova. Correggere durate/scale in theme.css se necessario e riverificare.

- [ ] **Step 12: Commit**

```bash
git add packages/ui-kit/src/components/Modal.vue packages/ui-kit/src/components/Modal.spec.ts packages/ui-kit/src/components/Drawer.vue packages/ui-kit/src/components/Drawer.spec.ts apps/web-staff/src/app/ToastHost.vue apps/web-platform/src/app/ToastHost.vue
git commit -m "feat(ui-kit): motion di entrata/uscita per Modal, Drawer e Toast (Slice 1)"
```

---

## Task 2: Primitiva condivisa IconButton (Slice 2)

**Files:**
- Create: `packages/ui-kit/src/components/IconButton.vue`, `packages/ui-kit/src/components/IconButton.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`, `Modal.vue`, `Drawer.vue`, `Toast.vue`

- [ ] **Step 1: Test che fallisce — IconButton**

Create `packages/ui-kit/src/components/IconButton.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import IconButton from './IconButton.vue';

describe('IconButton', () => {
  it('rende un button con aria-label e un svg (icona dal registry)', () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } });
    expect(w.element.tagName).toBe('BUTTON');
    expect(w.attributes('aria-label')).toBe('Chiudi');
    expect(w.find('svg').exists()).toBe(true);
  });
  it('emette click', async () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });
  it('porta il focus-ring e cambia stile sull hover (variante ghost di default)', () => {
    const cls = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } }).classes().join(' ');
    expect(cls).toContain('focus-visible:[box-shadow:var(--ring-focus)]');
    expect(cls).toContain('hover:');
  });
  it('disabilitato non emette click', async () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi', disabled: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeFalsy();
    expect(w.attributes('disabled')).toBeDefined();
  });
  it('variante subtle usa la superficie raised (come i close attuali)', () => {
    const cls = mount(IconButton, { props: { icon: 'x', label: 'Chiudi', variant: 'subtle' } }).classes().join(' ');
    expect(cls).toContain('bg-[var(--color-raised)]');
  });
});
```

- [ ] **Step 2: Verificare il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run IconButton.spec`
Expected: FAIL (componente inesistente).

- [ ] **Step 3: Implementare — IconButton.vue**

Create `packages/ui-kit/src/components/IconButton.vue`:

```vue
<script setup lang="ts">
import Icon from './Icon.vue';
withDefaults(
  defineProps<{ icon: string; label: string; variant?: 'ghost' | 'subtle'; size?: 'sm' | 'md'; disabled?: boolean }>(),
  { variant: 'ghost', size: 'md', disabled: false },
);
const base = 'inline-grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed';
const sizes = { sm: 'size-6', md: 'size-8' } as const;
const iconSize = { sm: 14, md: 16 } as const;
const variants = {
  ghost:  'border-0 bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-accent-tint)] hover:text-[var(--color-text)]',
  subtle: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)] hover:bg-[var(--color-warm-025)] hover:text-[var(--color-text)]',
} as const;
</script>
<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    :class="[base, sizes[$props.size ?? 'md'], variants[$props.variant ?? 'ghost']]"
  >
    <Icon :name="icon" :size="iconSize[$props.size ?? 'md']" />
  </button>
</template>
```

- [ ] **Step 4: Verificare il successo**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run IconButton.spec`
Expected: PASS (5 test).

- [ ] **Step 5: Export**

In `packages/ui-kit/src/index.ts`, aggiungere accanto agli altri export:
```ts
export { default as IconButton } from './components/IconButton.vue';
```

- [ ] **Step 6: Refactor dei close — Modal, Drawer, Toast usano IconButton**

In `Modal.vue`: importare `IconButton` (aggiungere `import IconButton from './IconButton.vue';`) e sostituire il blocco `DialogClose` attuale:
```
<DialogClose aria-label="Chiudi" class="grid size-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)]"><Icon name="x" :size="16" /></DialogClose>
```
con:
```
<DialogClose as-child><IconButton icon="x" label="Chiudi" variant="subtle" /></DialogClose>
```
Rimuovere l'import di `Icon` se non più usato altrove nel file (nel Modal attuale `Icon` è usato solo per la `x`, quindi va rimosso).

In `Drawer.vue`: identica sostituzione (stesso markup del close), con `import IconButton from './IconButton.vue';` e rimozione dell'import `Icon` se non più usato.

In `Toast.vue`: sostituire il `<button aria-label="Chiudi" …>` che emette `dismiss`:
```
<button type="button" aria-label="Chiudi" class="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)]" @click="emit('dismiss')"><Icon name="x" :size="14" /></button>
```
con:
```
<IconButton icon="x" label="Chiudi" size="sm" class="shrink-0" @click="emit('dismiss')" />
```
Aggiungere `import IconButton from './IconButton.vue';`. `Icon` in Toast è usato anche per `alert-triangle` → **non** rimuovere quell'import.

> `DialogClose as-child` (reka-ui) delega il comportamento di chiusura al figlio (l'IconButton), preservando ESC/click-to-close. L'`aria-label="Chiudi"` resta sul button reso, quindi i selettori `button[aria-label="Chiudi"]` degli spec restano validi.

- [ ] **Step 7: Regressione — spec dei tre componenti**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Modal.spec Drawer.spec Toast.spec`
Expected: PASS. In particolare `Toast.spec` (`button[aria-label="Chiudi"]` + emit `dismiss`) resta verde. Se un'asserzione dipendeva dalla vecchia struttura del close, aggiornarla per selezionare via `aria-label`.

- [ ] **Step 8: Suite completa + typecheck**

Run: `corepack pnpm --filter @coralyn/ui-kit test` → Expected: **90** (85 + 5 IconButton), verde.
Run: `corepack pnpm --filter @coralyn/web-staff test` → Expected: verde (conteggio = base + gli spec ui-kit globati).
Run: `corepack pnpm -r typecheck` → Expected: pulito.

- [ ] **Step 9: Verifica LIVE**

Con `preview_*`: aprire Modal e Drawer, verificare che il close abbia ora hover + focus-ring visibile (Tab per il focus). Screenshot di prova.

- [ ] **Step 10: Commit**

```bash
git add packages/ui-kit/src/components/IconButton.vue packages/ui-kit/src/components/IconButton.spec.ts packages/ui-kit/src/index.ts packages/ui-kit/src/components/Modal.vue packages/ui-kit/src/components/Drawer.vue packages/ui-kit/src/components/Toast.vue
git commit -m "feat(ui-kit): primitiva IconButton condivisa; close di Modal/Drawer/Toast unificati (Slice 2)"
```

---

## Task 3: Completezza Button — taglie, loading, press (Slice 3)

**Files:**
- Modify: `packages/ui-kit/src/icons/registry.ts`, `packages/ui-kit/src/components/Icon.spec.ts`
- Modify: `packages/ui-kit/src/components/Button.vue`, `packages/ui-kit/src/components/Button.spec.ts`

- [ ] **Step 1: Test che fallisce — registry ha loader-2**

In `packages/ui-kit/src/components/Icon.spec.ts`, aggiungere `'loader-2'` all'array del test "resolve le nuove chiavi del registry":
```ts
    for (const k of ['bell','settings','euro','clock','phone','mail','renew','edit','logout','building','filter','waves','chevron-down','archive','loader-2']) {
```

- [ ] **Step 2: Verificare il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Icon.spec`
Expected: FAIL (`icons['loader-2']` è undefined).

- [ ] **Step 3: Implementare — registrare loader-2**

In `packages/ui-kit/src/icons/registry.ts`:
- aggiungere l'import accanto agli altri: `import IconLoader from '~icons/lucide/loader-2';`
- aggiungere la voce nella mappa `icons`: `'loader-2': IconLoader,`

- [ ] **Step 4: Verificare il successo**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Icon.spec`
Expected: PASS.

- [ ] **Step 5: Test che fallisce — Button size/loading/press**

In `packages/ui-kit/src/components/Button.spec.ts`, aggiungere in coda al `describe('Button', …)`:

```ts
  it('applica la taglia sm', () => {
    const cls = mount(Button, { props: { size: 'sm' } }).classes().join(' ');
    expect(cls).toContain('px-3');
    expect(cls).toContain('py-1.5');
  });
  it('in loading mostra lo spinner, è disabilitato e aria-busy', () => {
    const w = mount(Button, { props: { loading: true }, slots: { default: 'Salva' } });
    expect(w.find('svg').exists()).toBe(true);           // spinner (loader-2)
    expect(w.attributes('disabled')).toBeDefined();
    expect(w.attributes('aria-busy')).toBe('true');
  });
  it('in loading non emette click', async () => {
    const w = mount(Button, { props: { loading: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeFalsy();
  });
  it('ha feedback di press (active:scale) e focus-ring', () => {
    const cls = mount(Button).classes().join(' ');
    expect(cls).toContain('active:scale-[.98]');
    expect(cls).toContain('focus-visible:[box-shadow:var(--ring-focus)]');
  });
```

- [ ] **Step 6: Verificare il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Button.spec`
Expected: FAIL (props `size`/`loading` inesistenti; classi assenti).

- [ ] **Step 7: Implementare — Button.vue**

Riscrivere `packages/ui-kit/src/components/Button.vue`:

```vue
<script setup lang="ts">
import Icon from './Icon.vue';
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    loading?: boolean;
  }>(),
  { variant: 'primary', size: 'md', loading: false },
);
const base = 'relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[.98] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm' } as const;
const variants = {
  primary: 'border-0 bg-[var(--color-brand)] text-white [box-shadow:var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-accent)] hover:bg-[var(--color-warm-025)]',
  ghost: 'border-0 bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-accent-tint)]',
  danger: 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:brightness-95',
} as const;
</script>
<template>
  <button
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    :class="[base, sizes[props.size], variants[props.variant]]"
  >
    <Icon v-if="loading" name="loader-2" :size="16" class="animate-spin" />
    <slot />
  </button>
</template>
```

> Note: `:disabled="loading || undefined"` non sovrascrive un `disabled` passato via `$attrs` quando `loading` è false (Vue fonde gli attrs; un `disabled` esplicito del chiamante resta). `active:scale-[.98]` è neutralizzato da reduced-motion (transizione azzerata). Lo spinner `animate-spin` usa la keyframe `spin` di Tailwind v4 (core), anch'essa fermata da reduced-motion.

- [ ] **Step 8: Verificare il successo**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run Button.spec`
Expected: PASS (i 2 test originali + i 4 nuovi).

- [ ] **Step 9: Suite completa + typecheck**

Run: `corepack pnpm --filter @coralyn/ui-kit test` → Expected: verde (90 + 4 nuovi Button = **94**; Icon.spec invariato come conteggio).
Run: `corepack pnpm --filter @coralyn/web-staff test` → Expected: verde. ⚠️ Se qualche componente web-staff passa `disabled`/loading al Button in modo incompatibile, il typecheck lo segnala.
Run: `corepack pnpm -r typecheck` → Expected: pulito.

- [ ] **Step 10: Verifica LIVE**

Con `preview_*`: individuare un Button in stato loading (o forzarlo temporaneamente) e verificare spinner rotante + press (active). Screenshot di prova.

- [ ] **Step 11: Commit**

```bash
git add packages/ui-kit/src/icons/registry.ts packages/ui-kit/src/components/Icon.spec.ts packages/ui-kit/src/components/Button.vue packages/ui-kit/src/components/Button.spec.ts
git commit -m "feat(ui-kit): Button con taglie, stato loading (loader-2) e feedback di press (Slice 3)"
```

---

## Task 4: EmptyState strutturato (Slice 4)

**Files:**
- Modify: `packages/ui-kit/src/components/EmptyState.vue`, `packages/ui-kit/src/components/EmptyState.spec.ts`
- Modify: call-site che improvvisano un empty (censiti allo Step 1)

- [ ] **Step 1: Censire i call-site attuali**

Run: `git grep -n "EmptyState" apps/ packages/ | grep -v spec`
Annotare ogni uso: verificare se passano solo `message`/slot default (restano compatibili) o se qualcuno replica a mano icona+titolo (candidati a migrare alle nuove prop). **Non** modificare il comportamento visibile se non richiesto: la migrazione dei call-site è opzionale e va fatta solo dove semplifica senza cambiare la resa. Registrare la lista nel messaggio di consegna della slice.

- [ ] **Step 2: Riscrivere lo spec (root passa da <p> a <div>)**

Sostituire integralmente `packages/ui-kit/src/components/EmptyState.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('retro-compat: rende il messaggio dalla prop', () => {
    const w = mount(EmptyState, { props: { message: 'Nessuna prenotazione per questa data.' } });
    expect(w.text()).toContain('Nessuna prenotazione per questa data.');
  });

  it('mantiene il contenitore tratteggiato con i token standard', () => {
    const w = mount(EmptyState, { props: { message: 'x' } });
    const root = w.get('[data-test="empty-state"]');
    const cls = root.classes().join(' ');
    expect(cls).toContain('border-dashed');
    expect(cls).toContain('border-[var(--color-border)]');
    expect(cls).toContain('rounded-[var(--radius-lg)]');
    expect(cls).toContain('text-center');
  });

  it('con icon+title li mostra sopra il messaggio', () => {
    const w = mount(EmptyState, { props: { icon: 'calendar', title: 'Nessun abbonato', message: 'Aggiungine uno.' } });
    expect(w.find('svg').exists()).toBe(true);          // icona dal registry
    expect(w.text()).toContain('Nessun abbonato');
    expect(w.text()).toContain('Aggiungine uno.');
  });

  it('rende lo slot #action per la CTA', () => {
    const w = mount(EmptyState, {
      props: { message: 'Vuoto' },
      slots: { action: '<button data-test="cta">Aggiungi</button>' },
    });
    expect(w.find('[data-test="cta"]').exists()).toBe(true);
  });

  it('lo slot #default sovrascrive il messaggio prop', () => {
    const w = mount(EmptyState, { props: { message: 'ignorato' }, slots: { default: 'Contenuto ricco.' } });
    expect(w.text()).toContain('Contenuto ricco.');
    expect(w.text()).not.toContain('ignorato');
  });
});
```

- [ ] **Step 3: Verificare il fallimento**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run EmptyState.spec`
Expected: FAIL (niente `data-test="empty-state"`, niente `icon`/`title`/slot `action`).

- [ ] **Step 4: Implementare — EmptyState.vue**

Riscrivere `packages/ui-kit/src/components/EmptyState.vue`:

```vue
<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ message?: string; icon?: string; title?: string }>();
</script>
<template>
  <div
    data-test="empty-state"
    class="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center"
  >
    <span v-if="icon" class="mb-1 grid size-11 place-items-center rounded-full bg-[var(--color-raised)] text-[var(--color-text-muted)]">
      <Icon :name="icon" :size="20" />
    </span>
    <p v-if="title" class="text-sm font-semibold text-[var(--color-text)]">{{ title }}</p>
    <p class="text-sm text-[var(--color-text-2nd)]"><slot>{{ message }}</slot></p>
    <div v-if="$slots.action" class="mt-2"><slot name="action" /></div>
  </div>
</template>
```

> Retro-compat: senza `icon`/`title`/`action` la resa è un contenitore tratteggiato con il solo messaggio — identica funzione a prima, root ora `<div>` (non più `<p>`). L'unico consumatore che asseriva `w.text()).toBe(...)` o le classi del `<p>` era lo spec, già aggiornato.

- [ ] **Step 5: Verificare il successo**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- run EmptyState.spec`
Expected: PASS (5 test).

- [ ] **Step 6: Regressione — call-site**

Run: `corepack pnpm --filter @coralyn/web-staff test` e `corepack pnpm --filter @coralyn/web-platform test`
Expected: verde. Se uno spec di una view asseriva la vecchia struttura `<p>` di EmptyState (improbabile — di solito verificano il testo), aggiornarlo per verificare il **testo** e non il tag.
Run: `corepack pnpm --filter @coralyn/ui-kit test` → Expected: verde (EmptyState passa da 2 a 5 test → **97**).

- [ ] **Step 7: Verifica LIVE**

Con `preview_*`: raggiungere una schermata con lista vuota (es. cliente senza prenotazioni) e confermare la nuova resa (icona/titolo/messaggio). Screenshot di prova.

- [ ] **Step 8: Commit**

```bash
git add packages/ui-kit/src/components/EmptyState.vue packages/ui-kit/src/components/EmptyState.spec.ts
git commit -m "feat(ui-kit): EmptyState strutturato (icona/titolo/CTA) retro-compatibile (Slice 4)"
```

---

## Task 5: Sweep di coerenza sugli interattivi restanti (Slice 5)

> **Principio:** solo allineamento di stato/stile (focus-visible ring, hover, disabled, radius/padding, token di motion dove esiste già una transizione). **Nessun** cambiamento funzionale. Ogni modifica non deve alterare gli spec esistenti (o li aggiorna con motivazione esplicita nel commit).

**Files (mirati):** `Select.vue`, `SegmentedControl.vue`, `SearchInput.vue`, `PageToolbar.vue`, `Textarea.vue`, `DataTable.vue` + relativi spec; `docs/design/design-system.md`.

- [ ] **Step 1: Audit — leggere ciascun componente e annotare i gap**

Leggere i 6 file e produrre una checklist per-componente: manca `focus-visible:[box-shadow:var(--ring-focus)]`? manca uno stato `hover:`? `disabled:` coerente (`opacity-50 cursor-not-allowed`)? radius/padding allineati agli altri? transizione con easing token dove c'è hover? Registrare la checklist nel messaggio di consegna.

- [ ] **Step 2: Per OGNI componente toccato — ciclo TDD breve**

Per ciascun componente con un gap reale, nel suo spec (se assente, crearlo minimale) aggiungere **un** test che asserisce la classe mancante, es. per `Select`:

```ts
it('porta il focus-ring standard', () => {
  const cls = mount(Select, { props: { /* props minime richieste */ } }).classes().join(' ');
  expect(cls).toContain('focus-visible:[box-shadow:var(--ring-focus)]');
});
```
Eseguirlo (FAIL), aggiungere la classe mancante al componente (allineata a `Input.vue`/`Button.vue`), rieseguirlo (PASS). Ripetere per hover/disabled dove pertinente. **Non** aggiungere test per stati non modificati.

> Applicare solo dove il gap esiste davvero (dall'audit Step 1). Se un componente è già coerente, non toccarlo (evita churn e falsi test).

- [ ] **Step 3: Suite completa + typecheck**

Run: `corepack pnpm --filter @coralyn/ui-kit test` → verde (conteggio = 97 + i nuovi test dello sweep).
Run: `corepack pnpm --filter @coralyn/web-staff test` e `--filter @coralyn/web-platform test` → verde.
Run: `corepack pnpm -r typecheck` → pulito.

- [ ] **Step 4: Documentare lo standard**

In `docs/design/design-system.md`, aggiungere una sezione breve "Stato degli interattivi" che fissa lo standard: focus-visible ring = `var(--ring-focus)`; hover per superficie; disabled = `opacity-50 cursor-not-allowed`; transizioni con `--ease-standard`/`--motion-fast`. Rimandare a `IconButton`/`Button` come riferimenti canonici.

- [ ] **Step 5: Verifica LIVE**

Con `preview_*`: navigare Tab tra Select/SegmentedControl/SearchInput/PageToolbar e confermare che il focus-ring compaia coerente ovunque. Screenshot di prova.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/components docs/design/design-system.md
git commit -m "refactor(ui-kit): sweep di coerenza focus/hover/disabled sugli interattivi + doc standard (Slice 5)"
```

---

## Chiusura

- [ ] **Verifica finale complessiva**

Run: `corepack pnpm --filter @coralyn/ui-kit test` · `--filter @coralyn/web-staff test` · `--filter @coralyn/web-platform test` · `corepack pnpm -r typecheck` → tutto verde/pulito, conteggi = baseline + i nuovi test attesi documentati per slice.

- [ ] **Consegna**

Aggiornare l'handoff (nuovo file in `docs/handoff/`) con: stato per-slice, nuovi conteggi test, screenshot di prova del motion, e nota che il push su `main` (FF) attende ok esplicito dell'utente. Presentare e attendere conferma per il merge.

---

## Self-review del piano (eseguita)

- **Copertura spec §4 (6 slice):** Task 0↔Slice 0, Task 1↔Slice 1, Task 2↔Slice 2, Task 3↔Slice 3, Task 4↔Slice 4, Task 5↔Slice 5. Rinvii (Toast multi-tono, form/dati=C, token) restano fuori: nessun task li tocca. ✔
- **Decisioni §5:** IconButton generico (Task 2) ✔; `loader-2` nel registry (Task 3, Step 3) ✔; scope A+B con conferma tra slice (nota in testa + chiusura di ogni Task) ✔.
- **Placeholder:** nessun TBD/TODO; ogni step con codice mostra il codice. ✔
- **Coerenza tipi/nomi:** keyframe names (`overlay-in/out`, `dialog-in/out`, `drawer-in/out`, `toast-in/out`) e token (`--motion-fast/base/slow`) coincidono tra Task 0 (definizione) e Task 1 (uso). `IconButton` prop (`icon`, `label`, `variant`, `size`, `disabled`) coerenti tra spec e componente e uso nei close. `loader-2` coerente tra registry, Icon.spec e Button.vue. ✔
- **Baseline:** i conteggi attesi sono indicati come guida (79→82→85→90→94→97→+sweep); l'esecutore li conferma davvero e li aggiorna se lo sweep aggiunge test. La natura "glob ui-kit in web-staff" è richiamata a ogni suite. ✔
