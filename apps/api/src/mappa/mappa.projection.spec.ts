import { proiettaMappaGiorno, risolviData, type MappaSorgente } from './mappa.projection';

const sorgente: MappaSorgente = {
  tipologie: [{ id: 't1', stabilimentoId: 's', nome: 'Palma', ordine: 2, icona: 'palmtree' }],
  fasce: [
    { id: 'f1', stabilimentoId: 's', nome: 'Mattina', oraInizio: new Date(), oraFine: new Date(), ordine: 1 },
    { id: 'f2', stabilimentoId: 's', nome: 'Pomeriggio', oraInizio: new Date(), oraFine: new Date(), ordine: 2 },
  ],
  settori: [
    {
      id: 'set1',
      stabilimentoId: 's',
      nome: 'Centro',
      ordine: 1,
      file: [
        {
          id: 'fila1',
          stabilimentoId: 's',
          settoreId: 'set1',
          etichetta: 'Fila 1',
          ordine: 1,
          ombrelloni: [
            { id: 'o1', stabilimentoId: 's', filaId: 'fila1', tipologiaId: 't1', etichetta: '1', ordineLogico: 1, posizionePresentazione: null },
            { id: 'o2', stabilimentoId: 's', filaId: 'fila1', tipologiaId: null, etichetta: '2', ordineLogico: 2, posizionePresentazione: null },
          ],
        },
      ],
    },
  ],
};

describe('proiettaMappaGiorno', () => {
  it('echeggia la data e proietta tipologie/fasce/settori', () => {
    const dto = proiettaMappaGiorno('2026-07-15', sorgente);
    expect(dto.data).toBe('2026-07-15');
    expect(dto.tipologie).toEqual([{ id: 't1', nome: 'Palma', ordine: 2, icona: 'palmtree' }]);
    expect(dto.fasce).toEqual([
      { id: 'f1', nome: 'Mattina', ordine: 1 },
      { id: 'f2', nome: 'Pomeriggio', ordine: 2 },
    ]);
    expect(dto.settori[0].file[0].ombrelloni).toHaveLength(2);
  });

  it('mette ogni ombrellone a `libero` per ogni fascia (chiavi = id fasce)', () => {
    const dto = proiettaMappaGiorno('2026-07-15', sorgente);
    const o = dto.settori[0].file[0].ombrelloni[0];
    expect(o.statoPerFascia).toEqual({ f1: 'libero', f2: 'libero' });
    expect(o.tipologiaId).toBe('t1');
    expect(dto.settori[0].file[0].ombrelloni[1].tipologiaId).toBeNull();
  });

  it('risolviData: echeggia se fornita, default oggi se assente', () => {
    expect(risolviData('2026-07-15')).toBe('2026-07-15');
    const oggi = risolviData(undefined);
    expect(oggi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(oggi).toBe(new Date().toISOString().slice(0, 10));
  });
});
