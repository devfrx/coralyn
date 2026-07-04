# Spec — Stabilimento (overview read-only) · 2026-07-04

> Design approvato in brainstorming (2026-07-04). Read-only, tenant-scoped, **nessuna migrazione**, **nessun nuovo ADR**
> (composizione read-only su convenzione già stabilita da `reports/`).
> Terminale: `superpowers:writing-plans` → piano TDD a layer, subagent-driven, un commit per layer.

## 1. Obiettivo
Portare [`EstablishmentView.vue`](../../../apps/web-staff/src/features/establishment/EstablishmentView.vue) dal mock
statico (`structure`/`users`/stagione hardcoded) a **dati reali**, tramite un unico endpoint di **proiezione read-only**
`GET /api/establishment/overview`. Consegna l'**intera superficie visibile** della schermata Stabilimento in lettura;
rimanda solo le **scritture/gestione** (che toccano RBAC).

Effetto collaterale positivo: l'endpoint espone finalmente il **nome dello stabilimento**, oggi hardcoded nel session
store (`establishmentName = 'Lido Maestrale'`, con commento "resta un default finché un endpoint dedicato non lo
fornirà"). Ripaga quel micro-debito per la schermata Stabilimento (la nav header globale resta follow-up, §7).

## 2. Decisioni risolte (brainstorming 2026-07-04)
- **Scope = read-only completo** (tutte e 5 le card in lettura). Scartate: "minimo" (ometteva la card *Utenti* → buco
  visibile vs mock, pigro) e "+ inizio D-025" (mezza-RBAC innestata su una slice di presentazione → **debito**, viola
  modularità). *Elencare* gli utenti è una GET tenant-scoped, non RBAC; *gestirli* è [D-025](../../architecture/deferred.md).
- **Confine con D-025 (zero debito)**: rimandati *gestione* utenti (invita/cambia-ruolo/rimuovi) + role-guard sugli
  endpoint. Questa slice **solo elenca**.
- **Azioni rimandate = disabilitate + "in arrivo"** (`Badge tone="soon"`, come i due badge già presenti nel mock):
  `Modifica` (profilo), `Configura` (struttura), `Inviti e gestione`. Comunica la roadmap, resta fedele al mock, nessun
  click morto. Scartato: nasconderle (diverge dal mock, non comunica).
- **`activeSeason` = stagione che contiene *oggi*, altrimenti `null` → "Nessuna stagione attiva"** (onesto, zero-magia,
  coerente con la convenzione di `reports.service` `startDate ≤ today ≤ endDate`). Scartato un fallback "stagione più
  recente" etichettato "attiva": **fuorviante** (debito semantico). L'empty-state off-season è lo stato *corretto*.
- **"Tu"** marcato sul **FE** (`session.userEmail === member.email`): il DTO resta una proiezione pura tenant-scoped,
  senza accoppiamento all'identità del richiedente per-request.
- **Nessun nuovo componente ui-kit**: `Card`/`StatTile`/`Badge`/`Avatar`/`Button`/`Icon` esistono già e coprono il mock.

## 3. Contratto — `EstablishmentOverviewDTO` (in `@coralyn/contracts`, additivo)
```ts
interface EstablishmentMemberDTO {
  id: string;
  email: string;
  role: 'admin' | 'staff';        // superuser escluso (è di piattaforma, non del team del lido)
}

interface EstablishmentOverviewDTO {
  establishment: { id: string; name: string };
  activeSeason: { name: string; startDate: string; endDate: string } | null; // copre oggi, else null
  timeSlots: { id: string; name: string }[];   // fasce operative, ordinate per sortOrder
  structure: {
    sectors: number;              // count Sector (tenant)
    umbrellas: number;            // count Umbrella (tenant)
    types: number;                // count UmbrellaType (tenant)
    packages: number;             // count Package NON archiviati (archivedAt = null)
  };
  team: EstablishmentMemberDTO[]; // utenti del tenant, superuser escluso, admin-first poi email asc
}
```

## 4. Backend — endpoint (L2), specchio di `reports/`
- **`GET /api/establishment/overview`** — nuovo `EstablishmentModule` / `EstablishmentController` (`@Controller('establishment')`,
  `@Get('overview')`) + `EstablishmentService`. **Tenant-scoped** via `prisma.forTenant`, autenticato (no `@Public`),
  **read-only**, **nessuna migrazione**. Nessun query param.
- `EstablishmentService.getOverview(tenantId)`: una `prisma.forTenant(tenantId, tx => Promise.all([...]))` con i conteggi
  (`count` su Sector/Umbrella/UmbrellaType/Package-non-archiviati), la lista `TimeSlot` (order `sortOrder`), le `Season`
  del tenant, gli `User` del tenant, il nome `Establishment`.
- **Proiezione PURA** `establishment.projection.ts`:
  - `pickActiveSeason(seasons, todayISO)` → la stagione con `startDate ≤ today ≤ endDate`, altrimenti `null`.
  - `toEstablishmentOverview(raw)` → assembla il DTO (mappa membri escludendo `superuser`, ordina admin-first poi email,
    costruisce `structure`/`timeSlots`/`activeSeason`).
- **Unit** (`establishment.projection.spec.ts`): `pickActiveSeason` (copre oggi / off-season → null / bordi inclusivi);
  shaping (esclusione superuser, ordinamento team, packages archiviati non contati se il conteggio arriva già filtrato →
  verificato a livello service/e2e; la purezza testa il mapping su input dato).
- **e2e** (`establishment.e2e-spec.ts`): **401** senza token; **200** con dati seminati → asserisce nome, `activeSeason`
  presente, conteggi corretti, `team` esclude il superuser ed è ordinato admin-first; **isolamento tenant** (un secondo
  tenant non contamina i conteggi/il team). Caso `activeSeason = null` con stagione fuori-oggi.

## 5. FE — `EstablishmentView` reale (L3)
- Composable `useEstablishmentOverview()` (pattern `useReportSummary`): `queryResource` +
  `queryKeys.establishmentOverview(session.establishmentId)` + `apiFetch<EstablishmentOverviewDTO>('/establishment/overview')`.
  Nuova chiave in [`queryKeys.ts`](../../../apps/web-staff/src/lib/queryKeys.ts).
- `EstablishmentView.vue`: rimuove i seam mock (`structure`/`users`/stringa stagione), consuma il DTO:
  - **Header**: `establishment.name`, ruolo/email da `session`, stagione da `activeSeason`. `Modifica` → **disabilitato +
    "in arrivo"** (oggi è un `Button` semplice: va reso `disabled` con `Badge tone="soon"` come gli altri).
  - **Informazioni**: Nome, Stagione attiva (`activeSeason` → "Estate 2026 · 1 giu – 15 set" oppure "Nessuna stagione
    attiva"), Fasce operative (`timeSlots.map(name).join(' · ')`).
  - **Struttura**: 4 `StatTile` da `structure`; badge `Configura · in arrivo` (già presente).
  - **Utenti e ruoli**: righe da `team`, `Badge` ruolo (label IT: admin→"Amministratore", staff→"Staff"), `Badge` "Tu"
    su `session.userEmail === member.email`, iniziali da email; badge `Inviti e gestione · in arrivo` (già presente).
  - **Sessione**: **invariata** (logout già reale).
  - Stati **loading / error / empty** coerenti con le altre view.
- **Test web-staff** (`EstablishmentView.spec.ts` + composable): render name/stagione/slot/tile/team; "Tu" sull'utente
  corrente; label ruolo IT; empty-state stagione null; badge "in arrivo" presenti e `Modifica` disabilitato; `Esci`
  cablato al logout. Seed MSW per il fetch.

## 6. Layer / commit (subagent-driven, un commit per layer, test-first)
1. **contracts**: `EstablishmentOverviewDTO` + `EstablishmentMemberDTO` → `pnpm --filter @coralyn/contracts build`
   **prima** dei test api (gotcha handoff §6).
2. **api**: projection pura (+ unit) → service → module → controller → e2e.
3. **web-staff**: `queryKeys` + composable (+ test) → `EstablishmentView` reale (+ test).
4. **docs**: riga in `deferred.md` su D-025 ("overview read-only consegnato; gestione utenti ancora deferita"); aggiorno
   handoff a fine slice.

## 7. Fuori scope / deferiti (tracciati, non tagliati in silenzio)
- **Gestione utenti** (invita/cambia-ruolo/rimuovi) + **role-guard** sugli endpoint → **D-025**.
- **Modifica stabilimento** (rinomina, stagione, fasce) e **Configura struttura** (settori/tipologie/planimetria →
  D-005) = scritture, fuori da questa slice read-only.
- **`/auth/me` non espone il nome stabilimento** → la **nav header globale** resta sul default hardcoded del session
  store finché non tocchiamo `/me`/D-025. Follow-up tracciato, non in questo slice (la schermata Stabilimento usa il
  nome reale dall'overview).
- Avatar/logo caricabile, "Sessione" con dettagli reali (scadenza token effettiva) → futuri.

## 8. Testing / DoD
TDD per layer. Baseline da non regredire (fine sessione 2026-07-04): **ui-kit 70 · web-staff 178 · api unit 118 ·
api e2e 165 · typecheck pulito**. Verifica **LIVE** della schermata quando Docker è su (rebuild `--build api web`,
gotcha §6). Nessuna migrazione, nessun nuovo ADR.
