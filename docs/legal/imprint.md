# Informazioni obbligatorie del prestatore ("imprint")

> ⚠️ **Bozza di lavoro, non un parere legale.** Vedi [README.md](README.md).
>
> **Versione:** 0.2 (bozza, post-review) · **Data:** 2026-07-24 · **Slice:** D-061 (5.6b)

## Perché serve e a chi si applica

L'art. 7 del **D.Lgs. 70/2003** (attuazione della direttiva e-commerce 2000/31/CE) impone a chi
fornisce un servizio della società dell'informazione di rendere accessibili **in modo diretto e
permanente** alcune informazioni identificative. Coralyn, come SaaS erogato a distanza per via
elettronica e dietro corrispettivo, vi rientra.

L'omissione è punita con **sanzione amministrativa da 103 a 10.000 euro** (art. 21 D.Lgs. 70/2003).
`[DA VERIFICARE ALLA FONTE: che il richiamo dell'art. 21 copra l'art. 7 per intero, lettera h
compresa]` ⚖️-17

## Come va pubblicato

Le informazioni vanno rese accessibili **in modo diretto e permanente**: in pratica un collegamento
nel **piè di pagina** di ogni schermata, che punta a una **pagina dedicata** con il testo completo.
Non è sufficiente inserirle solo nei termini di servizio o in un documento scaricabile.

⚖️-16 **Da validare, il perimetro.** L'obbligo riguarda le superfici pubbliche del servizio. Vanno
confermati: (a) se comprenda un'applicazione accessibile **solo previa autenticazione**, caso meno
battuto del sito aperto al pubblico; (b) se la superficie rivolta al bagnante (`web-customer`, la cui
pagina `/privacy` è **pubblicamente raggiungibile**) faccia scattare l'obbligo di imprint **del
Lido**, non di Coralyn. Il secondo punto ha un'implicazione di prodotto: i campi societari del lido
esistono già nel modello dati, quindi renderli anche come imprint sarebbe additivo.

## Contenuto da pubblicare

| Informazione | Valore | Fonte dell'obbligo |
|---|---|---|
| Denominazione / ragione sociale | `[COMPILARE]` | art. 7.1.a |
| Domicilio o sede legale | `[COMPILARE]` | art. 7.1.b |
| Recapiti per contatto rapido, inclusa email | `[COMPILARE]` | art. 7.1.c |
| Numero REA / registro imprese | `[COMPILARE]` | art. 7.1.d |
| Autorità di vigilanza | Non applicabile: attività non soggetta a concessione, licenza o autorizzazione ⚖️-16 | art. 7.1.e |
| Ordine professionale e numero di iscrizione | Non applicabile: attività non regolamentata ⚖️-16 | art. 7.1.f |
| Partita IVA | `[COMPILARE]` | art. 7.1.g |
| **Prezzi e tariffe dei servizi**, con indicazione se comprendono imposte e altri elementi | `[COMPILARE: listino, precisando se IVA inclusa]` ⚖️-17 — se il servizio è venduto solo tramite contratto negoziato e non offerto online, va valutata l'applicabilità | art. 7.1.h |

`[COMPILARE: capitale sociale ed eventuale indicazione di socio unico o stato di liquidazione, se la
forma societaria lo richiede ai sensi dell'art. 2250 Cod. Civ.]` ⚖️-17 — dipende dalla forma
societaria, non ancora scelta.

## Modello di testo (da completare prima della pubblicazione)

Scritto senza trattini lunghi, per essere portabile in-app.

---

**`[COMPILARE: ragione sociale]`**
Sede legale: `[COMPILARE: indirizzo completo]`
P. IVA e Codice Fiscale: `[COMPILARE]`
Iscrizione al Registro delle Imprese di `[COMPILARE: provincia]`, REA n. `[COMPILARE]`
`[COMPILARE: capitale sociale, se dovuto]`
Email: `[COMPILARE]` · PEC: `[COMPILARE]`
Prezzi e condizioni del servizio: `[COMPILARE: rinvio al listino o ai termini di servizio]`

---

## Rapporto con gli altri documenti

L'imprint identifica il **prestatore del servizio**. Deve riportare esattamente gli stessi dati
societari che compaiono come titolare nella
[privacy policy operatori](privacy-policy-operatori.md) e come responsabile nel
[DPA](dpa-coralyn-lido.md). Per evitare divergenze, la fonte unica è la
[tabella canonica nel README](README.md#dati-societari-di-coralyn-fonte-unica): si compila lì.

**Non confondere con l'informativa al bagnante:** lì il titolare è il lido, e i dati identificativi
sono i suoi, non quelli di Coralyn.
