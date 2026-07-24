# Documentazione legale e di compliance

> ⚠️ **Tutti i documenti in questa cartella sono BOZZE DI LAVORO redatte da ingegneri, non pareri
> legali.** Sono strutturalmente conformi agli obblighi noti e fondati sull'implementazione reale
> (verificata sul codice, non dichiarata), ma **nessuno è pronto alla pubblicazione o alla firma**
> senza la revisione di un professionista legale.
>
> **Data di redazione:** 2026-07-24

## Indice

| Documento | Obbligo | Destinazione | Slice |
|---|---|---|---|
| [privacy-policy-operatori.md](privacy-policy-operatori.md) | artt. 13-14 GDPR | pubblicazione in `web-staff` / `web-platform` | D-061 (5.6b) |
| [imprint.md](imprint.md) | art. 7 D.Lgs. 70/2003 | pubblicazione, piè di pagina | D-061 (5.6b) |
| [dpa-coralyn-lido.md](dpa-coralyn-lido.md) | art. 28 GDPR | allegato contrattuale | D-062 (5.6c) |
| [registro-trattamenti.md](registro-trattamenti.md) | art. 30 GDPR | interno, esibito su richiesta | D-062 (5.6c) |

L'**informativa al bagnante** (art. 13, piano A) non sta qui: è già realizzata come codice versionato
in `apps/web-customer/src/features/legal/informativa.content.ts`, parametrizzata per lido
([ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)).

## I tre piani, per non confonderli mai

| Piano | Titolare | Responsabile | Documento | Stato |
|---|---|---|---|---|
| **A. Lido → bagnante** | il **lido** (per-tenant) | Coralyn | Informativa art. 13 | **fatto** (5.6a, in `web-customer`) |
| **B. Coralyn → operatore** | **Coralyn** | — | Privacy policy operatori + imprint | **bozza qui** (D-061) |
| **C. Coralyn ↔ lido** | il lido | Coralyn | DPA + registro | **bozza qui** (D-062) |

Confondere i piani è l'errore più comune nelle policy dei SaaS B2B multi-tenant, e sarebbe
giuridicamente scorretto: verso il bagnante il titolare **non è Coralyn**.

## Quadro normativo verificato

Verificato il **2026-07-24**. Solo ciò che ha impatto reale sui documenti.

| Ambito | Fonte | Data fonte | Impatto |
|---|---|---|---|
| Protezione dati, base | Reg. UE 2016/679 (GDPR), artt. 13, 28, 30, 32, 37 | 2016 | struttura di tutti i documenti |
| Consenso dei minori in Italia | D.Lgs. 196/2003 art. 2-quinquies (come mod. da D.Lgs. 101/2018) | 2018 | soglia italiana a **14 anni**; rilevante per i bagnanti minorenni, ma qui la base non è il consenso |
| Cookie e tracker | Garante privacy, provv. n. 231 del 10/06/2021, «Linee guida cookie e altri strumenti di tracciamento» | 2021, **tuttora in vigore** | regole del banner; **non attivate**, vedi sotto |
| Ambito tecnico dell'art. 5(3) ePrivacy | EDPB, Orientamenti 2/2023 | 2023 | l'art. 5(3) è **neutro rispetto alla tecnologia**: copre anche `localStorage`, non solo i cookie |
| Tracking pixel nelle email | Garante privacy, provv. n. 284 del 17/04/2026, GU n. 98 del 29/04/2026 | **2026** | **novità**; adeguamento entro ~29/10/2026. Vedi sotto |
| Informazioni obbligatorie del sito | D.Lgs. 70/2003 artt. 7 e 21 | 2003 | contenuto dell'[imprint](imprint.md); sanzione 103-10.000 € |
| Obbligo di DPO | GDPR art. 37.1 | 2016 | **non** scatta prima facie per un gestionale di questa scala ⚖️ |
| Conservazione contabile | art. 2220 Cod. Civ. | — | 10 anni sui dati contabili |

### Due conclusioni tecniche che pesano più di tutte

**1. Niente banner di consenso — verificato, non supposto.** Ricognizione sul codice di `web-staff` e
`web-platform`: nessun cookie (nessuna occorrenza di `document.cookie`, `Set-Cookie` o equivalenti in
tutto il repo), nessuno strumento di analisi, nessuno script di terze parti, nessuna risorsa da rete
di distribuzione esterna. I font sono inclusi come pacchetto applicativo, non richiamati da Google
Fonts: **nessuna chiamata verso gli Stati Uniti al caricamento della pagina**.

