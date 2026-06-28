# Spec di design — Scheda Cliente (app staff del Core)

- **Data:** 2026-06-28
- **Status:** Bozza per revisione (2026-06-28)
- **Ambito:** `apps/web-staff` + `apps/api` + `packages/contracts` — la vista **Cliente** del [Core operativo](2026-06-27-core-operativo-design.md)

## 1. Obiettivo

Trasformare la vista Clienti da elenco anagrafico minimale (oggi: solo `nome`/`cognome`) a
una **scheda cliente a 360°**: il punto da cui lo staff vede *tutto ciò che riguarda un cliente*
— anagrafica e contatti, abbonamenti e anzianità, storico prenotazioni, pagamenti e saldo.

La scheda è progettata come **visione completa** ma realizzata con **build incrementale**: oggi
si accende solo ciò che il backend può servire (anagrafica + contatti); le sezioni che dipendono
da moduli non ancora costruiti (Prenotazioni, Abbonamenti, Listino, Pagamenti) sono presenti come
**placeholder espliciti "in arrivo"** e si popolano quando quei moduli esisteranno.

## 2. Scope

### In scope (questa spec)
- Design della **scheda cliente** (struttura, sezioni, stati) e della **navigazione** lista → dettaglio.
- **Anagrafica ricca — incremento "ora"**: estensione additiva del modello `Cliente` con
  `telefono`, `email`, `note`; CRUD relativo (crea, leggi lista+dettaglio, modifica) isolato per tenant.
- Decisione di modellazione dei contatti (**ADR-0023**) e postura **privacy/GDPR**.
- Inventario delle sezioni "in arrivo" e del loro stato placeholder.

### Fuori scope (rimandato)
- **Implementazione** (oggetto del piano `writing-plans` + esecuzione in deleghe).
- Contenuto reale delle sezioni **Abbonamento/anzianità**, **Storico prenotazioni**, **Pagamenti/saldo**:
  dipende dai moduli Prenotazioni/Abbonamenti/Listino/Pagamenti (piani successivi).
- **Documento d'identità** del cliente (serve quando ci sarà un contratto d'abbonamento) → deferred.
- **Cancellazione/anonimizzazione** del cliente (GDPR, quando legato a prenotazioni) → deferred.
- **Eliminazione** (DELETE) del cliente: non in questo incremento (solo crea/leggi/modifica).
- Evoluzione del layout a **ibrido (tab)**: nota evolutiva, non si costruisce ora (§5).

## 3. Decisioni di riferimento

| Tema | Rif. |
|---|---|
| Modello dati del Core (entità `Cliente`, relazioni) | [data-model](../design/data-model.md) |
| Glossario di dominio (`Cliente` = il bagnante; non confondere col tenant `Stabilimento`) | [glossary](../architecture/glossary.md) |
| Base path API `/api`, isolamento per header `X-Stabilimento-Id` + RLS | [ADR-0022](../architecture/decisions/0022-base-path-api.md) · [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) |
| Server-state FE (TanStack Query) + UI-state (Pinia) | [ADR-0021](../architecture/decisions/0021-server-state-frontend.md) |
| App-shell, pattern UX, stati, a11y (WCAG AA) | [ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md) · [UI/UX](2026-06-28-frontend-ui-ux-design.md) |
| Lingua (UI in italiano; codice EN, dominio IT) | [ADR-0003](../architecture/decisions/0003-language-convention.md) |
| **Contatti del Cliente: colonne tipizzate vs `json`** | **ADR-0023 (prossimo libero, da redigere — §7)** |
| Validazione input server-side | [D-022](../architecture/deferred.md) |
| Privacy/GDPR: cancellazione/anonimizzazione cliente | **D-024 (da aprire — §8)** |

## 4. Contesto e vincolo (build incrementale)

Stato reale al 2026-06-28:
- Backend implementato: solo `Stabilimento` e `Cliente {id, stabilimentoId, nome, cognome}`
  ([schema.prisma](../../apps/api/prisma/schema.prisma)); `GET/POST /api/clienti` isolati per tenant.
- Modello **target** ([data-model](../design/data-model.md)): `Cliente` prevede già `contatti` ed è
  il nodo di `Prenotazione`, `LISTA_ATTESA` (→ abbonamenti, rinnovi, anzianità). Questi non sono implementati.

