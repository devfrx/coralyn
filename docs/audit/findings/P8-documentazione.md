# P8 — Documentazione (294 .md; passata meccanica su TUTTI, lettura umana prioritizzata)

## ALTO
- **P8-001** `deferred.md:32` (D-061) afferma «l'**unica memorizzazione** è il token in localStorage» → **FALSO**: `web-customer/src/lib/authToken.ts:10,16` scrive **2** token, e tutte e 3 le app hanno `VitePWA` con Workbox (`vite.config.ts:13-16` ×3) = Cache Storage. Il repo lo sa già (`docs/legal/README.md:94` «due categorie»), ma deferred.md non è stato corretto. **La conclusione «niente banner» poggia su questa premessa.** RADICE: la riga cresce per append datati, il testo iniziale falso non viene mai barrato.
- **P8-002** L'handoff d'ingresso «corregge» la baseline con un'affermazione **falsa** e si auto-contraddice. §1a `:48-51` dice che `pnpm --filter @coralyn/web-staff test` NON esegue ui-kit. Ma `apps/web-staff/vitest.config.ts:19`: `include: ['src/**/*.spec.ts', '../../packages/ui-kit/src/**/*.spec.ts']` — **lo esegue per configurazione esplicita** (le altre 2 app non ce l'hanno). Aritmetica: 60 spec web-staff + 36 ui-kit = **96 file**, il numero che §2 riporta. → **i 190 di ui-kit sono già dentro i 617, la tabella li conta due volte.** L'handoff precedente scriveva correttamente «web-staff (incl. ui-kit) 608/608 (95 file)». RADICE: baseline trascritte a mano senza colonna comando.
- **P8-003** `docs/legal/README.md:145` chiude ⚖️-18 citando «rotte pubbliche **`/privacy`** in entrambe le app» → FALSO: sono `/legale/informativa`+`/legale/note` (`web-staff/router/index.ts:31-32`, `web-platform:15-16`); `/privacy` è solo `web-customer:8` ed è **vietato** dai test. Il MEDESIMO file 111 righe sopra (`:34`) dice il contrario. È la riga che un legale legge per verificare l'art. 14.3(a). RADICE: le voci marcate `~~CHIUSO~~` diventano zone morte non revisionate.
- **P8-004** `docs/architecture/README.md:82-135`: l'indice ADR si ferma a **0051**. Mancano 0052, 0053, 0054, **0055, 0056** (tutta l'architettura GDPR/legale), tutti `Accepted`. Il file si autodefinisce «documento vivo».
- **P8-005** `README.md` root fermo al **2026-07-01** (commit `e4e63ab`, 25 ADR fa). Non nomina mai web-platform, web-customer, canale cliente, noleggi, onboarding, package legale. `:66-68` indica come «Prossimi passi» **D-032, D-011, D-025 — tutti e tre chiusi**.
- **P8-006** `docs/architecture/README.md:34-37` descrive `apps/` = api + web-staff + «in futuro `web-booking`» (mai esistito) e `packages/` = solo contracts. `:50-66` elenca i moduli backend **`audit` e `core` che NON esistono** e omette i 7 reali (reports, establishment, platform, customer-auth, rentals, informativa, credential). La riga «audit — logging strutturato, audit log» fa credere implementato ciò che è **D-047 deferito**.
- **P8-007** `docs/design/data-model.md` si dichiara «fonte di verità» (`:108`) ma contiene: **`WAITLIST`** (`:119,156,350-357`) — zero occorrenze nel codice; **`AUDIT_LOG`** tenant-scoped (`:122`) — esiste solo `PlatformAuditLog` scope superuser; **`PACKAGE { json equipment }`** (`:212`) — colonna **rimossa da ADR-0036** (`migrations/20260703081533_*/migration.sql:69` `DROP COLUMN "equipment"`). Assenti: Rental, RentalItem, RentalTariff, EquipmentType, PackageEquipment, CredentialSetupToken. Copertura reale 22/28 modelli.
- **P8-008** **95 link relativi rotti**, non 4 (2725 verificati su tutti i 294 .md). Nei soli 4 ADR nominati sono **12**, non 4 (0030 da solo ne ha 8). Tre classi sistematiche: profondità sbagliata dagli ADR (`../design/` → serve `../../design/`), profondità sbagliata da `superpowers/specs/` (`../../` → serve `../../../`), link con `:NN` di riga appeso. **Ironia**: ADR-0030 elenca a `:123-126` i «documenti autoritativi/viventi» e **tutti quei link sono rotti**.

