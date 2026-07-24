# ADR-0056: Package legale condiviso `@coralyn/legal` per i testi rivolti agli operatori

- **Status:** Accepted
- **Data:** 2026-07-24
- **ADR correlati:** [0008](0008-stack-e-layout.md), [0009](0009-documentazione-di-design.md), [0041](0041-app-frontend-dedicata-platform.md), [0055](0055-informativa-art13-multi-tenant.md)
- **Piano:** [2026-07-24-legal-package-d061.md](../../superpowers/plans/2026-07-24-legal-package-d061.md)
- **Deferred:** [D-061](../deferred.md)
- **Documenti sorgente:** [`docs/legal/`](../../legal/README.md)

> ⚠️ Design conforme allo stato dell'arte redatto da ingegneri — non è consulenza legale. I testi
> pubblicati restano bozze da validare con un professionista (18 punti ⚖️ in `docs/legal/README.md`).

## Context

[ADR-0055](0055-informativa-art13-multi-tenant.md) ha separato tre piani GDPR e ne ha realizzato uno
solo, il piano A (informativa al bagnante, titolare = il lido, in `web-customer`). Il **piano B** —
informativa agli **operatori**, dove il titolare è **Coralyn** — è rimasto deferito come
[D-061](../deferred.md), insieme alle informazioni obbligatorie del prestatore (imprint) ex art. 7
D.Lgs. 70/2003.

Il piano B ha una proprietà che il piano A non ha: **il contenuto è identico per due app**. Sia
`web-staff` sia `web-platform` sono usate da operatori verso cui il titolare è sempre Coralyn, con
gli stessi dati societari, le stesse finalità e le stesse misure. Nel piano A il testo è invece
parametrizzato per tenant, ed è per questo che vive dentro `web-customer`.

ADR-0055 aveva **esplicitamente rimandato** l'estrazione a package condiviso, motivandola così: con
un solo consumatore reale l'astrazione è prematura, si rivaluta *«quando gli operatori avranno la
loro informativa e il testo condiviso avrà senso tra due app»*. Quel momento è ora.

C'è un vincolo che rende la scelta più stringente del solito riuso: **una divergenza tra la privacy
policy di `web-staff` e quella di `web-platform` non è un difetto estetico, è un rilievo di
compliance**. Due documenti che dichiarano cose diverse sullo stesso titolare sono esattamente ciò
che un revisore cerca, e sono la ragione per cui i documenti in `docs/legal/` centralizzano i dati
societari in una tabella unica.

## Decision

**1. Nuovo package `packages/legal` (`@coralyn/legal`), consumato da `web-staff` e `web-platform`.**
Contiene i contenuti come dati versionati (`privacy.content.ts`, `imprint.content.ts`) e i componenti
di presentazione (`PrivacyPolicyView`, `ImprintView`, `LegalDocument`). Nessuna dipendenza runtime:
è testo più presentazione. Struttura speculare a `ui-kit` (`type: module`, `exports` sul sorgente,
`vue` come peer dependency), coerente con [ADR-0008](0008-stack-e-layout.md).

**2. Il package copre SOLO il piano B.** L'informativa al bagnante **non** ci entra, e non è una
dimenticanza: accorpare i due testi ricreerebbe nello stesso artefatto la confusione dei piani che
[ADR-0055](0055-informativa-art13-multi-tenant.md) esiste per impedire. Il criterio di appartenenza
al package è **«titolare = Coralyn»**, non «documento legale».

**3. Le rotte legali sono PUBBLICHE** (`meta: { public: true, bare: true }`), in entrambe le app, a
**`/legale/informativa`** e **`/legale/note`**. Non è una comodità, discende da due obblighi:
- l'imprint va reso accessibile **«in modo diretto e permanente»** (art. 7 D.Lgs. 70/2003), quindi
  non può stare dietro un login;
- l'informativa va resa a chi **non ha ancora un account** (art. 14.3(a) GDPR: i dati dell'operatore
  arrivano dal suo datore di lavoro, non da lui).