Conseguenza: la scheda 360° è **progettabile** ora ma **non implementabile** tutta. Approccio scelto
(confermato con l'utente): **visione completa ora + implementazione incrementale**.

## 5. Struttura della scheda

**Layout adottato: "A — header di sintesi + sezioni a scorrimento".** Tutto su una pagina, niente
navigazione a tab. Scelta motivata: i tab ripagano solo quando una sezione è *densa*, ma oggi le
sezioni dense (storico/pagamenti) sono placeholder vuoti → tab vuoti = complessità senza beneficio
(YAGNI). L'header di sintesi — dove sta il valore immediato — è identico in entrambe le ipotesi.

**Nota evolutiva (non si costruisce ora):** quando lo storico prenotazioni o i pagamenti diventeranno
voluminosi (dopo i rispettivi moduli), si potranno promuovere *quelle singole sezioni dense* a una
sotto-vista/tab — evoluzione **additiva**, non una riscrittura ("ibrido").

Ordine delle sezioni (dall'alto):

1. **Header di sintesi** — `ora`: identità (nome, cognome) + contatti (telefono, email).
   `in arrivo`: stato del giorno (ha un posto oggi? quale ombrellone?), saldo, anzianità.
2. **Anagrafica e contatti** — `ora`. Nome, cognome, telefono, email, note. **Editabile**.
3. **Abbonamento e anzianità** — `in arrivo` (modulo Abbonamenti).
4. **Storico prenotazioni** — `in arrivo` (modulo Prenotazioni).
5. **Pagamenti e saldo** — `in arrivo` (l'incasso vive sulla `Prenotazione`, [data-model](../design/data-model.md)).

Le sezioni `in arrivo` sono rese come blocchi **non interattivi** con etichetta esplicita ("in arrivo"),
così la visione è leggibile senza fingere dati inesistenti.

## 6. Navigazione

- **Lista clienti** (`/clienti`, oggi esistente): resta la lista + creazione. Ogni riga diventa
  **link alla scheda** del cliente.
- **Scheda cliente**: nuova rotta **`/clienti/:id`** → `ClienteDettaglioView`.
- Coerente con l'app-shell a sezioni ([ADR-0019](../architecture/decisions/0019-app-shell-e-ux.md)).

## 7. Modello dati — incremento "ora" (additivo)

### 7.1 Prisma (`apps/api`)
Estensione **additiva e nullable** del model `Cliente` (nessun campo esistente toccato):

```prisma
model Cliente {
  id             String       @id @default(uuid()) @db.Uuid
  stabilimentoId String       @db.Uuid
  nome           String
  cognome        String
  telefono       String?      // nuovo
  email          String?      // nuovo
  note           String?      // nuovo
  stabilimento   Stabilimento @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```
+ una nuova migration additiva (le colonne nullable non rompono i dati esistenti).

### 7.2 Contracts (`packages/contracts`) — solo additivo
- `ClienteDTO` += `telefono?: string; email?: string; note?: string` (non-breaking).
- Nuovi tipi input: `CreaClienteInput = { nome; cognome; telefono?; email?; note? }`;
  `ModificaClienteInput = Partial<CreaClienteInput>`.

### 7.3 Backend (`apps/api`) — endpoint
- `GET /api/clienti` (lista) — endpoint invariato; ritorna il `ClienteDTO` esteso (nuovi campi inclusi).
- `GET /api/clienti/:id` (**nuovo**) — dettaglio; `404` se non appartiene al tenant (RLS).
- `POST /api/clienti` — accetta i nuovi campi opzionali.
- `PATCH /api/clienti/:id` (**nuovo**) — aggiorna l'anagrafica; isolato per tenant.
- **Validazione input** server-side (formato email; telefono normalizzato/trim): questo incremento
  è l'occasione per introdurre la validazione per `Cliente` — si aggancia a [D-022](../architecture/deferred.md).

### 7.4 Decisione di modellazione — ADR-0023
**Contatti come colonne tipizzate (`telefono`, `email`), non come `json contatti`.** Motivazione:
i campi sono pochi e noti → validazione, indici e query pulite; il `json` sarebbe un blob opaco.
È una **divergenza consapevole** dal [data-model](../design/data-model.md) (che indica `contatti json`):
va formalizzata in **ADR-0023** e il data-model va **aggiornato** di conseguenza. `note` è una
colonna `text` separata (annotazione dello staff, non un contatto).

### 7.5 Frontend (`apps/web-staff`)
- Hooks (TanStack Query): `useClienti` (lista, esistente, esteso), `useCliente(id)` (**nuovo**, dettaglio),
  `useCreaCliente` (esteso), `useModificaCliente(id)` (**nuovo**, PATCH; invalida `['clienti']` + `['cliente', id]`).
- Componenti: `ClienteDettaglioView` (scheda), header di sintesi, blocco anagrafica **editabile**,
  blocchi placeholder "in arrivo". Riuso `@driftly/ui-kit` (`Card`, `Field`, `Input`, `Button`, `Badge`).

## 8. Privacy / GDPR

- **Minimizzazione**: si raccoglie solo ciò che serve al servizio (telefono, email, note). **Niente
  documento d'identità** ora (dato più delicato; utile solo col contratto d'abbonamento → deferred).
- **Informativa**: i dati di contatto del bagnante sono dati personali; l'informativa è responsabilità
  del gestore. L'app prevederà il punto di raccolta del consenso/informativa quando emergerà (deferred).
- **Cancellazione/anonimizzazione**: quando il `Cliente` sarà legato a `Prenotazione`/storico, l'hard-delete
  non sarà ammissibile → soft-delete/anonimizzazione. Tracciato come **D-024**. In questo incremento non
  si implementa DELETE.

## 9. Stati UI

- **Loading**: skeleton su header e blocco anagrafica.
- **Empty**: lista vuota → invito a creare il primo cliente; campi anagrafica vuoti → placeholder neutro (es. "—").
- **Error**: `apiFetch` lancia su `!res.ok` → messaggio d'errore non bloccante; retry possibile.
- **In arrivo**: sezioni rese non interattive con etichetta "in arrivo"; nessuna chiamata di rete per esse.

## 10. Testing

- **Frontend** (Vitest + MSW, in `apps/web-staff`): component test per `ClienteDettaglioView`
  (render header + anagrafica), form crea/modifica (validazione, stati loading/empty/error),
  presenza dei placeholder "in arrivo". Mock `/api/clienti`, `/api/clienti/:id` in `mocks/server.ts`.
- **Backend** (e2e, in `apps/api`): nuovi campi su POST, `GET /:id`, `PATCH /:id`, validazione input,
  **isolamento tenant** (tenant diverso → 404; senza header → 400) coerente con [ADR-0022](../architecture/decisions/0022-base-path-api.md).

## 11. Scope di implementazione & sequenza (confini)

⚠️ Questa feature **eccede la delega FE del proxy** (chiusa): tocca `apps/api` + `packages/contracts`
+ `apps/web-staff`. Va eseguita in **deleghe separate**, con `packages/contracts` come confine.

**Incremento 1 — "Anagrafica ricca end-to-end"** (l'unico implementabile ora):
1. **Backend + contracts** (delega BE): `contracts` additivo → Prisma + migration → `GET /:id`,
   `POST` esteso, `PATCH /:id` → validazione → e2e → **ADR-0023** + aggiornamento data-model + **D-024**.
2. **Frontend** (delega FE): rotta `/clienti/:id` → scheda (header + anagrafica editabile + placeholder
   "in arrivo") → hooks → stati → component test.

Incrementi successivi (gated dai moduli): Abbonamento/anzianità, Storico prenotazioni, Pagamenti/saldo —
ognuno accende la propria sezione quando il modulo sottostante esiste.

## 12. Definition of Done (Incremento 1)

- `Cliente` con `telefono`/`email`/`note` creabile, leggibile (lista + dettaglio), modificabile, **isolato per tenant**.
- Scheda `/clienti/:id` mostra header di sintesi + anagrafica editabile + sezioni "in arrivo" come placeholder.
- Test BE (e2e) e FE (component) verdi; `lint` e `typecheck` puliti.
- **ADR-0023** redatto; [data-model](../design/data-model.md) aggiornato; **D-024** (privacy) tracciato in [deferred](../architecture/deferred.md).
- `MEMORY.md` aggiornato se cambia lo stato di progetto.

## 13. Questioni aperte / evolutive

- **Evoluzione a ibrido (tab)** per le sezioni dense — quando esisteranno dati voluminosi (§5).
- **Validazione input completa** (oltre `Cliente`) — [D-022](../architecture/deferred.md).
- **Documento d'identità** del cliente — quando servirà per i contratti d'abbonamento (deferred).
- Le sezioni "in arrivo" definiscono un **handshake** verso i moduli futuri: i loro DTO (es. riepilogo
  abbonamento, riga storico, saldo) andranno aggiunti a `contracts` quando quei moduli verranno progettati.
