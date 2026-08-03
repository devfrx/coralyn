# Icona della tipologia ombrellone: dal registro chiuso al catalogo Lucide intero

**Data:** 2026-08-03 · **Stato:** design approvato, non ancora implementato · **ADR previsto:** 0068

## 1. Il problema

Chi crea una tipologia di ombrellone può scegliere fra **tre** icone: `umbrella`, `leaf`,
`palmtree`. Il nome è già libero. L'obiettivo è rendere l'icona altrettanto libera — **tutte** le
icone della libreria già in uso, disponibili e ricercabili — e farlo come funzione integrante del
software, non come controllo appoggiato sopra al pannello.

Il vincolo a tre valori non sta nel database. Sta in tre punti applicativi:

| Dove | Cosa | Effetto |
|---|---|---|
| [`create-umbrella-type.dto.ts`](../../../apps/api/src/establishment/dto/create-umbrella-type.dto.ts) | `ICON_KEYS` + `@IsIn` | l'API rifiuta ogni altro nome con 400 |
| [`update-umbrella-type.dto.ts`](../../../apps/api/src/establishment/dto/update-umbrella-type.dto.ts) | `ICON_KEYS` + `@IsIn`, identici | idem, duplicati |
| [`BeachPanel.vue`](../../../apps/web-staff/src/features/establishment/panels/BeachPanel.vue) | tre `<Option>` e il tipo del `ref` | l'operatore ne vede tre |

E sotto a tutti c'è il muro vero: [`icons/registry.ts`](../../../packages/ui-kit/src/icons/registry.ts)
importa **42** icone a mano, staticamente, e [`Icon.vue`](../../../packages/ui-kit/src/components/Icon.vue)
risolve con `icons[name] ?? icons[FALLBACK_ICON]`. Anche togliendo i tre `@IsIn`, un `anchor` salvato
nel database verrebbe reso **come un ombrellone, in silenzio**. `unplugin-icons` risolve
`~icons/lucide/<nome>` a **build time**: non esiste un import con nome dinamico.

## 2. Cosa esiste già — misurato in sessione, non assunto

- **La libreria giusta è già installata.** `@iconify-json/lucide@1.2.114`, presente sia in
  `packages/ui-kit` sia in `apps/web-staff`. **Nessuna nuova dipendenza al repo.**
- **Licenza ISC**, letta da `info.json` del pacchetto: `"license": { "title": "ISC", "spdx": "ISC" }`,
  autore «Lucide Contributors». Permissiva come MIT: uso commerciale e rivendita del gestionale
  liberi, nessuna royalty, nessuna attribuzione richiesta nell'interfaccia. L'avviso di copyright
  viaggia già dentro il pacchetto npm.
- **1803 icone + 216 alias.** Tutte `24×24` tranne una; tutte usano `currentColor`, quindi ereditano
  il tema senza alcuna conversione.
- **`palmtree` non è un nome Lucide: è un alias di `tree-palm`** — e lo è in Lucide stesso. Il
  registry del repo infatti importa `~icons/lucide/tree-palm` e lo espone come `palmtree`.
- **Il database è già libero.** `UmbrellaType.icon` è `String?` in
  [`schema.prisma`](../../../apps/api/prisma/schema.prisma). **Nessuna migration, in nessuna delle
  due direzioni.**
- **Il nome è già libero.** `@IsNotEmpty @MaxLength(60)`, nessun elenco chiuso.

### 2.1 I pesi che hanno deciso il disegno

Misurati con gzip vero su payload veri, non stimati:

| Payload | raw | gzip | brotli |
|---|---|---|---|
| Catalogo completo, solo i `body` SVG (1803 icone) | 502,9 KB | **78,2 KB** | 63,5 KB |
| Solo l'elenco dei nomi (per la ricerca) | 24,9 KB | 7,2 KB | 6,4 KB |

Contro il JS attuale delle tre app (dist del 2026-07-29, indicativo):

| App | JS gzip oggi | col catalogo | delta | rende icone di dominio? |
|---|---|---|---|---|
| `web-staff` | 400,7 KB | 478,9 KB | **+20%** | **sì** |
| `web-platform` | 98,1 KB | 176,3 KB | +80% | **no** |
| `web-customer` | 89,2 KB | 167,4 KB | +88% | **no** |

L'ultima colonna è il fatto che scioglie il conflitto, ed è stata verificata con una ricerca
**validata**: `umbrellaTypes\|typeIcon\|\.icon` sui `.vue`/`.ts` di `apps/*/src`, esclusi spec e
mocks, trova 8 righe in `web-staff` (caso noto presente) e **zero** nelle altre due.
`web-customer` usa `Icon` una sola volta, per `logout`. ⚠️ **Perimetro della ricerca:** fuori dai
`.vue`/`.ts` sotto `apps/*/src`, o per un nome costruito per concatenazione, resta cieca.