Un test per app (`legal-routes.spec.ts`) vincola questa proprietà: il routing è l'unico punto in cui
le due app possono ancora divergere, quindi va bloccato in entrambe.

**3-bis. Il path `/privacy` è RISERVATO all'informativa del bagnante e non esiste in `web-staff` né
in `web-platform`.** Questa è una correzione a caldo della prima stesura di questo ADR, che aveva
messo la policy operatori proprio su `/privacy`: la scelta ha prodotto un difetto reale, osservato in
uso. Tre app avevano lo stesso path con due significati opposti, e il deep-link operatore verso
l'anteprima del bagnante ripiegava, in assenza di `VITE_WEB_CUSTOMER_URL`, su un **percorso relativo**
(`/privacy?e=<id>`) che restava sull'origin di `web-staff`. Risultato: l'operatore cliccava «apri
anteprima» convinto di vedere ciò che legge il suo cliente, e vedeva la policy che riguarda sé stesso,
con `?e=` ignorato e **nessun segnale d'errore**. Prima dell'introduzione della rotta quel link
relativo non risolveva a nulla, quindi falliva in modo visibile: la rotta ha trasformato un errore
rumoroso in uno silenzioso.

Rimedi, tutti e tre necessari perché nessuno da solo chiude il buco:
- **path distinti** (`/legale/*` per gli operatori): rende la collisione strutturalmente impossibile,
  e due test per app vietano la ricomparsa di `/privacy`;
- **niente fallback relativo**: `privacyPreviewUrl` restituisce stringa vuota senza
  `VITE_WEB_CUSTOMER_URL`, e il promemoria resta come **testo senza link**. L'informativa del bagnante
  vive su un'altra app: senza il suo origin non è linkabile, e fingere il contrario è peggio che non
  offrire il link;
- **`strictPort`** nei tre `vite.config.ts`: senza, Vite scivolava sulla prima porta libera dalla
  5173 in poi, quindi era l'ordine di avvio a decidere quale app stesse dove, e nessun valore fisso
  di `VITE_WEB_CUSTOMER_URL` poteva essere corretto in sviluppo.

**3-ter. I due documenti si raggiungono da punti diversi, perché servono a cose diverse.** La policy
operatori è una **tutela personale** di chi usa il gestionale: sta nel piè di pagina del login. L'
informativa al bagnante è uno **strumento di lavoro**: sta nel promemoria del flusso Clienti, e punta
sempre fuori, all'app clienti. Averle messe entrambe a portata dello stesso punto è ciò che ha reso
la confusione possibile.

**4. I `[COMPILARE]` restano letterali nel testo pubblicato.** Come nel piano A: un lido — qui,
Coralyn — che non ha ancora dati societari produce un documento con segnaposto **visibili**, non un
testo generico che finge completezza. È contenuto voluto, non debito.

**5. Il testo nel package è un porting fedele di `docs/legal/`, non una seconda stesura.** I documenti
in `docs/legal/` sono passati da due review indipendenti più una re-review; il package ne è la resa
per il prodotto. Ogni divergenza tra i due è un difetto, e i due vanno aggiornati insieme.

## Alternatives considered

- **Testo duplicato in ciascuna app** (lo stesso pattern del piano A) — scartata. È il pattern
  esistente, quindi difendibile per coerenza, ma qui il contenuto è *identico* e non parametrizzato:
  la duplicazione non comprerebbe nulla e venderebbe la possibilità di una divergenza silenziosa tra
  due documenti legali. Nel piano A la duplicazione non si pone, perché il testo è uno solo.
- **Pubblicare solo in `web-staff`** — scartata. `web-platform` è usata oggi da un solo operatore
  (il distributore), quindi sarebbe stato YAGNI difendibile; ma l'obbligo informativo non dipende dal
  numero di destinatari, e la voce sarebbe rimasta un gap noto da ricordarsi. Il costo marginale di
  registrare due rotte in più era trascurabile.
