# ADR-0029: Brand definitivo Coralyn e rename di scope/identificatori (risolve D-017)

- **Status:** Accepted
- **Data:** 2026-06-30
- **Decisori:** Team di progetto
- **Risolve:** [D-017](../deferred.md) (brand pubblico e dominio definitivo)
- **ADR correlati:** [ADR-0008](0008-stack-e-layout.md) (stack/monorepo, scope dei package), [ADR-0027](0027-coralyn-linguaggio-visivo.md) (linguaggio visivo Coralyn), [ADR-0010](0010-isolamento-multi-tenant.md) (ruolo DB applicativo per la RLS)

## Context

Il progetto è nato con il **codename provvisorio Driftly** ([D-017](../deferred.md)): il brand
pubblico e il dominio erano una decisione consapevolmente rimandata, e nel frattempo il codename
etichettava lo scope dei package (`@driftly/*`) e gli identificatori infra/DB (`driftly_app`,
`driftly_dev`, `driftly_test`, container `driftly-*`).

Nel frattempo il nome **Coralyn** si è affermato come brand reale del prodotto su più piani:

- è il nome del **concept di design** adottato nel redesign FE ([ADR-0027](0027-coralyn-linguaggio-visivo.md)),
  dal corallo mediterraneo che è il colore brand;
- è già il nome usato nella **UI**, nella **cartella del repository** e nel **remote** (`devfrx/coralyn`);
- non resta alcun motivo per trattarlo come provvisorio.

Restava un disallineamento: il brand era Coralyn ma lo **scope dei package** e gli **identificatori
infra/DB** parlavano ancora di Driftly. Tenere due nomi è debito (confusione, doc incoerente, ricerca
rumorosa). D-017 va quindi **risolta**, non più rimandata.

## Decision

Il brand del progetto è **Coralyn**, definitivamente. Conseguenze concrete del rename
(eseguito a strati, con verifica a ciascuno):

1. **Scope dei package** del monorepo: `@driftly/*` → **`@coralyn/*`**
   (`@coralyn/{root,api,web-staff,contracts,ui-kit}`) e tutti gli import interni. I package sono
   `private`, quindi nessuna pubblicazione npm è coinvolta. Le **dipendenze di terzi** (`@nestjs/*`,
   `@prisma/*`, `@tanstack/*`, `argon2`, …) **non** sono toccate.
2. **Identificatori infra / DB:** ruolo applicativo `driftly_app` → **`coralyn_app`**; database
   `driftly_dev`/`driftly_test` → **`coralyn_dev`**/**`coralyn_test`**; `DATABASE_URL`, healthcheck,
   `init/01-app-role.sql`; container `driftly-{db,api,web}` → **`coralyn-*`**; volume `driftly-pgdata`
   → **`coralyn-pgdata`**. Il rename degli identificatori DB richiede il **wipe del volume**
   (`docker compose --profile full down -v`) prima del rebuild.
3. **Credenziali admin di sviluppo:** `admin@coralyn.dev` (seed/compose); valori reali sempre via
   env/secret manager.
4. **Brand strings:** manifest PWA e `<title>` → "Coralyn".
5. **Documentazione:** sweep completo (inclusi gli snapshot storici — plan/handoff/spec datati) da
   Driftly a Coralyn. La **narrativa "ex-codename Driftly"** è conservata **solo** dove serve a
   spiegare la storia: il `README.md` e **questo ADR**.

Alternative scartate:

- *Mantenere `@driftly/*` come scope "interno" pur usando Coralyn come brand* — due nomi per la stessa
  cosa: debito permanente, doc e ricerca incoerenti, nessun beneficio (i package sono privati).
- *Rename solo dello scope, lasciando gli identificatori DB* — lascerebbe `driftly_app`/`driftly_dev`
  in vista in compose/SQL/URL: incoerenza che riemerge a ogni `docker compose` e ogni nuovo ambiente.
- *Rinominare anche il path del repository / il remote* — già `coralyn`; nulla da fare.

## Consequences

### Positive
- **Un solo nome** ovunque: codice, infra, DB, doc e brand coincidono. Ricerca pulita
  (`rg -i driftly` ≈ 0, a parte la narrativa storica voluta).
- D-017 **chiusa** in modo tracciato (ADR), come prescrive la rubric ([ADR-0002](0002-decision-rubric.md), filtro 4).
- Il rename è **a basso rischio**: package privati (nessuna pubblicazione), il rename era previsto
  come "banale" già nella scheda D-017.

### Negative / Trade-off
- Il rename degli identificatori DB impone un **wipe del volume** locale (`down -v`): i dati di
  sviluppo del vecchio volume `driftly-pgdata` vanno persi e riseminati (è dev-only, accettabile).
- Chiunque avesse un checkout precedente deve rifare `pnpm install` (scope dei package cambiato) e
  ricreare lo stack Docker.

### Neutre / Note
- D-023 (least-privilege del ruolo applicativo) resta valida e ora si riferisce a `coralyn_app`.
- Il dominio web definitivo non è oggetto di questo ADR: il brand è deciso; l'acquisto del dominio
  resta un'attività operativa di marketing, non una decisione architetturale aperta.

## Rubric check

1. **Professionalità** — un prodotto ha un nome solo; allineare codice/infra/doc al brand è igiene di base.
2. **Convenzioni** — scope di monorepo coerente col brand, identificatori infra coerenti, ADR che
   chiude una voce deferred (convenzione di progetto: una voce affrontata diventa ADR e si rimuove).
3. **Modularità** — il rename è meccanico e isolato (scope + identificatori + stringhe), nessun
   cambio di contratto fra moduli; le dipendenze di terzi non sono toccate.
4. **Zero debito** — elimina il doppio-nome; D-017 rimossa da `deferred.md` con rimando a questo ADR;
   nessun residuo silenzioso.