## 3. Decisioni prese con l'utente

| # | Decisione | Perché |
|---|---|---|
| 1 | **Il catalogo sta nel bundle, non in un chunk lazy** | scelta dell'utente, presa conoscendo il +20% su `web-staff`. Costa peso e compra semplicità: nessun `import()` dinamico, nessuna attesa, nessun stato di caricamento da rendere |
| 2 | **Ma solo nel bundle di `web-staff`** | le altre due app non rendono icone di dominio: farglielo pagare sarebbe peso puro |
| 3 | **Perimetro: sottosistema del ui-kit con un solo consumatore oggi** | dare un'icona anche a Settore e Fila richiederebbe due colonne e due migration per un bisogno non espresso |
| 4 | **Il picker suggerisce in cima, cerca su tutte** | Lucide contiene `bitcoin` e `syringe`: nessuna icona è preclusa, cambia solo cosa si vede per primo |
| 5 | **Nessuna migration dei dati esistenti** | gli alias fanno risolvere `palmtree` da soli. Normalizzare a `tree-palm` significherebbe migrare dev **e** test per un problema che non esiste |
| 6 | **L'API valida contro l'elenco Lucide vero** | senza, un client scrive spazzatura nel database e la Mappa mostra il fallback per sempre senza che nessuno se ne accorga |
| 7 | **Il nome non si tocca** | è già libero: costruirlo sarebbe lavoro finto |

## 4. Architettura

### 4.1 Nel ui-kit

`icons/registry.ts` **resta invariato**: le 42 icone del chrome, import statici, tree-shakeable. È il
confine offline che il suo commento dichiara, e continua a valere per menu, bottoni e stati.

`icons/catalog.ts` — **nuovo**. Espone il tipo del catalogo e le funzioni pure che lo interrogano:
risoluzione di un nome (icone **e** alias) e ricerca per sottostringa. Non importa nulla di Lucide:
riceve i dati.

`icons/lucide-catalog.ts` — **nuovo**. È l'unico file che importa `@iconify-json/lucide`, e sta
dietro un **entry point separato** del package, `@coralyn/ui-kit/icons/lucide`, esattamente come il
repo fa già per `./toasts`. Un entry separato è più forte del solo tree-shaking: chi non lo importa
non può trascinarlo per sbaglio dal barrel.

`icons/registered-catalog.ts` — **nuovo**. Lo stato di registrazione: parte vuoto,
`registerIconCatalog(c)` lo riempie. È l'inversione che permette alla decisione 1 e alla 2 di
convivere.

`Icon.vue` — la riga `icons[name] ?? icons[FALLBACK_ICON]` diventa una catena dichiarata:

1. registry statico del chrome
2. catalogo registrato, se c'è
3. alias del catalogo
4. **fallback visibile**

Il punto 4 è un cambiamento di comportamento, non un dettaglio: oggi un nome sconosciuto **diventa un
ombrellone**, indistinguibile da un ombrellone voluto. Diventerà un segno riconoscibile come «icona
ignota». Un difetto che si traveste da dato corretto è la classe che questo repo caccia da undici
sessioni.

`IconPicker.vue` — **nuovo**, nel ui-kit perché è un primitivo e non una vista. Campo di ricerca +
griglia; all'apertura mostra il gruppo suggerito, la ricerca interroga tutte e 1803. Rende **un tetto
di risultati per volta**: 1803 nodi DOM insieme non si fanno, e una libreria di virtualizzazione
sarebbe una dipendenza per un problema che un limite risolve.

