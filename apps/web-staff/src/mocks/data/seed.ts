import type { MappaGiornoDTO } from '@driftly/contracts';

export const mappaSeed: MappaGiornoDTO = {
  data: '2026-06-27',
  tipologie: [
    { id: 't-mini', nome: 'Mini-palma', ordine: 1, icona: 'leaf' },
    { id: 't-palma', nome: 'Palma', ordine: 2, icona: 'palmtree' },
  ],
  fasce: [
    { id: 'f-mat', nome: 'Mattina', ordine: 1 },
    { id: 'f-pom', nome: 'Pomeriggio', ordine: 2 },
  ],
  settori: [
    {
      id: 's-centro', nome: 'Centro', ordine: 1,
      file: [
        {
          id: 'fila-1', etichetta: 'Fila 1', ordine: 1,
          ombrelloni: [
            { id: 'o-1', etichetta: '1', tipologiaId: 't-mini', filaId: 'fila-1', statoPerFascia: { 'f-mat': 'giornaliero', 'f-pom': 'giornaliero' } },
            { id: 'o-2', etichetta: '2', tipologiaId: 't-mini', filaId: 'fila-1', statoPerFascia: { 'f-mat': 'libero', 'f-pom': 'libero' } },
            { id: 'o-8', etichetta: '8', tipologiaId: null, filaId: 'fila-1', statoPerFascia: { 'f-mat': 'prenotato', 'f-pom': 'libero' } },
          ],
        },
      ],
    },
    {
      id: 's-speciali', nome: 'Speciali', ordine: 99,
      file: [
        {
          id: 'fila-palme', etichetta: 'Palme', ordine: 1,
          ombrelloni: [
            { id: 'o-p1', etichetta: 'P1', tipologiaId: 't-palma', filaId: 'fila-palme', statoPerFascia: { 'f-mat': 'abbonato', 'f-pom': 'abbonato' } },
          ],
        },
      ],
    },
  ],
};
