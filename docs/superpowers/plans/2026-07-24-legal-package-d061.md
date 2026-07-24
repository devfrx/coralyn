# Piano — package `@coralyn/legal` e pubblicazione policy/imprint (D-061, 5.6b)

**Data:** 2026-07-24 · **Branch:** `feat/legal-d061-d062` · **ADR:** 0056 (da scrivere, task 5)

## Perché un package e non testo duplicato

Decisione dell'utente: *«la soluzione più professionale, più coerente e senza debiti e meno pigra»*.
Policy operatori e imprint servono a **due** app (`web-staff` e `web-platform`) con **contenuto
identico**: Coralyn è titolare in entrambe, i dati societari sono gli stessi. Duplicare il testo
significa che una divergenza tra le due pagine diventa possibile — ed è un rilievo classico in sede
di verifica, oltre che il difetto che i documenti in `docs/legal/` denunciano esplicitamente.

[ADR-0055](../../architecture/decisions/0055-informativa-art13-multi-tenant.md) aveva **rimandato**
l'estrazione a package *«quando il testo condiviso avrà senso tra due app»*: quel momento è ora.

**Non tocca `web-customer`.** Lì il titolare è il lido, il testo è parametrizzato per tenant e il
piano è un altro (A). Accorpare i due testi nello stesso package ricreerebbe la confusione dei piani
che ADR-0055 esiste per impedire.

## Vincoli noti (dai gotcha del repo)

- **Non registrare una rotta il cui componente non esiste ancora** → il package si crea **prima** del
  wiring nelle app, o `vue-tsc` va rosso.
- **Tailwind v4 non scansiona i package per default** → serve `@source "../../../../packages/legal/src"`
  in `main.css` di **entrambe** le app, come già fatto per `ui-kit`.
- **`corepack pnpm install` può cancellare il client Prisma** → `prisma generate` prima di `pnpm -r typecheck`.
- **Suite una alla volta.**
- **Niente em dash nel testo utente.** Il corpo dei documenti è già stato scritto senza.
- Il testo sorgente è quello **già passato da due review + re-review**: va portato **fedelmente**, non
  riscritto. Ogni divergenza rispetto a `docs/legal/*.md` è un difetto.

## Task

### T1 — Scaffold del package

`packages/legal/`: `package.json` (`@coralyn/legal`, `type: module`, `exports: { ".": "./src/index.ts" }`,
peerDep `vue`), `tsconfig.json` e `vitest.config.ts` **speculari a `ui-kit`** (lib DOM, jsdom).
Nessuna dipendenza runtime: è testo + componenti di presentazione.

### T2 — Contenuti come dati versionati

- `src/privacy.content.ts` — `PRIVACY_OPERATORI_VERSION`, `_UPDATED`, `PRIVACY_OPERATORI_SECTIONS`.
  Riusa la forma `LegalSection { id, heading, paragraphs[], legalReview? }` di
  `informativa.content.ts` (stessa convenzione, nessun terzo stile).
- `src/imprint.content.ts` — `IMPRINT_FIELDS`, con etichetta, valore e riferimento normativo.
- I `[COMPILARE]` restano **letterali nel testo**: sono contenuto voluto, non debito. Nessun dato
  societario inventato.

### T3 — Componenti di presentazione

- `src/LegalDocument.vue` — renderer condiviso: titolo, versione/data, sezioni, disclaimer finale.
- `src/PrivacyPolicyView.vue`, `src/ImprintView.vue` — pagine, in cima al package.
- `src/index.ts` — barrel.
- Stile allineato a `PrivacyView.vue` di `web-customer` (stesse classi/token), così le tre pagine
  legali del prodotto si somigliano.

### T4 — Wiring nelle due app

Per `web-staff` **e** `web-platform`:
- rotte `/privacy` e `/note-legali`, entrambe `meta: { public: true, bare: true }` — **devono essere
  raggiungibili da sloggati**: l'imprint richiede accessibilità «diretta e permanente» (art. 7 D.Lgs.
  70/2003) e l'informativa va resa a chi non ha ancora un account (art. 14.3.a);
- `@source` in `main.css`;
- link nel piè di pagina della schermata di login (il punto di contatto comune a entrambe).

### T5 — ADR-0056 + aggiornamento deferred

ADR-0056 ratifica: package condiviso invece di duplicazione; perimetro (non include `web-customer`);
rotte pubbliche e perché. Aggiornare `docs/legal/README.md` (punto 5 di «Cosa manca» → fatto) e
`deferred.md` D-061.

### T6 — Verifica

`prisma generate` → suite una alla volta (`ui-kit`, `web-staff`, `web-platform`, `web-customer`) →
`pnpm -r typecheck`. Baseline attesa di partenza: 190 / 608 / 18 / 29, typecheck exit 0.

## Cosa questo NON chiude

⚖️-18 resta **parzialmente** aperto: le pagine esisteranno, ma l'email di invito continuerà a non
rinviare all'informativa. Il rinvio nel template è un cambio all'API (`credential-setup.email.ts`),
fuori dallo scope di questo piano: va deciso a parte.

I `[COMPILARE]` sui dati societari e sull'hosting **restano tutti**: dipendono da decisioni
dell'utente, non da questo lavoro.