L'elenco delle icone suggerite vive in **un solo posto** — se tornasse in due, tornerebbe la
duplicazione che [D-040](../../architecture/deferred.md#d-040) traccia.

### 4.2 In web-staff

`main.ts` chiama `registerIconCatalog(lucideCatalog)` una volta, importando dall'entry separato.
Sincrono, presente dal primo byte: la decisione 1 come l'utente l'ha chiesta.

`BeachPanel.vue` sostituisce la `Select` a tre `<Option>` con l'`IconPicker`. Il `ref` tipizzato
`'umbrella' \| 'leaf' \| 'palmtree'` diventa una `string`.

### 4.3 Nell'API

`ICON_KEYS` e `@IsIn` spariscono da **entrambi** i DTO, sostituiti da `@IsIconKey()` — un decoratore
custom sul modello di [`is-uuid-shape.ts`](../../../apps/api/src/common/is-uuid-shape.ts), che il
repo già usa e la cui forma (`registerDecorator` con un `validator`) è la convenzione locale.

⚠️ **Decisione strutturale:** `@iconify-json/lucide` va aggiunto alle dipendenze di `apps/api`, che
oggi non ce l'ha. È già nel repo, ma è nuova **per quel pacchetto**.

### 4.4 Nei contracts

`icon` resta `string`. Una union TypeScript di 1803 valori sarebbe ingestibile e non aggiungerebbe
sicurezza reale, visto che il valore arriva comunque da HTTP e va validato a runtime. I commenti che
dicono «icon-registry key» vanno aggiornati: la chiave non viene più da un registro di 42 voci.

## 5. Sicurezza del rendering

Il `body` di un'icona è markup SVG e va inserito come tale. Va dichiarato nell'ADR, non lasciato a un
commento, perché una review avversariale lo solleverebbe:

- il `body` proviene da un **file statico versionato** dentro il bundle — mai dalla rete, mai
  dall'utente, mai dal database;
- il **nome** sì viene dal database, ma è solo una **chiave di lookup**: non finisce mai nell'HTML, e
  un nome che non risolve produce il fallback, non un'iniezione;
- l'API valida il nome contro l'elenco vero (decisione 6), quindi la chiave è vincolata già a monte.

## 6. Cosa NON si fa

- Nessuna icona per Settore e Fila (decisione 3).
- Nessuna migration, né di schema né di dati (decisione 5).
- Nessun caricamento remoto di icone: il confine offline resta.
- Nessuna libreria di virtualizzazione, nessun pacchetto di metadati per le categorie.
- Nessuna modifica al nome della tipologia (decisione 7).
- **`SECTOR_KINDS` non si tocca.** È l'altra metà di D-040 — vedi §8.

## 7. Test

**ui-kit** — il catalogo risolve un nome vero, un alias (`palmtree` → `tree-palm`) e restituisce
niente per un nome inventato; la ricerca trova per sottostringa; `Icon` rende dal registry quando il
catalogo non è registrato, dal catalogo quando lo è, e il **fallback visibile** per un nome ignoto;
l'`IconPicker` filtra, rispetta il tetto di risultati, emette il nome scelto.

**api** — i due DTO accettano un nome Lucide vero, accettano `palmtree`, **rifiutano con 400** un
nome inventato. Il presidio va scritto su **entrambi**: erano duplicati, e una correzione su uno solo
è il difetto che si ripresenta.

**web-staff** — `BeachPanel` apre il picker, la scelta arriva alla mutation, il valore torna nella
form in modifica.

⚠️ **Fixture.** Le fixture che costruiscono `UmbrellaTypeDTO` con `icon: 'palmtree'` restano valide —
`palmtree` continua a risolvere. Ma vanno **cercate tutte** prima di dirlo: `structure.fixtures.ts`,
`form-sync.spec.ts`, `RowPanel.focus.spec.ts`, i mock MSW e i seed ne portano una ciascuno. Una
fixture invecchia insieme al tipo che istanzia.

⚠️ **Il presidio statico del CSS e le 27 asserzioni che indicizzano `[data-testid="scene-cell"] button`
per posizione non sono toccate:** il picker vive nel pannello, non nella scena.

## 8. Effetto su D-040

[D-040](../../architecture/deferred.md#d-040) traccia **due** duplicazioni:

1. la lista chiavi icona in quattro punti — i due `ICON_KEYS` e i due in `BeachPanel.vue`;
2. `SECTOR_KINDS` (`grid\|special`) nei due DTO settore più la Select.

Questo lavoro elimina la **prima**, e non per allargamento: i quattro punti spariscono, non crescono.
Non tocca la seconda. La voce va aggiornata dicendo **esattamente questo**, e **non** va marcata
conclusa: dichiarare conclusa a metà una voce è la classe di bugia documentale che questo repo ha già
pagato due volte.

## 9. Rischi e limiti dichiarati

- **Peso.** +78,2 KB gzip su `web-staff`, accettato consapevolmente (decisione 1). Se un domani il
  bundle diventasse un problema, la via d'uscita è nota e non richiede riscrivere nulla: lo stesso
  entry separato può essere importato con `import()` invece che staticamente.
- **Il gruppo suggerito è una scelta di gusto**, non una regola di dominio: va tenuto in un solo
  posto e non moltiplicato.
- **La ricerca è per sottostringa sul nome Lucide**, che è in inglese: cercare «palma» non troverà
  `tree-palm`. Un dizionario italiano→inglese sarebbe un secondo elenco da mantenere allineato a
  1803 voci, cioè la duplicazione da cui questo lavoro esce. Limite accettato e dichiarato.
- **Il fallback visibile cambia una resa esistente**: una tipologia con un `icon` oggi non risolvibile
  smetterebbe di sembrare un ombrellone. È l'intento, ma va verificato che nel database di sviluppo
  non ci siano righe in quello stato prima di dire che nessuno se ne accorgerà.