## MEDIO
- **P8-009** `deferred.md` viola la regola del proprio preambolo («quando una voce è affrontata si rimuove da qui»): ≥7 righe con marcatore di chiusura ancora nella tabella «aperte» (D-013, D-025, D-045, D-051, D-061, D-039), sezione «Risolte» con 20+ voci, **D-051 duplicata** (`:61` e `:91`). **73.680 caratteri su 131 righe**; la sola riga D-061 supera i **6.000 caratteri** in una cella di tabella markdown. Non risponde più alla domanda per cui esiste.
- **P8-010** `apps/web-staff/README.md:11,17` (fermo al 2026-06-30): «MSW mocka la Mappa» in dev → **falso**, `main.ts:11-12` dice «in dev NON usiamo mock nel browser», MSW è solo in `test/setup.ts`; «`/api/clienti`» → **non esiste**, è `/api/customers` da ADR-0030.
- **P8-011** `docs/deploy/README.md:251` (Passo 7, primo avvio in produzione) fa cercare nei log «**avvio API su :3000**». `apps/api/src/main.ts` è di 13 righe e **non stampa nulla**; zero `console.log` in tutto `apps/api/src`. FIX RADICE: **aggiungere il log**, non correggere il testo. Il resto della guida regge alla verifica.
- **P8-012** «Il DB è sulla 5433» non è solo nell'handoff: la 5433 è **hardcodata nel codice versionato**, `apps/api/prisma/reset-dev.ts:7,10`. Su un clone pulito quel comando copia-incollato fallisce. RADICE: `docker-compose.override.yml` è gitignorato **e non ha un `.example` versionato**.
- **P8-013** Il registro del debito sottostima entrambe le voci che tiene: «15 errori eslint» → **73** (4,9×); «4 link rotti» → **95** (24×). Ripetuto identico in 2 punti dello stesso file, il che dà l'impressione di doppia conferma quando è una sola trascrizione.
- **P8-014** `docs/design/README.md`: link rotto a `Coralyn - Gestionale Lidi.html` (`:14`, file inesistente); `subscription-suspension-modal.html` etichettato «***design, non ancora implementata***» (`:15-16`) mentre è **implementata e mergiata dal 2026-07-08**; indice copre **5 mockup su 15**.

## BASSO
- **P8-015** ADR **0038** e **0039** non hanno il campo `Status` prescritto dal proprio template (`0000-template.md:3`). Gli altri 54 ce l'hanno. 0039 (RolesGuard) è vigente e centrale.
- **P8-016** `apps/api/prisma/reset-dev.ts:1-2` dice «le **18** tabelle RLS FORCE» — oggi sono **22**. Il codice è corretto (introspette), è il commento a mentire. Il 18 si è propagato in `plans/2026-07-10-reset-db-dev.md:7,13,384`. Inoltre «preservando SOLO User+Establishment» mentre la `KEEP_LIST` reale (`reset-dev.core.ts:7-15`) ha **7** voci.
- **P8-017** `docs/legal/README.md:8` dichiara «Versione corrente: **0.2**» ma `privacy-policy-operatori.md:5` è a **0.3** (confermata da `privacy.content.ts:18`). Divergenza nell'intestazione della «fonte unica». Anche «17 punti ⚖️» vs «18» dell'handoff.

## AFFERMAZIONI VERE (verificate, 10)
- ✅ **RLS su 22 tabelle tenant-scoped + 6 fuori**: VERA. 28 model, 22 con ENABLE+POLICY, i 6 esclusi sono esattamente `User`, `Establishment`, `CredentialSetupToken`, `PlatformAuditLog`, `CustomerEnrollmentToken`, `CustomerSession`.
- ✅ **FORCE su tutte e 22**: VERA (i `NO FORCE` sono temporanei dentro backfill, sempre ripristinati).
- ✅ Ruolo app `NOSUPERUSER NOBYPASSRLS` (`init/01-app-role.sql:1`, `init.prod/01-app-role.sh:14`).
- ✅ ⚖️-09 (il ruolo app è proprietario dello schema e potrebbe alterare le policy) — coerente con D-023.
- ✅ «Prossimo ADR libero 0057, prossima deferred D-063».
- ✅ «13 handler usano @Public()» (15 occorrenze − 2 nei file guardia).
- ✅ `strictPort` 5173/5174/5175.
- ✅ Tutte e 3 le app sono PWA con Workbox.
- ✅ Email senza `<img>`, vincolata da test.
- ✅ `MAIL_PASS` (non `MAIL_PASSWORD`).
- ✅ Doppio artefatto `docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` **oggi allineato** su versione 0.3 e lettere art. 7 (incl. P.IVA = lett. g).
- ⚠️ «16 `<input type="date">` residui» → 15 in `.vue` (18 con i .ts di test): **nessun conteggio dà 16**.

