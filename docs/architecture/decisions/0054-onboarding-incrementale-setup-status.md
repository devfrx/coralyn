# ADR-0054: Onboarding incrementale con completezza misurata server-side

- **Status:** Accepted
- **Data:** 2026-07-23
- **ADR correlati:** [ADR-0053](0053-ritiro-ombrellone-soft-delete.md) (guardie 409 e ritiro
  non-distruttivo, il vincolo che rende impraticabile un reset in onboarding), [ADR-0040](0040-lettura-aggregata-cross-tenant.md)
  (proiezione PII-free già in uso per la Platform Console, stesso principio applicato a
  `setupComplete`), [ADR-0032](0032-pricing-engine-precedenza.md) (tariffa catch-all wildcard, il
  criterio dietro `rates.complete`)
- **Spec:** [2026-07-23-onboarding-prima-configurazione-design.md](../../superpowers/specs/2026-07-23-onboarding-prima-configurazione-design.md)

## Context

Un lido appena provisionato (ADR-0028: fornitore + inviti) parte vuoto. Perché possa incassare la
prima prenotazione serve una catena di prerequisiti **sparsa su quattro rotte** (`/establishment`,
`/establishment/structure`, `/pricing`, opzionalmente `/rentals/catalogo`): Settore → Fila →
Ombrellone, almeno una Fascia oraria, una Stagione che copre la data, una Tariffa applicabile. Oggi
questa catena è nota solo a chi conosce il dominio: ogni anello mancante si manifesta **a valle**,
come 422 al momento della prenotazione (`UMBRELLA_NOT_FOUND` / `NO_SEASON` / `NO_RATE`,
`bookings.service.ts::throwPriceError`). Non esiste alcun flusso guidato né una nozione
interrogabile di «configurazione completa».

Il flusso deve essere **atomico per passo** (ogni scrittura commit-a tutto o niente) e
**riavviabile** (un operatore può uscire ed entrare a metà catena e riprendere da dove aveva
lasciato). Deve inoltre funzionare anche sul **rilancio di un lido già operativo** — un secondo
anno, una stagione da riaprire, una struttura parzialmente reimpostata — non solo alla prima messa
in servizio. Su questo punto il dominio pone un vincolo netto: [ADR-0053](0053-ritiro-ombrellone-soft-delete.md)
ha reso esplicito che un ombrellone con storico non è azzerabile (guardia 409, nessuna eliminazione
distruttiva), e più in generale il repo non promette mai reset di dati operativi. Qualunque
soluzione deve convivere con questo, non aggirarlo.

## Decision

**Onboarding incrementale con ripresa**, spina dorsale server-side. Il wizard `/onboarding` in
`web-staff` è un **orchestratore** delle mutation per-entità già esistenti (create settore/fila,
generatore ombrelloni, fasce, stagioni, tariffe) — zero write-path nuovo. L'atomicità è una
proprietà di ciascun passo, non dell'intera catena. La **completezza è misurata dal server**, non
dedotta dal client: un nuovo endpoint admin-only `GET /establishment/setup-status` espone
`SetupStatusDTO`, prodotto da una **projection pura** `computeSetupStatus`
(`apps/api/src/establishment/setup-status.projection.ts`) a partire da count tenant-scoped
calcolati da `SetupStatusService` (`apps/api/src/establishment/setup-status.service.ts`). La
projection misura **la stessa semantica** che oggi genera i 422 a valle (struttura con almeno un
ombrellone attivo, `retiredAt IS NULL` — ADR-0053; almeno una fascia; almeno una stagione
*usable*, cioè non tutta nel passato; almeno una stagione usable con una tariffa applicabile), così
la nozione di «configurato» smette di essere implicita e diventa interrogabile prima che
l'operatore ci sbatta contro in fase di prenotazione.

