<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, StatTile, Badge, Button, Avatar, Icon, Modal, Field, Input, Select, ConfirmDialog, ActionBar, SkeletonText, useDelayedLoading } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { pushToast } from '@/lib/toasts';
import { useEstablishmentOverview, useRenameEstablishment, useCreateStaffUser, useSetStaffUserDisabled, useResetStaffPassword } from './useEstablishment';

const session = useSessionStore();
const router = useRouter();
const { data, isPending, isError } = useEstablishmentOverview();
const skeletonVisible = useDelayedLoading(() => isPending.value);

function signOut() {
  session.logout();
  router.push('/login');
}

const MONTH_DAY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (iso: string) => MONTH_DAY.format(new Date(`${iso}T00:00:00Z`));

const seasonLabel = computed(() => {
  const s = data.value?.activeSeason;
  return s ? `${s.name} · ${fmtDay(s.startDate)} – ${fmtDay(s.endDate)}` : 'Nessuna stagione attiva';
});
const seasonName = computed(() => data.value?.activeSeason?.name ?? 'Nessuna stagione attiva');
const slotsLabel = computed(() => (data.value?.timeSlots ?? []).map((t) => t.name).join(' · ') || '—');
const structureTiles = computed(() => {
  const s = data.value?.structure;
  return [
    { value: String(s?.sectors ?? 0), label: 'Settori' },
    { value: String(s?.umbrellas ?? 0), label: 'Ombrelloni' },
    { value: String(s?.types ?? 0), label: 'Tipologie' },
    { value: String(s?.packages ?? 0), label: 'Pacchetti' },
  ];
});

const ROLE_LABEL: Record<'admin' | 'staff', string> = { admin: 'Amministratore', staff: 'Staff' };
const currentUserRoleLabel = computed(() =>
  session.role === Role.Admin ? 'Amministratore' : session.role === Role.Superuser ? 'Superuser' : 'Staff',
);
const team = computed(() =>
  (data.value?.team ?? []).map((m) => ({
    id: m.id,
    email: m.email,
    roleLabel: ROLE_LABEL[m.role],
    tone: m.role === 'admin' ? ('brand' as const) : ('neutral' as const),
    ini: m.email.slice(0, 2).toUpperCase(),
    you: session.userEmail === m.email,
    disabled: m.disabledAt !== null,
  })),
);

const isAdmin = computed(() => session.role === Role.Admin);
const renameOpen = ref(false);
const nameDraft = ref('');
const rename = useRenameEstablishment();

function openRename() {
  nameDraft.value = data.value?.establishment.name ?? '';
  renameOpen.value = true;
}
function submitRename() {
  const name = nameDraft.value.trim();
  if (!name) return;
  rename.mutate(
    { name },
    { onSuccess: () => { renameOpen.value = false; } },
  );
}

const addOpen = ref(false);
const newEmail = ref('');
const newRole = ref<'admin' | 'staff'>('staff');
const createUser = useCreateStaffUser();
const setDisabled = useSetStaffUserDisabled();
const resetStaff = useResetStaffPassword();
const creating = computed(() => createUser.isPending.value);
const togglingDisabled = computed(() => setDisabled.isPending.value);

function openAddUser() {
  newEmail.value = '';
  newRole.value = 'staff';
  addOpen.value = true;
}
function submitAddUser() {
  const email = newEmail.value.trim();
  if (!email) return;
  createUser.mutate(
    { email, role: newRole.value },
    { onSuccess: () => { addOpen.value = false; pushToast(`Invito inviato a ${email}.`); } },
  );
}
function toggleDisabled(u: { id: string; disabled: boolean }) {
  setDisabled.mutate({ id: u.id, disabled: !u.disabled });
}

const resetOpen = ref(false);
const resetTarget = ref<{ id: string; email: string } | null>(null);
function askReset(u: { id: string; email: string }) {
  resetTarget.value = { id: u.id, email: u.email };
  resetOpen.value = true;
}
function onConfirmReset() {
  const t = resetTarget.value;
  if (!t) return;
  resetOpen.value = false;
  resetStaff.mutate(t.id, { onSuccess: () => pushToast(`Link di reset inviato a ${t.email}.`) });
}
</script>

