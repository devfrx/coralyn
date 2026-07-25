# ADR-0058: Package `@coralyn/data-layer` condiviso, fattorizzato per strati e non per app

- **Status:** Accepted
- **Data:** 2026-07-25
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0056](0056-package-legale-condiviso.md) (**precedente per forma e
  confezionamento**: struttura, `exports` sul sorgente, peer dependency),
  [ADR-0033](0033-astrazione-componenti-frontend.md) (§5.3, i composable server-state),
  [ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md) (**delimita**: il refresh
  single-flight del canale cliente resta fuori dal package),
  [ADR-0017](0017-design-system-frontend.md) (perimetro di `ui-kit`),
  [ADR-0038](0038-libreria-grafici-echarts.md) (`sideEffects`, P9-007),
  [ADR-0026](0026-identita-rls-utente.md) (il tenant è dedotto dal JWT, non da un header)
- **Origine:** audit 2026-07-25, [D-065](../deferred.md) — approvata dall'utente il 2026-07-25
- **Chiude:** [D-065](../deferred.md)

## Context

`http.ts`, `toasts.ts`, `queryClient.ts`, `useQueryResource.ts` e `onApiError.ts` esistevano in due
copie in `web-staff` e `web-platform`. La Fase F dell'audit aveva aggiunto la quinta **di proposito**
— per non prendere una decisione strutturale dentro un fix — dichiarandolo nel commento in testa a
`web-platform/src/lib/onApiError.ts`.

### La misura ha corretto due volte l'enunciato del problema

D-065 diceva «cinque file identici in due copie». Confrontando i file a commenti rimossi:

| Artefatto | Copie **misurate** | Note |
|---|---|---|
| `toasts.ts` | **3** | byte-identico anche in `web-customer` |
| `useQueryResource.ts` | **3** | byte-identico anche in `web-customer` |
| `ToastHost.vue` | **3** | byte-identico; **non era nell'elenco dei cinque** |
| `ApiError` + `readErrorMessage` | **3** | testualmente identici dentro i tre `http.ts` |
| `apiFetch` (bearer, senza refresh) | 2 | `web-customer` ha la variante col refresh |
| `onApiError.ts`, `queryClient.ts` | 2 | **codice** identico, divergono solo i commenti |
| `authToken.ts` | 2 | identico tranne la stringa della chiave |

Due conseguenze, entrambe contrarie a come D-065 era scritta:

1. **`ApiError` non era il nodo, era la chiave.** D-065 lo descriveva come l'ostacolo («definito per
   app… un modulo condiviso deve farsela iniettare»). È invece testualmente identico in tutte e tre
   le app: portarlo nel package è ciò che rende `error instanceof ApiError` capace di attraversare
   il confine app↔package, cioè scioglie esattamente il vincolo che il commento di Fase F
   dichiarava bloccante. Nessuna iniezione di tipo è servita.
2. **«Non toccare `web-customer`» era giusto ma troppo largo.** È corretto per `apiFetch`: il
   refresh single-flight ([ADR-0049](0049-auth-cliente-provisioned-tenant-pubblico.md)) è logica
   diversa, e accorparla sarebbe una falsa fattorizzazione. Non è corretto per `toasts.ts`,
   `useQueryResource.ts` e `ToastHost.vue`, che sono byte-identici e non hanno alcun rapporto con
   ADR-0049. Il vincolo come scritto avrebbe lasciato in piedi tre duplicati misurati.

### La duplicazione non era presidiata, e si è provato invece di dedurlo

Prima di estrarre, le copie di `web-platform` — le uniche senza spec propri — sono state **degradate
una alla volta**:

| Mutazione | `web-staff` (ha gli spec) | `web-platform` (non li ha) |
|---|---|---|
| `apiFetch` smette di allegare il `Bearer` | **2 test rossi** | **29/29 verdi** |
| `mutationResource` perde il toast d'errore | **6 test rossi** | **29/29 verdi** |

La console superuser poteva smettere di autenticarsi senza che un solo test se ne accorgesse. Il
punto non è che mancassero i test: **esistevano già**, puntati su una copia sola. È questa asimmetria
— non l'eleganza — la ragione della decisione.

## Decision

**1. Nuovo package `packages/data-layer` (`@coralyn/data-layer`), fattorizzato per STRATI.**
Il criterio di appartenenza è **«ciò che non conosce né il router, né lo store, né la chiave di
sessione dell'app che lo usa»**. Da esso discendono due strati, non due elenchi:

| Strato | Contenuto | Consumatori |
|---|---|---|
| **base** | `ApiError`, `readErrorMessage`, `readJsonBody`, `API_BASE`, `queryResource`/`mutationResource`, `QUERY_DEFAULTS` | **tutte e tre** le app |
| **sessione semplice** | `createApiFetch`, `handleUnauthorized`, `createQueryClient` | `web-staff`, `web-platform` |