La **ripresa** è conseguenza diretta di questo disegno, non un meccanismo a parte: a ogni ingresso
il wizard rilegge lo stato reale da `setup-status` e posiziona lo stepper su
`firstIncompleteStep`; i passi già completi restano visitabili in modalità rivedi/aggiungi. Lo
stesso endpoint alimenta anche `setupComplete: boolean` in `PlatformEstablishmentDTO` (Platform
Console, calcolato riusando `computeForTx` dentro il `forTenant` già aperto per le altre metriche):
un booleano derivato da count, **PII-free**, sullo stesso principio di proiezione aggregata cross-
tenant di [ADR-0040](0040-lettura-aggregata-cross-tenant.md) — un'unica definizione di «configurato»
condivisa da staff e platform, non due.

**Alternativa rigettata: endpoint aggregato transazionale** (un solo `POST` tutto-o-niente che
scrive l'intera configurazione iniziale in una transazione). Scartata per due motivi indipendenti,
ciascuno sufficiente da solo:

1. **Secondo write-path permanente.** L'aggregato dovrebbe duplicare la logica di scrittura dei sei
   service esistenti (sector, row, umbrella, timeSlot, season, rate) e restare sincronizzato con
   essi per sempre — debito strutturale che il resto del repo non ha mai accettato altrove.
2. **Inapplicabile al rilancio su un lido già operativo.** Un aggregato tutto-o-niente presuppone
   di scrivere su una lavagna vuota; sul rilancio la lavagna non è vuota (c'è storico, ci sono
   ombrelloni ritirati, guardie 409 attive) e l'onboarding deve **aggiungere all'esistente**, mai
   sostituirlo. Il ramo incrementale sarebbe comunque servito per questo caso, quindi l'aggregato
   avrebbe convissuto con esso invece di sostituirlo — due architetture per un solo flusso.

## Consequences

- **Lo stato parziale è di prima classe, non un errore transitorio da nascondere.** Il modello
  intero si regge sul fatto che un lido a metà configurazione è uno stato legittimo e persistente
  (anche per settimane), non un'eccezione da far sparire con un reset: la ripresa esiste proprio
  perché questo stato è normale.
- **`computeSetupStatus` deve evolvere insieme alla catena reale dei prerequisiti.** È la stessa
  semantica dei 422 di `throwPriceError`, resa interrogabile: se in futuro nasce un nuovo 422 di
  configurazione nel percorso di quotazione (es. un nuovo vincolo dominio-specifico), il rischio è
  che `setup-status` diverga silenziosamente da esso — la projection va aggiornata nello stesso
  cambiamento, non in un secondo momento.
- **Nessun reset distruttivo è mai promesso dal wizard.** Dove il dominio lo vieta (ritiro
  ombrellone, guardie 409 — ADR-0053) il wizard spiega e rimanda all'editor completo (il Cantiere),
  non tenta di aggirarlo.
- **Una sola definizione di «configurato» per staff e platform.** `SetupStatusDTO.complete` (staff,
  via `/onboarding`) e `PlatformEstablishmentDTO.setupComplete` (platform, via la lista lidi)
  derivano dalla stessa `computeSetupStatus`: non esistono due nozioni di completezza che possano
  disallinearsi.
- **Nessun secondo write-path**: il wizard resta un orchestratore, zero mutation nuove oltre a
  quelle già esistenti per settore/fila/ombrellone/fascia/stagione/tariffa.

## Rubric check

1. **Professionalità** — la completezza è misurata dove nasce la verità (server, stessa semantica
   dei 422), non dedotta o cacheata lato client; il wizard non promette ciò che il dominio vieta.
2. **Convenzioni** — pattern `getOverview` per l'endpoint (`forTenant` + `Promise.all` di count);
   projection pura separata dal service, unit-testabile; riuso delle mutation e dei composable
   esistenti nel FE.
3. **Modularità** — una sola funzione pura di completezza condivisa da staff e platform; stepper
   feature-locale; nessuna astrazione nuova nel dominio.
4. **Zero debito** — nessun write-path parallelo introdotto; contratti additivi (`SetupStatusDTO`,
   `setupComplete`); nessun breaking change.
