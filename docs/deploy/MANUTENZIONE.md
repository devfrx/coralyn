# Runbook di manutenzione — Coralyn in produzione

> Cosa fare **dopo** che è online: routine periodiche, aggiornamenti, gestione del DB,
> spazio disco, certificati, e la procedura di ripristino se il VPS muore. Complementare
> alla [guida di deploy](README.md). Tutti i comandi si eseguono sul VPS, nella root del
> repo, con `docker compose -f docker-compose.prod.yml ...` (abbreviato sotto come `dcp`).
>
> Suggerimento: crea un alias una volta sola per non riscriverlo ogni volta —
> `echo "alias dcp='docker compose -f docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc`

---

## 1. Cadenza consigliata

| Frequenza | Attività | Comando / sezione |
|---|---|---|
| **Automatico (notte)** | Backup DB + copia offsite | cron del [Passo 9](README.md#passo-9--backup-automatici-il-pezzo-che-rende-tutto-professionale) |
| **Settimanale** | Colpo d'occhio salute + spazio disco | §2 |
| **Settimanale** | Verifica che i backup esistano davvero | §6 |
| **Mensile** | Aggiornamenti di sicurezza del sistema | §4 |
| **Mensile** | Pulizia immagini/volumi Docker orfani | §8 |
| **Trimestrale** | **Restore drill** (prova di ripristino) | §6 |
| **Trimestrale** | Rinnovo mentale segreti / audit accessi | §10 |
| **A ogni release** | Backup → `git pull` → rebuild | §3 |

---

## 2. Monitoraggio salute (il check settimanale, 2 minuti)

```bash
dcp ps                      # tutti i servizi "running" e (dove previsto) "healthy"?
dcp logs --since 24h api | grep -iE "error|exception|fatal" | tail -20   # errori recenti?
df -h /                     # spazio disco: sotto l'80% stai tranquillo
docker system df            # quanto occupano immagini/volumi Docker
free -h                     # RAM: se lo swap è pieno costantemente, valuta un taglio più grande
```
Health dell'API a colpo sicuro:
```bash
dcp exec api node -e "require('http').get('http://localhost:3000/health',r=>{r.pipe(process.stdout)})"
# atteso: {"status":"ok"}
```

**Cosa guardare:** un servizio che risulta `restarting` in loop, disco oltre l'85%, o
errori ripetuti nei log dell'api sono i tre segnali che richiedono azione.

---

## 3. Aggiornare l'applicazione (nuova versione su `main`)

**Regola: backup prima di ogni update.**
```bash
./deploy/backup-db.sh                          # 1. snapshot di sicurezza
git pull                                        # 2. porta il nuovo codice
dcp up -d --build                               # 3. rebuild + riavvio
dcp logs -f api                                 # 4. verifica: migrazioni + "avvio API su :3000"
```
Le migrazioni Prisma girano da sole all'avvio dell'api (`migrate deploy`, idempotente).

**Se qualcosa va storto (rollback):**
```bash
git log --oneline -5                            # trova il commit precedente stabile
git checkout <hash-precedente>
dcp up -d --build
```
⚠️ Il rollback del **codice** è immediato; il rollback di una **migrazione** DB no. Se un
update ha applicato una migrazione distruttiva e vuoi tornare indietro, ripristina dal
backup (§6). Per questo il backup pre-update non è opzionale.

---

## 4. Aggiornamenti di sistema e sicurezza

**Sistema operativo del VPS** (mensile, o subito per patch critiche):
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot                                     # solo se aggiornato il kernel; i container ripartono da soli (restart: unless-stopped)
```
Consiglio: abilita gli aggiornamenti di sicurezza automatici, così non dipendono da te:
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Immagini base Docker** (postgres, caddy, node): ottieni le patch di sicurezza rifacendo
il pull + rebuild periodico:
```bash
dcp pull                                        # aggiorna postgres:16 e caddy:2-alpine
dcp build --pull api web web-platform web-customer   # ribuilda con l'immagine node aggiornata
dcp up -d
```

---

## 5. Database: spazio, salute, manutenzione

PostgreSQL fa **autovacuum** da solo: in condizioni normali non devi fare manutenzione
manuale. Ti servono questi comandi soprattutto per **capire lo stato** man mano che cresci.

Apri una shell psql (come superuser del DB):
```bash
dcp exec db psql -U coralyn -d coralyn_prod
```
Query utili (dentro psql):
```sql
-- Dimensione totale del database
SELECT pg_size_pretty(pg_database_size('coralyn_prod'));

-- Le 10 tabelle più grandi (per capire dove cresce il volume)
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;

-- Connessioni attive (se si avvicinano al limite, è ora di scalare / usare un pooler)
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Righe per tenant sulle prenotazioni (per vedere se un lido è "grande")
SELECT "establishmentId", count(*) FROM "Booking" GROUP BY "establishmentId" ORDER BY 2 DESC;
```
Esci con `\q`.

**Quando intervenire:**
- DB che cresce oltre lo spazio disco → aumenta il disco del VPS, o passa a Postgres managed (§ scaling).
- Un singolo lido enormemente più grande degli altri → candidato all'escape hatch DB-dedicato
  ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)).
- Query lente → si affrontano con indici mirati, **non** con manutenzione DB generica.

---

## 6. Backup: verifica e prova di ripristino

Un backup che non hai mai ripristinato **non è un backup**. Due controlli:

**Verifica settimanale (esistono e non sono vuoti):**
```bash
ls -lh /var/backups/coralyn/ | tail -5          # ci sono file recenti, di dimensione sensata?
```

**Restore drill trimestrale** — ripristina su un DB **di prova**, mai in produzione:
```bash
# 1. crea un DB temporaneo dentro lo stesso Postgres
dcp exec db psql -U coralyn -d coralyn_prod -c "CREATE DATABASE restore_test OWNER coralyn_app;"
# 2. carica l'ultimo dump nel DB di prova
LATEST=$(ls -t /var/backups/coralyn/*.sql.gz | head -1)
gunzip -c "$LATEST" | dcp exec -T db psql -U coralyn -d restore_test
# 3. controlla che i dati ci siano
dcp exec db psql -U coralyn -d restore_test -c 'SELECT count(*) FROM "Booking";'
# 4. pulisci
dcp exec db psql -U coralyn -d coralyn_prod -c "DROP DATABASE restore_test;"
```
Se il conteggio ha senso, il tuo backup è realmente ripristinabile. Segnatelo sul calendario.

---

## 7. Certificati HTTPS

Caddy **rinnova i certificati da solo** (~30 giorni prima della scadenza): non devi fare
nulla. Ti accorgi di un problema solo se un rinnovo fallisce (per questo hai messo
`ACME_EMAIL`: Let's Encrypt ti avvisa via email).

Controllo manuale se hai dubbi:
```bash
dcp logs caddy | grep -iE "certificate|renew|error"
# dal browser: apri https://app.tuodominio.it e guarda la data di scadenza del lucchetto
```
Se un certificato non si rinnova, la causa quasi sempre è: **porta 80 chiusa** (Caddy ne ha
bisogno per la sfida ACME) o **DNS cambiato**. Riapri la 80 nel firewall e riavvia caddy:
`dcp restart caddy`.

---

## 8. Spazio disco: pulizia Docker

Ogni `--build` lascia immagini vecchie ("dangling") che occupano spazio. Pulizia mensile:
```bash
docker image prune -f                            # rimuove SOLO le immagini orfane (sicuro)
docker builder prune -f                          # cache di build vecchia
# Più aggressivo (rimuove TUTTE le immagini non usate da un container attivo):
# docker system prune -af   # ⚠️ dopo, il primo build sarà più lento (cache ricostruita)
```
⚠️ **Non** usare `docker system prune --volumes`: cancellerebbe il volume del database.
I dati di Postgres vivono nel volume `coralyn-pgdata-prod`: non va mai toccato con prune.

Log dei container (se crescono troppo): limita la dimensione aggiungendo al
`docker-compose.prod.yml` di ogni servizio (opzionale):
```yaml
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

---

## 9. Riavvii e stop programmati

```bash
dcp restart api                                  # riavvia un solo servizio (es. dopo un cambio env)
dcp up -d                                         # applica modifiche a .env.prod (ricarica le variabili)
dcp down                                           # ferma tutto (i dati restano nel volume)
dcp down && dcp up -d --build                      # riavvio pulito completo
```
Grazie a `restart: unless-stopped`, dopo un reboot del VPS i container ripartono da soli.

---

## 10. Rotazione dei segreti

Se sospetti una fuga (o per igiene annuale):
- **Password del superuser:** cambia `PLATFORM_SUPERUSER_PASSWORD` in `.env.prod`, poi
  rilancia `dcp exec api pnpm --filter @coralyn/api db:bootstrap-superuser` (idempotente).
- **`JWT_SECRET`:** cambialo in `.env.prod` e `dcp up -d api`. Effetto collaterale: **tutti
  gli utenti loggati vengono sloggati** (i token vecchi diventano invalidi). Fallo in orario
  di calma.
- **Password DB (`coralyn_app`):** più delicata (va cambiata sia nel ruolo Postgres sia nel
  `DATABASE_URL`). Se ti serve, chiedimi la procedura guidata: non è un'operazione al volo.

---

## 11. Disaster recovery — il VPS è perso

Scenario: il VPS è morto/compromesso e devi ripartire da zero su una macchina nuova.
Funziona **solo se hai i backup offsite** (§6 + Passo 9): ecco perché sono obbligatori.

1. Crea un nuovo VPS e rifai i Passi 2–4 della guida (hardening, clone, `.env.prod`).
   Il `.env.prod` custodito a parte ti fa risparmiare la riconfigurazione dei segreti.
2. Avvia solo il DB e lascialo inizializzare il ruolo:
   ```bash
   dcp up -d db
   ```
3. Ripristina l'ultimo dump scaricato dall'offsite:
   ```bash
   gunzip -c coralyn-<data>.sql.gz | dcp exec -T db psql -U coralyn -d coralyn_prod
   ```
4. Avvia il resto: `dcp up -d --build`. Ripunta i DNS sul nuovo IP (Passo 5).
5. Verifica (Passo 8 della guida). Fine.

**RPO** (quanti dati perdi): al massimo l'intervallo fra due backup (con backup notturno, ~1 giorno → valuta backup più frequenti se il dato è critico). **RTO** (quanto ci metti): ~30–60 minuti se hai `.env.prod` e i dump a portata.

---

## 12. Quando cresce: segnali e mosse

| Segnale che osservi (§2, §5) | Mossa |
|---|---|
| CPU/RAM del VPS spesso saturi | Taglia più grande di VPS (verticale), è un click su Hetzner |
| Molti tenant, DB che è il collo di bottiglia | Postgres **managed** (Neon/Hetzner) + connection pooler |
| Serve alta disponibilità | 2+ container `api` dietro Caddy (l'API è stateless) su uno o più VPS |
| Un lido enorme rispetto agli altri | DB **dedicato** per quel tenant (escape hatch [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)) |
| Troppi clienti da gestire a mano | Costruire onboarding self-service + billing (deferred D-002) |

Nessuna di queste è una riscrittura: sono passi incrementali già previsti dall'architettura.

---

## 13. Incidenti comuni — diagnosi rapida

| Sintomo | Prima cosa da guardare |
|---|---|
| Il sito non carica (timeout) | `dcp ps` — un servizio è giù? `dcp logs caddy` — certificato/porta? |
| "502 / UI non disponibile" | `dcp logs api` — l'API è crashata o non healthy? |
| Login ko per tutti | Hai toccato `JWT_SECRET`? (slogga tutti — atteso). Altrimenti `dcp logs api`. |
| Le email non partono | `dcp logs api | grep -i mail`; record SPF/DKIM su DNS; `MAIL_PASS` valida? |
| Disco pieno | §8 (prune) + `df -h`; se persiste, ingrandisci il disco |
| DB non accetta connessioni | `dcp logs db`; troppe connessioni aperte? (§5) |
| Tutto lento all'improvviso | `free -h` (swap?), `docker stats` (chi consuma?), query lente (§5) |

Per un incidente vero: **non fare modifiche a caso**. Guarda i log, isola il servizio,
e se serve ripristina da backup. Se sei bloccato, portami l'output di `dcp ps` +
`dcp logs --since 30m <servizio>` e lo diagnostichiamo insieme.

---

## 14. Operatività: aggiungere / rimuovere un lido

- **Nuovo lido:** dalla console piattaforma (`https://platform.tuodominio.it`) crei lo
  Stabilimento + il suo admin. Nessuna operazione infrastrutturale: l'onboarding è dati,
  non deploy (è il vantaggio del multi-tenant a schema condiviso).
- **Sospendere/rimuovere un lido:** gestito a livello applicativo (utenti disabilitati,
  cessione/subentro — vedi [ADR-0047](../architecture/decisions/0047-cessione-subentro-titolarita-incasso.md)).
  L'erasure GDPR del cliente è coperto da [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md).

---

## Riferimenti

- Guida di deploy passo-passo: [README.md](README.md)
- Isolamento multi-tenant e scaling: [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
- Backlog evolutivo (onboarding/billing D-002): [deferred.md](../architecture/deferred.md)
