import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, enableAutoUnmount } from '@vue/test-utils';
import type { StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';
import { mountApp, selectOption } from '@/test/utils';
import UmbrellaPanel from './UmbrellaPanel.vue';

enableAutoUnmount(afterEach);

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const umb = (id: string) => ({ id, label: id, umbrellaTypeId: null });

// Fixture inline, come fanno le cinque spec sorelle della struttura: STRUCTURE_FIXTURE ha una fila
// sola e due spec ne asseriscono i contatori, quindi estenderla arrosserebbe test estranei.
const SECTORS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('B'), umb('C')] },
    { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [umb('D')] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [
    { id: 'r-3', label: 'Palme', sortOrder: 1, umbrellas: [] },
  ] },
];
const row = (id: string): StructureRowDTO => SECTORS.flatMap((s) => s.rows).find((r) => r.id === id)!;

type Props = InstanceType<typeof UmbrellaPanel>['$props'];

async function panel(over: Partial<Props> = {}) {
  const w = mountApp(UmbrellaPanel, { props: {
    umbrella: umb('B'), row: row('r-1'), sector: SECTORS[0], sectors: SECTORS,
    types: [], canManage: true, movePending: false, ...over,
  }, attachTo: document.body });
  await settle();
  return w;
}

const submit = (w: Awaited<ReturnType<typeof panel>>) => w.get('[data-testid="umbrella-move-submit"]');
const isDisabled = (w: Awaited<ReturnType<typeof panel>>) => (submit(w).element as HTMLButtonElement).disabled;

describe('UmbrellaPanel — «Sposta in…» (D-071)', () => {
  it('offre le file compatibili, la propria compresa, e NON quelle di un kind diverso', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    // «Speciali · Palme» non è fra le opzioni: selezionarla lancia, ed è l'asserzione.
    await expect(selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Speciali · Palme'))
      .rejects.toThrow('non trovata');
    w.unmount();
  });

  it('all’apertura mostra dove l’ombrellone È, e il bottone è spento', async () => {
    const w = await panel();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('Prima di «C»');
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });

  it('riordino DENTRO la propria fila: emette l’indice FINALE, senza contare sé stesso', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
    expect(isDisabled(w)).toBe(false);
    await submit(w).trigger('click');
    // «senza» = [A, C]: la coda è 2, non 3.
    expect(w.emitted('move')).toEqual([['r-1', 2]]);
    w.unmount();
  });

  it('cambiando fila la posizione torna in coda, e l’emit porta la fila nuova', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F2');
    // ⚠️ Il caso in cui i due numeri COINCIDONO: la coda di r-1 senza B è 2, quella di r-2 senza B
    // è 1, e `positionRef` era già '1' (posizione attuale di B in r-1). Il modelValue quindi non
    // cambia, e senza il `:key` sul Select reka-ui continuerebbe a mostrare l'etichetta vecchia —
    // «Prima di «C»», un ombrellone che in r-2 non c'è. Valore giusto, etichetta che mente.
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('In coda');
    await submit(w).trigger('click');
    expect(w.emitted('move')).toEqual([['r-2', 1]]); // r-2 contiene solo D: la coda è 1
    w.unmount();
  });

  it('una posizione uscita dall’intervallo dopo una rilettura ricade sulla coda, e sulla coda NUOVA', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda'); // position 2, «senza» = [A, C]
    // Rilettura: la fila si è accorciata sotto i piedi. I pannelli non sono key-ati e ricevono
    // props nuove a ogni invalidazione (form-sync.spec.ts).
    const magra: StructureRowDTO = { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('B'), umb('C')] };
    await w.setProps({ row: magra, sectors: [{ ...SECTORS[0], rows: [magra, row('r-2')] }, SECTORS[1]] });
    await settle();
    await submit(w).trigger('click');
    // ⚠️ L'asserzione è sull'EMIT e non sul testo: «In coda» si legge identico sia che il valore
    // memorizzato sia stato trovato, sia che ci si sia ricaduti sopra — un'asserzione sul testo
    // passerebbe per la ragione sbagliata. «senza» è ora [C], quindi la coda vale 1: senza il
    // ripiego partirebbe il 2 memorizzato, e il server risponderebbe 422.
    expect(w.emitted('move')).toEqual([['r-1', 1]]);
    w.unmount();
  });

  it('cambiando ombrellone il controllo riparte da dove sta il NUOVO, non da vuoto', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    await w.setProps({ umbrella: umb('D'), row: row('r-2') });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F2');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('In coda');
    expect(isDisabled(w)).toBe(true); // D è già l'unico di r-2: la coda è dove sta
    w.unmount();
  });

  it('senza permesso di gestione il controllo non si rende affatto', async () => {
    const w = await panel({ canManage: false });
    expect(w.find('[data-testid="umbrella-move"]').exists()).toBe(false);
    w.unmount();
  });

  it('mentre una scrittura è in volo il bottone resta spento, anche se la scelta è cambiata', async () => {
    const w = await panel({ movePending: true });
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });
});
