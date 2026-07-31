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
    // è 1, e la posizione mostrata era già '1' (posizione attuale di B in r-1). Il modelValue non
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

  it('cambiando ombrellone il controllo riparte da dove sta il NUOVO, scartando la scelta in corso', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    // ⚠️ Il nuovo ombrellone sta in r-1, NON in r-2: se la scelta non venisse scartata il controllo
    // resterebbe su «Centro · F2». Passare a un ombrellone di r-2 renderebbe l'asserzione cieca —
    // la scelta vecchia e la fila nuova coinciderebbero, e il test passerebbe comunque. È il difetto
    // che la review avversariale ha trovato in questo stesso test.
    await w.setProps({ umbrella: umb('A'), row: row('r-1') });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('Prima di «B»');
    expect(isDisabled(w)).toBe(true); // A è già in testa a r-1: è dove sta
    w.unmount();
  });

  it('se la fila scelta esce dall’albero il controllo torna su quella corrente, senza offrire un rowId morto', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    // Un collega elimina «F2» mentre era selezionata come destinazione.
    await w.setProps({ sectors: [{ ...SECTORS[0], rows: [row('r-1')] }, SECTORS[1]] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    // E il bottone non propone di scrivere su una fila che non esiste più.
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });

  /**
   * ⚠️ Review avversariale del 2026-07-31. L'ombrellone può cambiare posto **senza cambiare id**:
   * lo trascina l'operatore stesso a `lg+`, oppure lo sposta un collega da un'altra postazione. Il
   * pannello resta montato con la stessa selezione e riceve solo props nuove, quindi un reset legato
   * al solo `umbrella.id` non parte — e il controllo continua a puntare dove l'ombrellone NON è più,
   * col bottone acceso su un ritorno indietro.
   */
  it('spostato in un’altra fila da fuori: il controllo segue, e non propone di riportarlo indietro', async () => {
    const w = await panel();
    // Dopo un trascinamento di B da r-1 a r-2: l'id non cambia, la fila sì.
    const r1 = { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('C')] };
    const r2 = { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [umb('D'), umb('B')] };
    await w.setProps({ row: r2, sectors: [{ ...SECTORS[0], rows: [r1, r2] }, SECTORS[1]] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F2');
    // B è in coda a r-2: è dove sta, quindi non c'è nulla da spostare.
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });

  it('spostato DENTRO la propria fila da fuori: segue anche quando la fila non cambia', async () => {
    const w = await panel();
    // B trascinato dall'indice 1 alla coda: `row.id` è identico, cambia solo l'indice. È il caso che
    // un reset legato alla sola fila non vedrebbe.
    const r1 = { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('C'), umb('B')] };
    await w.setProps({ row: r1, sectors: [{ ...SECTORS[0], rows: [r1, row('r-2')] }, SECTORS[1]] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('In coda');
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });

  it('una scelta in corso NON viene azzerata da una rilettura che non sposta nulla', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    // Rilettura innocua: stessi contenuti, oggetti nuovi (è ciò che accade a ogni invalidazione).
    await w.setProps({ row: { ...row('r-1'), umbrellas: [...row('r-1').umbrellas] }, sectors: [...SECTORS] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F2');
    w.unmount();
  });

  /**
   * ⚠️ Review finale d'insieme del 2026-07-31. Il ripiego sulla fila corrente non basta se la
   * POSIZIONE scelta per l'altra fila sopravvive: si applica alla fila corrente, e il bottone si
   * arma su una destinazione che l'operatore non ha mai chiesto. L'intenzione vale come un blocco.
   */
  it('se la fila scelta esce dall’albero cade anche la posizione scelta per quella fila', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'Prima di «D»'); // position 0 di r-2
    // Un collega elimina «F2». Senza la caduta in blocco, quello 0 verrebbe riletto sulla fila
    // d'ORIGINE — «Prima di «A»» — e il bottone si armerebbe su uno spostamento mai chiesto.
    await w.setProps({ sectors: [{ ...SECTORS[0], rows: [row('r-1')] }, SECTORS[1]] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    expect(w.get('[data-testid="umbrella-move-position"]').text()).toContain('Prima di «C»'); // dove B sta
    expect(isDisabled(w)).toBe(true);
    w.unmount();
  });

  it('dopo l’invio il bottone si spegne subito, senza aspettare che la rilettura atterri', async () => {
    const w = await panel();
    await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Centro · F2');
    await submit(w).trigger('click');
    // Finestra fra la risposta del POST e l'atterraggio della rilettura: l'albero dice ancora r-1.
    // Senza il consumo dell'intenzione il bottone resterebbe acceso e un secondo clic rispedirebbe
    // lo stesso spostamento, riaprendo la disclosure sul prezzo appena confermata.
    expect(isDisabled(w)).toBe(true);
    await submit(w).trigger('click');
    expect(w.emitted('move')).toHaveLength(1);
    w.unmount();
  });

  /**
   * ⚠️ Review finale d'insieme: dei tre `Select` del pannello solo quello della posizione porta il
   * `:key`. Il `Select` della fila ha la stessa esposizione — le sue etichette vengono da `targets`,
   * che cambia quando un settore o una fila viene rinominata — quindi il registro valore→testo di
   * reka-ui può restare indietro allo stesso modo.
   */
  it('rinominando la fila corrente il Select della destinazione mostra il nome NUOVO', async () => {
    const w = await panel();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1');
    const rinominata = { ...row('r-1'), label: 'F1-bis' };
    await w.setProps({ row: rinominata, sectors: [{ ...SECTORS[0], rows: [rinominata, row('r-2')] }, SECTORS[1]] });
    await settle();
    expect(w.get('[data-testid="umbrella-move-row"]').text()).toContain('Centro · F1-bis');
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