`ApiError` è **una sola classe per tutto il monorepo**, ed è quella proprietà — non un'astrazione più
elegante — a rendere condivisibile `handleUnauthorized`.

**2. `web-customer` entra nello strato base e resta fuori dal secondo.** Compone il proprio
`apiFetch` (rotazione silenziosa single-flight, ADR-0049) riusando `ApiError`, `readErrorMessage` e
`readJsonBody`, e costruisce il proprio `QueryClient` con `QUERY_DEFAULTS` **senza**
`createQueryClient`: la politica «401 → logout + redirect» qui sarebbe sbagliata, perché il ritorno
all'attivazione lo decide `CustomerShell` osservando `authenticated`. Il suo `http.ts` passa da 79 a
57 righe, e ciò che resta è esattamente ciò che lo distingue.

**3. Il sistema toast completo va in `ui-kit`, non nel package nuovo.** `Toast.vue` ci vive già;
portarci la coda (`toasts.ts`) e il contenitore (`ToastHost.vue`) rende la feature intera in un posto
solo. In entrambe le collocazioni il package nuovo avrebbe comunque acquisito un arco verso `ui-kit`
— in una perché `ToastHost` renderizza `Toast`, nell'altra perché `mutationResource` chiama
`pushToast` — quindi l'alternativa non comprava un grafo più pulito. Una coda di toast è **stato di
presentazione senza contenuto di dominio**: rientra nel perimetro di `ui-kit` come lo descrive
[ADR-0056](0056-package-legale-condiviso.md), e questo ADR lo ratifica esplicitamente invece di
lasciarlo implicito.

**4. `ui-kit` espone `./toasts` come subpath.** Il data-layer ha **zero** file `.vue`; importare
`pushToast` dal barrel avrebbe trascinato gli SFC e con essi i moduli virtuali `~icons/lucide/*`,
obbligando il package a installare `@vitejs/plugin-vue`, `unplugin-icons` e `@iconify-json/lucide`
per compilare i test di un wrapper di `fetch`. Il subpath risolve la catena di **build**; quella di
**runtime** era già risolta da `sideEffects` (P9-007) e non è la stessa cosa. Le app continuano a
importare dal barrel.

**5. `apiFetch` è composto per app, `ApiError` no.** `apps/*/src/lib/http.ts` resta come *composition
root* — tre righe che dicono soltanto dove sta il token di quell'app — e **non ri-esporta**
`ApiError`: chi ne ha bisogno lo importa da `@coralyn/data-layer`. Un re-export avrebbe risparmiato
una decina di righe di import e riaperto la porta a una classe locale reintrodotta senza che nulla
protesti, che è il difetto che questo ADR chiude.

**6. Il getter del token è invocato a ogni chiamata, non catturato alla creazione.** `createApiFetch`
è valutata all'import del modulo, cioè prima di qualunque login: risolvere il token una volta sola
lascerebbe l'app a mandare `null` per sempre. È vincolato da un test dedicato, perché nessuno degli
altri se ne accorgerebbe — tutti impostano il token prima della prima chiamata.

**7. L'affermazione centrale di questo ADR ha un test.** `single-source.spec.ts` fallisce se un'app
ridichiara `class ApiError`. Né il typecheck né il lint se ne accorgerebbero: le due classi sono
strutturalmente identiche. È l'applicazione diretta della lezione di Fase F — davanti a una riga di
documentazione che afferma un fatto sul codice, la domanda giusta non è «è ancora vera?» ma **«cosa
la renderebbe rossa se smettesse di esserlo?»**.

## Alternatives considered

- **Solo `web-staff` + `web-platform`, i cinque file dichiarati da D-065** — scartata. Avrebbe
  lasciato `toasts.ts` e `useQueryResource.ts` in **due** posti (il package e `web-customer`):
  la divergenza silenziosa non eliminata ma spostata, con l'aggravante di sembrare chiusa. E il
  criterio di appartenenza sarebbe stato «era duplicato fra staff e platform», che descrive lo stato
  del 25 luglio invece di decidere: il prossimo file identico in tre app non avrebbe saputo dove
  andare. È lo stesso modo in cui D-037 era risultata chiusa senza che `web-platform` fosse mai
  nominata (AUD-014).
- **Accorpare anche `apiFetch` di `web-customer`, parametrizzando il refresh** — scartata, ed è il
  vincolo che l'utente aveva posto esplicitamente. Un `createApiFetch({ getToken, refresh?, onAuthFailure?, retryOn401? })`
  avrebbe unificato firme che condividono la forma e non la sostanza: due parametri su quattro
  inutilizzati da due app su tre, e la ricorsione che ADR-0049 documenta (`refresh()` →
  `apiFetch('/customer/refresh')` → 401 → `refresh()`) diventata un caso di configurazione invece
  che una proprietà del canale.
