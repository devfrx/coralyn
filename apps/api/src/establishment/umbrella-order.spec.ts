import { planUmbrellaMove, type UmbrellaMovePlan } from './umbrella-order';

interface Slot { id: string; order: number }

/**
 * Riproduce fedelmente le due scritture del service: l'`updateMany` colpisce TUTTA la fila di
 * destinazione nell'intervallo (non esclude per id, come in `umbrellas.service.ts`), poi l'`update`
 * colloca l'ombrellone spostato. Serve a provare l'ESITO — la sequenza finale — e non la forma
 * degli argomenti: un fuori-di-uno negli estremi passerebbe un'asserzione sui numeri e non questa.
 */
function applyPlan(destRow: Slot[], moved: Slot, plan: UmbrellaMovePlan): Slot[] {
  if (!plan.ok) throw new Error('piano non applicabile: OUT_OF_RANGE');
  const after = destRow.map((s) => ({ ...s }));
  if (plan.write === null) return after;
  const { shift, targetOrder } = plan.write;
  if (shift) {
    for (const s of after) {
      if (s.order >= shift.fromOrder && s.order <= shift.toOrder) s.order += shift.delta;
    }
  }
  const already = after.find((s) => s.id === moved.id);
  if (already) already.order = targetOrder;
  else after.push({ id: moved.id, order: targetOrder });
  return after;
}

/** Ordine percepito dal prodotto: le proiezioni ordinano per `logicalOrder asc` e scartano il valore. */
function sequence(slots: Slot[]): string[] {
  return [...slots].sort((a, b) => a.order - b.order).map((s) => s.id);
}

function expectNoDuplicateOrders(slots: Slot[]): void {
  expect(new Set(slots.map((s) => s.order)).size).toBe(slots.length);
}

