# Spec — Nome stabilimento reale (`/auth/me` → `UserDTO.establishmentName`)

> Design **CONFERMATO** con l'utente (2026-07-06, filone "rendile vere" §3.3). Prima slice **NON FE-only** del filone:
> tocca **contracts + backend + FE (web-staff & web-platform)**. Variante "professionale, senza debiti".

---

## 1. Contesto e problema

Il nome dello stabilimento è **hardcoded** in due punti:
- [stores/session.ts:14](../../../apps/web-staff/src/stores/session.ts) — `establishmentName = ref('Lido Maestrale')`, mostrato in [Sidebar.vue:31](../../../apps/web-staff/src/app/Sidebar.vue).
- [router/index.ts:10](../../../apps/web-staff/src/router/index.ts) — subtitle `/map` = `'Lido Maestrale · 47 ombrelloni · vista per giornata'` (nome hardcoded **e** conteggio ombrelloni **finto**).

`/auth/me` e `UserDTO` non espongono il nome ([contracts UserDTO](../../../packages/contracts/src/index.ts): solo `id/email/role/establishmentId`). Il DB ha `Establishment.name` (required). Il superuser ha `establishmentId = null`.

## 2. Decisioni (CONFERMATE)

1. **Contract:** `UserDTO` aggiunge **`establishmentName: string | null`** (campo richiesto; `null` per il superuser). Aggiornare i 2 literal reali: `MOCK_ADMIN` (web-staff), `MOCK_SUPERUSER` (web-platform). Gli inline `as any` in web-platform `session.spec` non danno errori TS.
2. **Backend:** in `identity.service`, `login` e `me` fanno `include: { establishment: { select: { name: true, suspendedAt: true } } }` sulla query `user.findUnique`; `toDTO` popola `establishmentName = u.establishment?.name ?? null`. Questo **consolida** la verifica di sospensione del login (oggi `user.findUnique` + una `establishment.findUnique` separata) in **una sola** query — è la via naturale per avere il nome nel dto, ed è **behavior-preserving** (superuser `establishment=null` → nessun controllo sospensione, invariato).
3. **FE store:** `establishmentName` diventa **computed** da `user.value?.establishmentName ?? ''` (fonte unica = sessione) invece di ref hardcoded. La Sidebar lo legge già; nessuna modifica alla Sidebar.
4. **Subtitle Mappa:** rimuovere il nome hardcoded e il conteggio finto → `subtitle: 'Vista per giornata'`. Il nome (dinamico) vive nella Sidebar (chrome dell'app); duplicarlo nel sottotitolo per-vista è ridondante, e "47 ombrelloni" era fabbricato. Nessuna logica nel Topbar.

## 3. Impatto per file

**Contracts** (`packages/contracts/src/index.ts`): `UserDTO` + `establishmentName: string | null`. Ricompilare `@coralyn/contracts` (dist gitignored) prima di typecheck/e2e.

**API** (`apps/api`):
- `src/identity/identity.service.ts`: `toDTO(u: User & { establishment: { name: string } | null })` → aggiunge `establishmentName`; `login`/`me` con `include` dell'establishment; login usa `user.establishment?.suspendedAt` (rimossa la `establishment.findUnique` separata).
- `src/identity/identity.service.spec.ts`: `makeService` non mocka più `establishment.findUnique`; lo `user` mock porta `establishment: { name, suspendedAt }`; riscrivere i 3 test (sospeso → 401; attivo → ok + `establishmentName`; superuser `establishment: null` → ok + `establishmentName` null).
- `test/auth.e2e-spec.ts`: login admin → `establishmentName: 'Auth E2E'` (nome semina); `/me` admin idem; `/me` superuser → `establishmentName` null (accanto a `establishmentId` null).

**FE web-staff** (`apps/web-staff`):
- `src/mocks/server.ts`: `MOCK_ADMIN` + `establishmentName: 'Lido Maestrale'` (mantiene il valore atteso nei test Sidebar).
- `src/stores/session.ts`: `establishmentName` → `computed(() => user.value?.establishmentName ?? '')` (rimuovere la ref hardcoded).
- `src/stores/session.spec.ts`: asserire che dopo login/rehydrate `establishmentName` = valore del mock.
- `src/router/index.ts`: subtitle `/map` → `'Vista per giornata'`.

**FE web-platform** (`apps/web-platform`):
- `src/mocks/handlers.ts`: `MOCK_SUPERUSER` + `establishmentName: null`.

## 4. Test / verifica
- API: `--filter @coralyn/api test` (unit) + `--filter @coralyn/api test:e2e --runInBand` (autoritativo) + typecheck. Baseline api unit **200**, e2e **235**.
- web-staff: `--filter web-staff test` + typecheck. Baseline **253**.
- web-platform: `--filter web-platform test` + typecheck. Baseline **16**.
- Ordine: **contracts+API insieme** (stesso layer, gotcha), poi FE. Ricompilare contracts prima di ogni typecheck.

## 5. Fuori scope
- Il conteggio ombrelloni reale nel sottotitolo/altrove (feature separata "rendile vere"). Nessun endpoint nuovo (riuso `/auth/me`; non uso il GET `/establishment` di EstablishmentView per non aggiungere un fetch al bootstrap).

## 6. Baseline (LIVE su `main` post ricerca clienti)
contracts build ok · api unit **200** · api e2e **235** · web-staff **253** · web-platform **16** · ui-kit **73** · typecheck pulito.
