# Flussi principali del Core

Fonte di verità dei flussi operativi. Vedi
[ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md).

## 1. Setup iniziale (admin dello stabilimento)

```mermaid
flowchart TD
    A[Crea Stabilimento] --> B[Definisci Settori e File]
    B --> C[Genera Ombrelloni nelle File]
    C --> D[Definisci Pacchetti<br/>dotazione personalizzabile]
    D --> E[Crea Stagione]
    E --> F[Crea Listino della Stagione]
    F --> G[Inserisci Tariffe<br/>tipo x posizione x pacchetto x periodo]
    G --> H[Pronto all'operativo]
```

## 2. Operativo giornaliero (staff)

```mermaid
flowchart TD
    S[Seleziona data] --> M[Mappa colora gli stati<br/>libero/abbonato/giornaliero/prenotato]
    M --> K[Clic su Ombrellone]
    K --> D[Drawer contestuale]
    D --> A{Azione}
    A -->|Nuova prenotazione| P1[Scegli/crea Cliente]
    P1 --> P2[Scegli Pacchetto + periodo]
    P2 --> P3[Pricing engine calcola il prezzo]
    P3 --> P4{Ombrellone libero<br/>nel periodo?}
    P4 -->|Sì| P5[Conferma Prenotazione]
    P4 -->|No| W[Proponi Lista d'attesa]
    A -->|Assegna abbonamento| AB[Cliente + Ombrellone<br/>per l'intera Stagione]
    A -->|Registra presenza| RP[Aggiorna stato del giorno]
```

## 3. Stati della Prenotazione

```mermaid
stateDiagram-v2
    [*] --> Bozza
    Bozza --> Confermata: conferma
    Bozza --> Annullata: scarta
    Confermata --> Annullata: annulla
    Confermata --> Conclusa: fine periodo
    Annullata --> [*]
    Conclusa --> [*]
```

> Nota: lo stato "opzione/hold" temporaneo con scadenza automatica è rimandato
> ([D-006](../architecture/deferred.md)); nell'MVP la Lista d'attesa è promossa
> manualmente a Prenotazione.