- **Estendere `ui-kit` invece di creare un package** — scartata. `ui-kit` è una libreria di
  primitive di presentazione senza contenuto di dominio; infilarci dentro dei testi legali versionati
  ne snaturerebbe il perimetro e legherebbe l'aggiornamento di una policy al rilascio del design
  system.
- **Servire i testi dall'API** (come per il piano A, dove il titolare è un dato) — scartata: qui non
  c'è nulla di parametrico, quindi servirebbe una rotta e una query per restituire una costante.
  Coerente con [ADR-0055](0055-informativa-art13-multi-tenant.md) punto 4: il testo è codice, il DB
  porta solo i dati che variano.

## Consequences

### Positive

- **La divergenza tra le due app diventa impossibile**, non solo sconsigliata: c'è una sola fonte.
- **Perimetro esplicito**: il criterio «titolare = Coralyn» dice senza ambiguità cosa entra nel
  package e cosa no, e mantiene visibile la separazione dei piani di ADR-0055.
- **Le rotte pubbliche chiudono ⚖️-18** insieme al rinvio aggiunto nel template email: l'informativa
  esiste a un indirizzo raggiungibile **ed** è resa all'interessato al primo contatto (art. 14.3.a).
- Additivo: nessuna modifica allo schema né ai contratti. L'unico tocco al backend è una riga nel
  template email, senza nuove variabili d'ambiente.

### Negative / Trade-off

- **Un package in più** nel monorepo, con il suo `tsconfig`/`vitest.config` da mantenere.
- **Tailwind v4 non scansiona i package per default**: serve `@source` in `main.css` di ogni app
  consumatrice. È un passo facile da dimenticare aggiungendo una terza app, e il sintomo (pagina
  senza stili) non è immediato da diagnosticare. Già presente per `ui-kit`, quindi il pattern è noto.
- **Due documenti privacy convivono nel prodotto**, per interessati diversi. La confusione è un
  rischio permanente, non un incidente: è già costata un difetto (punto 3-bis). I presidi sono i path
  distinti, i test che li vincolano, e la versione visibile in testa a ogni documento (l'informativa
  al bagnante è 1.x, quella operatori 0.x). Chi aggiunge una terza superficie legale deve chiedersi
  **prima** a quale piano appartiene.
- ~~**⚖️-18 resta parzialmente aperto**~~ — **chiuso nella stessa slice** (2026-07-24): il template
  email rinvia all'informativa in testo e HTML, per invito e reset, sulla stessa origin del link di
  set-password. Le rotte pubbliche erano il presupposto; il rinvio le rende il veicolo
  dell'adempimento dell'art. 14.3(a).
- **Il doppio artefatto va tenuto allineato**: `docs/legal/*.md` (per il legale) e
  `packages/legal/src/*.content.ts` (per il prodotto). È il prezzo di avere documenti rivedibili da
  un professionista *e* pagine servite dall'app; mitigato dalla nota in testa a ogni file di
  contenuto.

## Rubric check

1. **Professionalità** — un package condiviso per un testo identico a due consumatori è la soluzione
   corretta, non over-engineering: l'alternativa vende un rischio di compliance reale per risparmiare
   un `package.json`. Le rotte pubbliche derivano da obblighi normativi puntuali, non da preferenza.
2. **Convenzioni** — struttura, `exports`, peer dependency, `tsconfig` e `vitest.config` sono
   ricalcati da `ui-kit`; le rotte usano il `meta: { public, bare }` già in uso per login e
   set-password; lo stile dei componenti riusa i token e la larghezza di colonna di `PrivacyView`.
3. **Modularità** — il package non dipende da nulla del prodotto e non conosce le app che lo usano;
   il criterio di appartenenza è dichiarato. Le app aggiungono due rotte e una riga di `@source`.
4. **Zero debito** — la decisione rimandata da ADR-0055 è ora **presa e ratificata**, non lasciata
   implicita nel codice. Ciò che resta aperto (il rinvio nell'email, i dati societari, i punti ⚖️) è
   tracciato in [D-061](../deferred.md) e in [`docs/legal/README.md`](../../legal/README.md), non
   silenzioso.