## STATO ADR
57 file = 56 ADR + template. 52 `Accepted`, 2 `Superseded` (0003→0030, 0018→0027), **2 senza Status** (0038, 0039).
**Nessuna contraddizione FRA ADR.** I supersede sono espliciti e bidirezionali. Il problema è fra ADR e documenti derivati.
ADR problematici: 0030 (8 link rotti, incl. tutti quelli dei «documenti viventi» che dichiara allineati), 0043 (rinvia a `0009-metodo-decisionale.md`, slug inesistente), 0016/0023 (link rotti proprio verso il `data-model.md` divergente), 0036 (valido e applicato ma contraddetto da `data-model.md:212`), 0055/0056 (assenti dall'indice).

## DECISIONI STRUTTURALI NEL CODICE SENZA ADR
1. **La suite di test di web-staff ingloba ui-kit** (`vitest.config.ts:19`) — scelta non banale, non documentata, causa diretta di P8-002.
2. **`PrismaExceptionFilter` lascia P2025 a 500 di proposito** — tracciato solo in deferred/handoff, mai promosso ad ADR benché tocchi la superficie d'errore di tutta l'API.
3. **Nessuna CI** — per un repo che ratifica per ADR la variante `danger` di un `IconButton` (0044), è la decisione strutturale più grande **non** registrata da nessuna parte.

## COPERTURA
Passata MECCANICA su **tutti** i 294 .md (2725 link risolti). Lettura umana: 17 file integrali (README root, architecture/README, deferred, legal/README, imprint, deploy/README, design/README, specs/README, handoff 25/07, web-staff/README, main.ts, schema.prisma parziale, privacy.content.ts, imprint.content.ts, reset-dev*).
Status estratto da **tutti** i 57 ADR via script.
NON aperti: ~50 handoff storici pre-21/07, `docs/plans/` (15), `docs/superpowers/plans/` (60), `superpowers/specs/` (40), `docs/specs/` (25) — coperti solo dalla passata link + grep. `dpa-coralyn-lido.md` e `registro-trattamenti.md` solo grep mirato.
LIMITI: non ha eseguito test/lint (il 73 viene da me); non ha verificato gli **anchor** `#sezione` → **95 è un minimo**; non ha verificato i link http.

## RADICI
1. **Non esiste alcun gate automatico.** Nessuna CI, nessun hook (`.husky/` assente, `core.hooksPath` non impostato). Spiega P8-008, P8-013, P8-004, P8-014, P8-015. Un solo script (link-check + adr-status + er-vs-schema) chiude 5 finding.
2. **La documentazione cresce per append, mai per riscrittura.** Il testo iniziale falso sopravvive SOTTO le correzioni invece di essere sostituito → vettore diretto di P8-001.
3. **Lo stesso fatto è asserito in N posti invece di essere linkato una volta.** Il repo conosce già il rimedio (ADR-0056 ha creato `packages/legal` proprio per questo) ma lo applica ai contenuti, non ai **fatti sul sistema** (conteggi, path, porte, versioni).
4. **I numeri derivabili sono trascritti a mano.** Il caso «22 tabelle» è istruttivo al contrario: è corretto perché misurato di recente sotto review avversariale. `reset-dev.ts:1` è la forma pura del difetto: un commento che scrive `18` accanto al codice che quel numero lo calcola.
5. **Il perimetro dei «documenti viventi» di ADR-0030 è troppo stretto e mai rivisto.** Fuori: README dei package, guida deploy, indice design. E anche DENTRO l'elenco l'allineamento è nominale: `data-model.md` è stato toccato il 24/07 e contiene comunque 2 entità inesistenti — «aggiornare» ha significato *aggiungere il nuovo*, non *rileggere il vecchio*.

**Nota di metodo**: l'handoff §4 scrive «verificare invece di dedurre» — e nella stessa sessione ha **dedotto** cosa esegue `pnpm --filter @coralyn/web-staff test` senza aprire `vitest.config.ts`, scrivendo la deduzione come *correzione* di un dato che era giusto. Il metodo non è il difetto: il difetto è che è stato applicato una volta, a mano, e nulla lo riapplica.