- **Unificare anche `authToken.ts` con un `createTokenStore(key)`** — scartata **per ora**.
  `web-staff` e `web-platform` differiscono per una sola stringa, quindi la fattorizzazione sarebbe
  legittima; ma tocca gli store di sessione di tre app per ~1 KB di codice, cioè il raggio di
  verifica più largo a fronte del guadagno più piccolo. Resta segnalata, non nascosta.
- **Estendere `ui-kit` invece di creare un package** — scartata per la stessa ragione di
  [ADR-0056](0056-package-legale-condiviso.md): `ui-kit` è una libreria di primitive di
  presentazione, e infilarci `fetch`, la politica del 401 e il client TanStack ne snaturerebbe il
  perimetro. Il toast fa eccezione **perché è presentazione**, non nonostante lo sia.
- **Re-export barrel in `apps/*/src/lib/` per non toccare gli import** — scartata: vedi punto 5.

## Consequences

### Positive

- **I test esistenti valgono per tutti.** I 15 di `apiFetch`/`useQueryResource`, che proteggevano
  solo `web-staff`, ora proteggono anche `web-platform`. I 6 di `handleUnauthorized`, che esistevano
  in due copie identiche, ne hanno una sola e vincolano entrambe le app.
- **Copertura netta in aumento nonostante il consolidamento**: **1048 → 1056** test unitari, cioè
  **+14 nuovi** (3 su `ToastHost`, che in tre copie non ne aveva **nessuno**; 4 sul cablaggio del 401
  alle cache — mai coperto in nessuna delle due app; 2 sul presidio della classe unica; 5 su
  `readJsonBody`, `ApiError` sintetico e la rilettura del token) **meno 6 duplicati consolidati**.
- **`ApiError` unica** rende `instanceof` affidabile ovunque, ed è difesa da un test.
- **Il criterio è dichiarato**, quindi la prossima aggiunta sa dove va senza rileggere questo ADR per
  intero: conosce router/store/chiave di sessione → resta nell'app; non li conosce → package.

### Negative / Trade-off

- **Un package in più** nel monorepo, con il suo `tsconfig`/`vitest.config` da mantenere. `typecheck`
  passa da 7 a **8** progetti.
- **Il bundle cresce di poco**, misurato prima/dopo su build reali: `web-customer` 292.8 → 293.5 kB
  (+0.24%), `web-platform` 318.2 → 320.9 kB (+0.85%), `web-staff` 1268.4 → 1272.2 kB (+0.30%). È il
  costo dei confini di modulo: lo stesso codice, distribuito su più moduli di più package, si presta
  meno all'inlining. **Non** è tree-shaking mancato: rimuovere l'unico import di `web-customer` dal
  barrel lascia il bundle a 293.5 kB **identici**, quindi il barrel non trascina nulla.
- **`sideEffects: false` sul package nuovo è vero ma oggi inerte**, e la differenza con `ui-kit` —
  dove lo stesso campo vale 480 KB — è che lì `echarts.ts` ha un effetto al top level che Rollup non
  può dimostrare puro, mentre qui nessun modulo ne ha. Chi aggiungesse un modulo impuro deve
  **elencarlo** invece di lasciare `false`: il sintomo di uno sbaglio è una schermata bianca, non un
  errore di build.
- **`web-customer` è stata toccata**, contro la lettera del vincolo iniziale — ma solo negli
  artefatti che erano byte-identici, e mai nel refresh single-flight. L'unica cosa che quella app ha
  perso è la possibilità di divergere in silenzio su codice che non era suo.
- **Due percorsi d'import per `pushToast`** (barrel per le app, `@coralyn/ui-kit/toasts` per il
  data-layer). È voluto e documentato nella mappa `exports`; il barrel resta la via delle app.

## Rubric check

1. **Professionalità** — la decisione poggia su una misura che ha corretto due volte l'enunciato del
   problema, e su una prova per mutazione che ha mostrato **quanto** la duplicazione fosse scoperta.
   Nessun numero di questo ADR è stimato.
2. **Convenzioni** — struttura, `exports` sul sorgente, peer dependency, `tsconfig` e `vitest.config`
   sono ricalcati da [ADR-0056](0056-package-legale-condiviso.md); il subpath export segue la mappa
   che `ui-kit` già aveva per `./styles/theme.css`.
3. **Modularità** — il package non conosce le app che lo usa: sessione e router entrano come
   interfacce strutturali, il token come thunk. Gli `apps/*/src/lib/http.ts` e `queryClient.ts`
   restano come composition root e dichiarano l'unica cosa che è davvero dell'app.
4. **Zero debito** — la duplicazione è rimossa alla radice e non spostata; l'unica fattorizzazione
   possibile e non fatta (`authToken.ts`) è dichiarata qui sopra invece di restare implicita.