/** Riordino atteso: `position` è l'indice FINALE dell'elemento spostato. */
function arrayMove(ids: string[], from: number, to: number): string[] {
  const out = [...ids];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

function slots(ids: string[], orders: number[]): Slot[] {
  return ids.map((id, i) => ({ id, order: orders[i] }));
}

describe('planUmbrellaMove', () => {
  describe('posizione fuori intervallo', () => {
    it.each([
      ['negativa', -1],
      ['oltre la coda', 4],
      ['non intera', 1.5],
    ])('%s → OUT_OF_RANGE', (_label, position) => {
      expect(planUmbrellaMove({ destOrders: [1, 2, 3], position, currentOrder: null }))
        .toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
    });

    it('nella stessa fila il limite tiene conto che l’ombrellone è già dentro', () => {
      // Fila di 3 con l’ombrellone incluso → `destOrders` ne ha 2, e l’indice finale massimo è 2.
      expect(planUmbrellaMove({ destOrders: [1, 3], position: 2, currentOrder: 2 }).ok).toBe(true);
      expect(planUmbrellaMove({ destOrders: [1, 3], position: 3, currentOrder: 2 }))
        .toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
    });
  });

  describe('fra file diverse', () => {
    it('fila di destinazione vuota → primo ordine, nessuna traslazione', () => {
      expect(planUmbrellaMove({ destOrders: [], position: 0, currentOrder: null }))
        .toEqual({ ok: true, write: { shift: null, targetOrder: 1 } });
    });

    it('in coda → max+1, nessuna traslazione (stessa convenzione di nextLogicalOrder)', () => {
      expect(planUmbrellaMove({ destOrders: [5, 9, 40], position: 3, currentOrder: null }))
        .toEqual({ ok: true, write: { shift: null, targetOrder: 41 } });
    });

    it('in testa → tutta la fila avanza di uno e libera il primo ordine', () => {
      expect(planUmbrellaMove({ destOrders: [5, 9, 40], position: 0, currentOrder: null }))
        .toEqual({ ok: true, write: { shift: { fromOrder: 5, toOrder: 40, delta: 1 }, targetOrder: 5 } });
    });

    it('in mezzo → avanza solo la coda dell’intervallo', () => {
      expect(planUmbrellaMove({ destOrders: [5, 9, 40], position: 1, currentOrder: null }))
        .toEqual({ ok: true, write: { shift: { fromOrder: 9, toOrder: 40, delta: 1 }, targetOrder: 9 } });
    });
  });

  describe('dentro la stessa fila', () => {
    it('posizione già occupata → no-op calcolato, nessuna scrittura', () => {
      expect(planUmbrellaMove({ destOrders: [1, 3], position: 1, currentOrder: 2 }))
        .toEqual({ ok: true, write: null });
    });

    it('unico ombrellone della fila → no-op', () => {
      expect(planUmbrellaMove({ destOrders: [], position: 0, currentOrder: 7 }))
        .toEqual({ ok: true, write: null });
    });

    it('in avanti → gli scavalcati ARRETRANO e liberano l’estremo alto', () => {
      // [A@1, B@5, C@9], si sposta A all’indice finale 2.
      expect(planUmbrellaMove({ destOrders: [5, 9], position: 2, currentOrder: 1 }))
        .toEqual({ ok: true, write: { shift: { fromOrder: 5, toOrder: 9, delta: -1 }, targetOrder: 9 } });
    });

    it('indietro → gli scavalcati AVANZANO e liberano l’estremo basso', () => {
      // [A@1, B@5, C@9], si sposta C all’indice finale 0.
      expect(planUmbrellaMove({ destOrders: [1, 5], position: 0, currentOrder: 9 }))
        .toEqual({ ok: true, write: { shift: { fromOrder: 1, toOrder: 5, delta: 1 }, targetOrder: 1 } });
    });
  });

  // Le asserzioni sopra fissano la FORMA del piano; queste ne provano l'ESITO su ogni coppia
  // (origine, destinazione), che è dove vive il fuori-di-uno. Gli ordini sparsi non sono un caso
  // di scuola: uno spostamento fra file lascia buchi nella fila d'origine, e da lì in poi ogni
  // spostamento successivo parte da una fila sparsa.
  describe('esito su tutte le coppie di indici', () => {
    const IDS = ['A', 'B', 'C', 'D'];
    const SHAPES: Array<[string, number[]]> = [
      ['ordini densi', [1, 2, 3, 4]],
      ['ordini sparsi', [5, 9, 40, 41]],
      ['ordini sparsi che non partono da 1', [12, 13, 90, 200]],
    ];

    describe.each(SHAPES)('%s', (_label, orders) => {
      it('stessa fila: ogni (da, a) produce la sequenza di un array-move', () => {
        for (let from = 0; from < IDS.length; from++) {
          for (let to = 0; to < IDS.length; to++) {
            const row = slots(IDS, orders);
            const moved = row[from];
            const plan = planUmbrellaMove({
              destOrders: row.filter((s) => s.id !== moved.id).map((s) => s.order),
              position: to,
              currentOrder: moved.order,
            });
            const after = applyPlan(row, moved, plan);
            expect({ from, to, seq: sequence(after) }).toEqual({ from, to, seq: arrayMove(IDS, from, to) });
            expectNoDuplicateOrders(after);
          }
        }
      });

      it('fila diversa: ogni destinazione inserisce l’ombrellone al posto giusto', () => {
        const DEST = IDS.slice(0, 3);
        for (let to = 0; to <= DEST.length; to++) {
          const row = slots(DEST, orders.slice(0, 3));
          const moved: Slot = { id: 'M', order: 999 }; // ordine della fila d'origine: irrilevante
          const plan = planUmbrellaMove({
            destOrders: row.map((s) => s.order),
            position: to,
            currentOrder: null,
          });
          const after = applyPlan(row, moved, plan);
          const expected = [...DEST];
          expected.splice(to, 0, 'M');
          expect({ to, seq: sequence(after) }).toEqual({ to, seq: expected });
          expectNoDuplicateOrders(after);
        }
      });
    });
  });
});
