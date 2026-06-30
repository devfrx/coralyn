import type { Fascia, Fila, Ombrellone, Settore, Tipologia } from '@prisma/client';
import type {
  FasciaDTO,
  MappaGiornoDTO,
  OmbrelloneDTO,
  SettoreDTO,
  StatoSlot,
  TipologiaDTO,
} from '@coralyn/contracts';

type FilaConOmbrelloni = Fila & { ombrelloni: Ombrellone[] };
type SettoreConFile = Settore & { file: FilaConOmbrelloni[] };

/** Struttura caricata da DB (output delle query `forTenant`). */
export interface MappaSorgente {
  tipologie: Tipologia[];
  fasce: Fascia[];
  settori: SettoreConFile[];
}

/** Data effettiva: quella richiesta o, se assente, oggi (ISO yyyy-mm-dd, UTC). */
export function risolviData(data?: string): string {
  return data ?? new Date().toISOString().slice(0, 10);
}

/**
 * Proietta la struttura mappa nel DTO condiviso con la FE.
 *
 * CONFINE D'INCREMENTO: `statoPerFascia` è `libero` per OGNI fascia in questo slice.
 * La derivazione reale (abbonato/giornaliero/prenotato) arriverà con le prenotazioni,
 * che renderanno questa proiezione slot-aware. Non inventare altri stati qui.
 */
export function proiettaMappaGiorno(data: string, sorgente: MappaSorgente): MappaGiornoDTO {
  const fasce: FasciaDTO[] = sorgente.fasce.map((f) => ({ id: f.id, nome: f.nome, ordine: f.ordine }));
  const tipologie: TipologiaDTO[] = sorgente.tipologie.map((t) => ({
    id: t.id,
    nome: t.nome,
    ordine: t.ordine,
    icona: t.icona ?? undefined,
  }));
  const statoLibero: Record<string, StatoSlot> = Object.fromEntries(
    fasce.map((f) => [f.id, 'libero' as StatoSlot]),
  );
  const settori: SettoreDTO[] = sorgente.settori.map((s) => ({
    id: s.id,
    nome: s.nome,
    ordine: s.ordine,
    file: s.file.map((f) => ({
      id: f.id,
      etichetta: f.etichetta,
      ordine: f.ordine,
      ombrelloni: f.ombrelloni.map(
        (o): OmbrelloneDTO => ({
          id: o.id,
          etichetta: o.etichetta,
          tipologiaId: o.tipologiaId,
          filaId: o.filaId,
          statoPerFascia: { ...statoLibero },
        }),
      ),
    })),
  }));
  return { data, tipologie, fasce, settori };
}
