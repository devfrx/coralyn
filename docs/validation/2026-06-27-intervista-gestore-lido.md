# Guida all'intervista di validazione — gestore di lido

- **Data:** 2026-06-27
- **Obiettivo:** validare le assunzioni del **Core MVP** con uno o più gestori di lidi
  *reali*, prima di costruire. Ogni sezione indica l'assunzione testata, cosa chiedere,
  i segnali di conferma/smentita e la decisione collegata (ADR/deferred).

## Come condurla (principi)

- **Parla del loro passato concreto, non del futuro ipotetico.** "Come hai gestito gli
  abbonamenti *la scorsa stagione*?" batte "Useresti una funzione di rinnovo?".
- **Non vendere, non descrivere il prodotto.** Se spieghi la soluzione, ottieni
  cortesia, non verità. Fai domande, ascolta, prendi nota delle parole loro.
- **Cerca i problemi e i comportamenti, non i complimenti.** "Bello!" non è un dato.
  "L'anno scorso ho perso due settimane a rifare la pianta a mano" lo è.
- **Chiedi numeri e storie specifiche.** Quanti ombrelloni, quanti abbonati, quanto
  tempo, quanti soldi.
- **Indaga il "perché" 2-3 volte.** Dietro una richiesta c'è quasi sempre un problema
  diverso da quello dichiarato.

## Sezioni

### A. Contesto e numeri (inquadramento)
- Quanti ombrelloni/postazioni? Come è organizzata la spiaggia (file, settori)?
- Quanto dura la stagione? Quante persone ci lavorano?
- *Serve a:* dimensionare il problema e i dati.

### B. Come gestiscono oggi
- Con cosa gestisci prenotazioni e incassi *oggi*? (carta, Excel, un software? quale?)
- Cosa ti fa perdere più tempo? Cosa ti fa imbestialire della soluzione attuale?
- Se usi un software: cosa ti tieni, cosa butteresti?
- *Assunzione:* esiste un dolore reale che un gestionale risolve. **Smentita se** sono
  perfettamente felici della carta/Excel e non perdono tempo né soldi.

### C. Abbonamenti *(cuore economico — ADR-0006, ADR-0012)*
- Che quota del fatturato sono gli abbonamenti vs i giornalieri?
- Come funziona il **rinnovo** di chi era abbonato l'anno prima? Tieni il posto? Fino a
  quando? Come decidi le precedenze (anzianità)?
- Come gestisci acconto e saldo?
- *Assunzioni:* abbonamento = posto fisso stagionale; rinnovo+storico ad alto valore
  (ADR-0012); acconto/saldo basta come stato (ADR-0011). **Smentita se** la prelazione
  automatica è indispensabile da subito → rivaluta D-011.

### D. Prenotazioni e fasce *(ADR-0006, ADR-0013)*
- Vendi mai a **mezza giornata** (mattina/pomeriggio)? Quanto spesso?
- Le giornaliere sono più walk-in o prenotate in anticipo?
- *Assunzione:* slot a giornata intera + mezza giornata coprono tutto (ADR-0013).
  **Smentita se** servono davvero fasce a ore → rivaluta D-015.

### E. Mappa e struttura *(ADR-0005, ADR-0014)*
- Com'è fatta la spiaggia? File tutte uguali o irregolari, settori, spazi, cabine?
- Quando riorganizzi la pianta, quanto è un problema?
- Ti serve una pianta *fedele alla realtà* (planimetria) o basta una griglia logica
  chiara?
- *Assunzione:* modello logico settori/file basta per l'MVP; planimetria dopo (D-005).
  **Smentita se** la planimetria fedele è un requisito d'acquisto → rivaluta D-005.

### F. Prezzi *(ADR-0006)*
- Da cosa dipende il prezzo? (prima fila, settore, periodo dell'anno, pacchetto…)
- Hai alta/bassa stagione, weekend, promozioni?
- *Assunzione:* listino a regole multi-dimensione. **Smentita se** emergono regole che
  il modello {tipo, posizione, pacchetto, fascia, periodo} non rappresenta.

### G. Incassi e fiscale *(ADR-0011, D-004)*
- Come incassi (contanti/POS)? Emetti scontrino/ricevuta? Come?
- Quanto è un problema la parte fiscale (corrispettivi telematici)?
- *Assunzione:* incasso base in MVP, cassa completa+fiscale dopo. **Smentita se** senza
  scontrino fiscale integrato non comprerebbero → anticipa parte di D-004.

### H. Cabine e servizi accessori *(D-012)*
- Affitti cabine / posti auto / altro insieme all'ombrellone? Quanto pesano?
- *Assunzione:* cabine rimandate. **Smentita se** l'abbonamento è quasi sempre
  ombrellone+cabina → valuta di anticipare D-012.

### I. Personale e turni *(D-014)*
- Come organizzi i turni dei bagnini/staff? Con un software? Ti servirebbe?
- *Assunzione:* fuori MVP. **Smentita se** è un dolore forte e ricorrente → rivaluta D-014.

### J. Dispositivi e connettività *(ADR-0004, D-008)*
- Da dove lavorate: postazione fissa, tablet in spiaggia, telefono?
- Com'è la **connettività** in spiaggia? Capita di restare senza rete?
- *Assunzione:* web+PWA desktop+tablet, offline-light. **Smentita se** la rete manca
  spesso e serve vero offline → alza la priorità di D-008.

### K. Booking online *(modulo 4)*
- I tuoi clienti ti chiedono di prenotare online da soli? Lo faresti?
- *Serve a:* capire quando vale la pena del modulo 4 (oggi rimandato).

### L. Disponibilità a pagare
- Quanto spendi oggi per gestire tutto questo (software, tempo, errori)?
- Quanto pagheresti per uno strumento che risolve i problemi che mi hai detto?
- *Serve a:* validare il modello SaaS a pagamento.

## Dopo l'intervista — come usare i risultati

1. **Conferma** di un'assunzione → l'ADR resta valido (annota la prova nel diario).
2. **Smentita** → apri un **nuovo ADR** che *supersede* quello vecchio (mai cancellare),
   con la motivazione emersa.
3. **Nuovo bisogno fuori scope** → voce in [deferred.md](../architecture/deferred.md) o,
   se è MVP-critico, aggiorna lo [spec del Core](../specs/2026-06-27-core-operativo-design.md).
4. Tieni un breve **diario delle interviste** (chi, quando, citazioni testuali, sorprese).

> Regola d'oro: cerca attivamente di **falsificare** le tue assunzioni. Un'intervista
> che conferma tutto, di solito, è stata condotta male.