<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[22px]">
    <Card class="mb-4">
      <div class="flex items-center gap-[18px] p-[22px]">
        <img src="/coralyn-logo.png" :alt="data?.establishment.name ?? 'Stabilimento'" class="size-14 rounded-[14px] object-cover" style="box-shadow:0 2px 8px rgba(15,60,73,.18);" />
        <div class="min-w-0 flex-1">
          <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ data?.establishment.name ?? '…' }}</h2>
          <div class="mt-1 text-[13px] text-[var(--color-text-muted)]">{{ currentUserRoleLabel }} · {{ session.userEmail }} · <span class="tabular-nums">{{ seasonName }}</span></div>
        </div>
        <Button v-if="isAdmin" data-testid="edit-establishment" variant="secondary" size="sm" @click="openRename"><Icon name="edit" :size="15" />Modifica</Button>
        <div v-else class="flex items-center gap-2">
          <Badge tone="soon">Modifica · in arrivo</Badge>
          <Button variant="secondary" size="sm" disabled><Icon name="edit" :size="15" />Modifica</Button>
        </div>
      </div>
    </Card>

    <p v-if="isError" class="mb-4 text-sm text-[var(--color-danger)]">Impossibile caricare i dati dello stabilimento.</p>

    <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <div class="p-5">
          <span class="text-sm font-bold text-[var(--color-text)]">Informazioni stabilimento</span>
          <SkeletonText v-if="skeletonVisible" :lines="3" class="mt-4" aria-busy="true" />
          <div v-else class="mt-4 flex flex-col gap-3.5">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ data?.establishment.name ?? '…' }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Stagione attiva</div><div class="text-sm font-medium tabular-nums text-[var(--color-text)]">{{ seasonLabel }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Fasce operative</div><div class="text-sm font-medium text-[var(--color-text)]">{{ slotsLabel }}</div></div>
          </div>
        </div>
      </Card>
      <Card>
        <div class="p-5">
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm font-bold text-[var(--color-text)]">Struttura della spiaggia</span>
            <Button v-if="isAdmin" data-testid="configure-structure" variant="secondary" size="sm" @click="$router.push('/establishment/structure')"><Icon name="settings" :size="13" />Configura</Button>
            <Badge v-else tone="soon">Configura · in arrivo</Badge>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <StatTile v-for="s in structureTiles" :key="s.label" :value="s.value" :label="s.label" :loading="isPending" />
          </div>
        </div>
      </Card>
    </div>

    <Card class="mb-4">
      <div class="p-5">
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-sm font-bold text-[var(--color-text)]">Utenti e ruoli</span>
          <Button v-if="isAdmin" data-testid="add-user" variant="secondary" size="sm" @click="openAddUser"><Icon name="plus" :size="13" />Aggiungi utente</Button>
          <Badge v-else tone="soon"><Icon name="plus" :size="13" />Inviti e gestione · in arrivo</Badge>
        </div>
        <p class="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">Il team dello stabilimento ha ruoli <strong class="text-[var(--color-text-2nd)]">Amministratore</strong> e <strong class="text-[var(--color-text-2nd)]">Staff</strong>. Il ruolo <strong class="text-[var(--color-text-2nd)]">Superuser</strong> è di piattaforma (console cross-stabilimento) e non appartiene al team del lido.</p>
        <p v-if="!isPending && team.length === 0" class="py-3 text-sm text-[var(--color-text-muted)]">Nessun utente nel team.</p>
        <SkeletonText v-if="skeletonVisible" :lines="3" aria-busy="true" />
        <div v-else class="flex flex-col">
          <div v-for="u in team" :key="u.id" data-testid="team-row" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-3 last:border-0" :class="u.disabled && 'opacity-55'">
            <Avatar :initials="u.ini" size="md" :tone="u.tone === 'brand' ? 'brand' : 'accent'" />
            <div class="flex flex-1 items-center gap-2">
              <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ u.email }}</span>
              <Badge v-if="u.you" tone="accent">Tu</Badge>
              <Badge v-if="u.disabled" tone="neutral">Disabilitato</Badge>
            </div>
            <Badge :tone="u.tone">{{ u.roleLabel }}</Badge>
            <ActionBar v-if="isAdmin && !u.you" gap="sm">
              <Button data-testid="toggle-user-disabled" variant="secondary" size="sm" :loading="togglingDisabled" @click="toggleDisabled(u)">{{ u.disabled ? 'Riabilita' : 'Disabilita' }}</Button>
              <Button v-if="!u.disabled" data-testid="reset-user-password" variant="secondary" size="sm" :loading="resetStaff.isPending.value" @click="askReset(u)">Reset password</Button>
            </ActionBar>
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div class="flex items-center gap-3.5 p-5">
        <span class="grid size-10 flex-none place-items-center rounded-[11px] bg-[var(--color-accent-tint)] text-[var(--color-accent)]"><Icon name="shield" :size="20" /></span>
        <div class="min-w-0 flex-1">
          <div class="text-[13.5px] font-bold text-[var(--color-text)]">Sessione</div>
          <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Accesso protetto · la sessione scade dopo 8 ore.</div>
        </div>
        <Button variant="danger" size="sm" data-testid="sign-out" @click="signOut"><Icon name="logout" :size="16" />Esci</Button>
      </div>
    </Card>

    <Modal v-model:open="renameOpen" title="Rinomina stabilimento" eyebrow="Modifica">
      <form id="form-rename-establishment" class="flex flex-col gap-4" @submit.prevent="submitRename">
        <Field label="Nome">
          <Input name="establishment-name" data-testid="establishment-name-input" v-model="nameDraft" placeholder="Nome del lido" />
        </Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="renameOpen = false">Annulla</Button>
          <Button type="submit" form="form-rename-establishment" data-testid="establishment-name-save">Salva</Button>
        </div>
      </template>
    </Modal>

    <Modal v-model:open="addOpen" title="Aggiungi utente" eyebrow="Team">
      <form id="form-add-user" class="flex flex-col gap-4" @submit.prevent="submitAddUser">
        <Field label="Email">
          <Input name="new-user-email" data-testid="new-user-email" v-model="newEmail" type="email" placeholder="nome@stabilimento.it" />
        </Field>
        <Field label="Ruolo">
          <Select v-model="newRole" data-testid="new-user-role">
            <option value="staff">Staff</option>
            <option value="admin">Amministratore</option>
          </Select>
        </Field>
        <p class="text-xs leading-relaxed text-[var(--color-text-muted)]">Riceverà un'email per impostare la propria password.</p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="addOpen = false">Annulla</Button>
          <Button type="submit" form="form-add-user" data-testid="new-user-save" :disabled="creating">Invia invito</Button>
        </div>
      </template>
    </Modal>

    <ConfirmDialog
      v-model:open="resetOpen"
      title="Reset password?"
      :description="`Invieremo a ${resetTarget?.email ?? ''} un'email per impostare una nuova password. La password attuale resta valida finché non ne imposta una nuova.`"
      confirm-label="Invia link di reset"
      @confirm="onConfirmReset"
    />
  </section>
</template>