L'unica memorizzazione sul dispositivo è il token di sessione in `localStorage`. Ricade nell'art. 5(3)
ePrivacy (che l'EDPB conferma essere neutro rispetto alla tecnologia), ma è **strettamente necessario**
al servizio richiesto dall'utente e quindi **esente da consenso**. Serve una sezione informativa nella
policy, non un banner.

⚠️ **La conclusione regge finché lo stack resta questo.** Basta aggiungere uno strumento di analisi,
una mappa, un video incorporato o un font da rete esterna perché l'obbligo di banner ricompaia.

**2. Il provvedimento 284/2026 sui tracking pixel non morde oggi, ma è a un passo.** Coralyn invia
email transazionali (attivazione e reimpostazione credenziali). Verificato sul template
(`apps/api/src/mail/credential-setup.email.ts`): il corpo HTML contiene **solo un collegamento,
nessun elemento immagine**, quindi nessun pixel di tracciamento. Le nuove linee guida **non si
applicano allo stato attuale**.

⚠️ Il rischio è concreto e vicino: `deploy/.env.prod.example` propone un fornitore email
commerciale, e questi fornitori attivano spesso il **tracciamento delle aperture per impostazione
predefinita**, iniettando un pixel senza modifiche al codice. Se accade, scattano informativa e
consenso ex provv. 284/2026. **Va verificato nella configurazione del fornitore al momento del
deploy**, e disattivato se non serve.

## Punti aperti da validare con un legale ⚖️

Riepilogo trasversale. I dettagli sono nei singoli documenti.

| # | Punto | Dove |
|---|---|---|
| 1 | **Nomina del DPO**: valutazione da formalizzare per iscritto, anche se negativa | [registro §D](registro-trattamenti.md) |
| 2 | **Necessità di una DPIA** (art. 35): da mettere agli atti | [registro §D](registro-trattamenti.md) |
| 3 | **Base giuridica dell'account operatore**: contratto o legittimo interesse? | [policy operatori](privacy-policy-operatori.md) |
| 4 | **Legittimo interesse sui log di sicurezza**: serve il test di bilanciamento | [policy operatori](privacy-policy-operatori.md) |
| 5 | **Trattamento di dati di minori** tra i bagnanti | [registro §D](registro-trattamenti.md) |
| 6 | **Trasferimenti extra-SEE**: dipendono dall'hosting, non ancora scelto | tutti |
| 7 | **Termini di conservazione** di log e token consumati: oggi indefiniti | [registro](registro-trattamenti.md) |
| 8 | **Note operative a testo libero**: rischio che il lido vi inserisca dati eccedenti | [DPA art. 3](dpa-coralyn-lido.md) |
| 9 | **Termini contrattuali** del DPA: preavviso sub-responsabili, finestra di notifica breach, modalità di audit | [DPA](dpa-coralyn-lido.md) |
| 10 | **Perimetro dell'obbligo di imprint** per un'app dietro autenticazione | [imprint](imprint.md) |
| 11 | **Cancellazione dai backup**: termine da allineare al ciclo di rotazione reale | [DPA art. 10](dpa-coralyn-lido.md) |

## Cosa manca prima di poter usare questi documenti

1. **Dati societari di Coralyn**: ragione sociale, forma, sede, P. IVA, REA, PEC, rappresentante
   legale. Non esistono ancora: sono `[COMPILARE]` ovunque, mai inventati.
2. **Scelta dell'infrastruttura**: hosting e fornitore email determinano sub-responsabili,
   ubicazione dei dati e trasferimenti extra-SEE. Blocca gli stessi `[COMPILARE]` anche
   nell'informativa al bagnante di 5.6a.
3. **Revisione legale** di tutti i punti ⚖️.
4. **Decisione su dove pubblicare** la policy operatori e l'imprint nelle due app interne: è una
   scelta strutturale ancora aperta (testo duplicato per app, oppure package condiviso), discussa
   come alternativa in [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md).
   Andrà ratificata in un ADR dedicato.

**Nessuno di questi documenti è pronto alla pubblicazione. Sono pronti alla revisione legale.**
