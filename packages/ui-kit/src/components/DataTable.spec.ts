import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DataTable from './DataTable.vue';

const columns = [
  { key: 'nome', label: 'Nome' },
  { key: 'eta', label: 'Età', align: 'right' as const, numeric: true },
];
const rows = [
  { id: 'r1', nome: 'Mario', eta: 40 },
  { id: 'r2', nome: 'Anna', eta: 32 },
];

describe('DataTable — retro-compatibilità (API a slot esistente)', () => {
  it('senza rows, il body resta uno slot: il markup passato a mano è invariato', () => {
    const w = mount(DataTable, {
      props: { columns },
      slots: { default: '<tr class="riga-custom"><td class="cella-custom">X</td></tr>' },
    });
    expect(w.find('tr.riga-custom').exists()).toBe(true);
    expect(w.find('td.cella-custom').text()).toBe('X');
  });

  it('header invariato: classi standard sulle <th>', () => {
    const w = mount(DataTable, { props: { columns } });
    const ths = w.findAll('th');
    expect(ths[0].classes()).toEqual(expect.arrayContaining(['text-left']));
    expect(ths[1].classes()).toEqual(expect.arrayContaining(['text-right']));
  });

  it('avvolge la tabella in una regione con scroll orizzontale, preservando il radius sul contenitore', () => {
    const w = mount(DataTable, { props: { columns } });
    const scroll = w.find('div.overflow-x-auto');
    expect(scroll.exists()).toBe(true);
    expect(scroll.find('table').exists()).toBe(true);
    // il contenitore esterno mantiene radius + clip degli angoli
    expect(w.find('div.overflow-hidden').exists()).toBe(true);
  });
});

describe('DataTable — modalità data-driven (rows/rowKey)', () => {
  it('con rows, genera un <tr> per riga con hover:bg standard e i <td> con le classi cella', () => {
    const w = mount(DataTable, { props: { columns, rows, rowKey: (r: Record<string, unknown>) => r.id as string } });
    const trs = w.findAll('tbody tr');
    expect(trs).toHaveLength(2);
    expect(trs[0].classes()).toEqual(expect.arrayContaining(['hover:bg-[var(--color-raised)]']));
    expect(trs[0].text()).toContain('Mario');
    expect(trs[1].text()).toContain('Anna');
  });

  it('cella default: usa row[column.key], px-[18px] sulla prima colonna, tabular-nums se column.numeric', () => {
    const w = mount(DataTable, { props: { columns, rows, rowKey: (r: Record<string, unknown>) => r.id as string } });
    const firstRowCells = w.findAll('tbody tr')[0].findAll('td');
    expect(firstRowCells[0].classes()).toEqual(expect.arrayContaining(['px-[18px]']));
    expect(firstRowCells[1].classes()).toEqual(expect.arrayContaining(['tabular-nums', 'text-right']));
  });

  it('cella custom: slot #cell-<key> sostituisce il contenuto default per quella colonna', () => {
    const w = mount(DataTable, {
      props: { columns, rows, rowKey: (r: Record<string, unknown>) => r.id as string },
      slots: { 'cell-nome': `<template #cell-nome="{ row }"><b class="custom">{{ row.nome.toUpperCase() }}</b></template>` },
    });
    expect(w.find('td b.custom').text()).toBe('MARIO');
  });
});

describe('DataTable — colonne estese e densità', () => {
  const rowsX = [{ id: 'r1', nome: 'Mario', note: 'nota lunga' }];
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('numeric implica whitespace-nowrap', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N', numeric: true }], rows: rowsX, rowKey: rk } });
    expect(w.find('tbody td').classes()).toEqual(expect.arrayContaining(['tabular-nums', 'whitespace-nowrap']));
  });

  it('wrap nowrap / truncate: classi, maxWidth come style, title col testo pieno', () => {
    const w = mount(DataTable, {
      props: {
        columns: [
          { key: 'nome', label: 'N', wrap: 'nowrap' },
          { key: 'note', label: 'Note', wrap: 'truncate', maxWidth: '280px' },
        ],
        rows: rowsX, rowKey: rk,
      },
    });
    const tds = w.findAll('tbody td');
    expect(tds[0].classes()).toContain('whitespace-nowrap');
    expect(tds[1].classes()).toContain('truncate');
    expect(tds[1].attributes('style')).toContain('max-width: 280px');
    expect(tds[1].attributes('title')).toBe('nota lunga');
  });

  it('cella truncate resa via slot: nessun title automatico', () => {
    const w = mount(DataTable, {
      props: { columns: [{ key: 'note', label: 'Note', wrap: 'truncate' }], rows: rowsX, rowKey: rk },
      slots: { 'cell-note': '<template #cell-note="{ row }"><i>{{ row.note }}</i></template>' },
    });
    expect(w.find('tbody td').attributes('title')).toBeUndefined();
  });

  it('hideBelow mappa su classi responsive statiche su th e td', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N', hideBelow: 'md' }], rows: rowsX, rowKey: rk } });
    expect(w.find('th').classes()).toContain('max-md:hidden');
    expect(w.find('tbody td').classes()).toContain('max-md:hidden');
  });

  it('density compact: py-2 al posto di py-3.5 nelle celle', () => {
    const w = mount(DataTable, { props: { columns: [{ key: 'nome', label: 'N' }], rows: rowsX, rowKey: rk, density: 'compact' } });
    expect(w.find('tbody td').classes()).toContain('py-2');
    expect(w.find('tbody td').classes()).not.toContain('py-3.5');
  });
});

describe('DataTable — ordinamento', () => {
  const sortCols = [{ key: 'nome', label: 'Nome', sortable: true }, { key: 'eta', label: 'Età', numeric: true }];
  const sortRows3 = [
    { id: 'r1', nome: 'Mario', eta: 40 },
    { id: 'r2', nome: 'Anna', eta: 32 },
    { id: 'r3', nome: 'Luca', eta: 28 },
  ];
  const rk = (r: Record<string, unknown>) => r.id as string;
  const names = (w: ReturnType<typeof mount>) => w.findAll('tbody tr').map((tr) => tr.findAll('td')[0].text());

  it('click sull\'header cicla asc → desc → ordine originale, con aria-sort', async () => {
    const w = mount(DataTable, { props: { columns: sortCols, rows: sortRows3, rowKey: rk } });
    const btn = w.find('th button');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(names(w)).toEqual(['Anna', 'Luca', 'Mario']);
    expect(w.find('th').attributes('aria-sort')).toBe('ascending');
    await btn.trigger('click');
    expect(names(w)).toEqual(['Mario', 'Luca', 'Anna']);
    expect(w.find('th').attributes('aria-sort')).toBe('descending');
    await btn.trigger('click');
    expect(names(w)).toEqual(['Mario', 'Anna', 'Luca']);
    expect(w.find('th').attributes('aria-sort')).toBeUndefined();
  });

  it('sortValue accessor usato al posto di row[key]', async () => {
    const cols = [{ key: 'nome', label: 'Nome', sortable: true, sortValue: (r: Record<string, unknown>) => r.eta as number }];
    const w = mount(DataTable, { props: { columns: cols, rows: sortRows3, rowKey: rk } });
    await w.find('th button').trigger('click');
    expect(names(w)).toEqual(['Luca', 'Anna', 'Mario']); // per età: 28, 32, 40
  });

  it('header non sortable: nessun button', () => {
    const w = mount(DataTable, { props: { columns: sortCols, rows: sortRows3, rowKey: rk } });
    expect(w.findAll('th')[1].find('button').exists()).toBe(false);
  });
});

describe('DataTable — paginazione e footer', () => {
  const cols1 = [{ key: 'n', label: 'N' }];
  const rows30 = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, n: `riga-${i}` }));
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('pageSize: rende solo la finestra corrente, footer con range e pager', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20 } });
    expect(w.findAll('tbody tr')).toHaveLength(20);
    expect(w.get('[data-test="table-count"]').text()).toBe('1–20 di 30');
    expect(w.get('[data-test="page-prev"]').attributes('disabled')).toBeDefined();
    await w.get('[data-test="page-next"]').trigger('click');
    expect(w.findAll('tbody tr')).toHaveLength(10);
    expect(w.get('[data-test="table-count"]').text()).toBe('21–30 di 30');
    expect(w.get('[data-test="page-next"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-test="page-indicator"]').text()).toBe('2 / 2');
  });

  it('v-model:page controllato dall\'esterno', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20, page: 2 } });
    expect(w.get('[data-test="table-count"]').text()).toBe('21–30 di 30');
    await w.get('[data-test="page-prev"]').trigger('click');
    expect(w.emitted('update:page')?.at(-1)).toEqual([1]);
  });

  it('cambio rows → reset a pagina 1', async () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk, pageSize: 20 } });
    await w.get('[data-test="page-next"]').trigger('click');
    await w.setProps({ rows: rows30.slice(0, 5) });
    expect(w.get('[data-test="table-count"]').text()).toBe('1–5 di 5');
  });

  it('cambio sort a pagina >1 → reset a pagina 1', async () => {
    const sortableCols = [{ key: 'n', label: 'N', sortable: true }];
    const w = mount(DataTable, { props: { columns: sortableCols, rows: rows30, rowKey: rk, pageSize: 20 } });
    await w.get('[data-test="page-next"]').trigger('click');
    expect(w.get('[data-test="page-indicator"]').text()).toBe('2 / 2');
    await w.get('th button').trigger('click');
    expect(w.get('[data-test="table-count"]').text()).toBe('1–20 di 30');
    expect(w.get('[data-test="page-indicator"]').text()).toBe('1 / 2');
  });

  it('showCount senza pageSize: solo conteggio, niente pager', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows30.slice(0, 3), rowKey: rk, showCount: true } });
    expect(w.get('[data-test="table-count"]').text()).toBe('3 righe');
    expect(w.find('[data-test="page-next"]').exists()).toBe(false);
  });

  it('senza pageSize né showCount (e in API a slot): nessun footer', () => {
    expect(mount(DataTable, { props: { columns: cols1, rows: rows30, rowKey: rk } }).find('[data-test="table-footer"]').exists()).toBe(false);
    expect(mount(DataTable, { props: { columns: cols1, showCount: true } }).find('[data-test="table-footer"]').exists()).toBe(false);
  });
});

describe('DataTable — righe interattive e stati', () => {
  const cols1 = [{ key: 'n', label: 'N' }];
  const rows2 = [{ id: 'r1', n: 'uno' }, { id: 'r2', n: 'due' }];
  const rk = (r: Record<string, unknown>) => r.id as string;

  it('row-click: emesso al click, cursor-pointer solo con listener', async () => {
    const w = mount(DataTable, {
      props: { columns: cols1, rows: rows2, rowKey: rk, 'onRow-click': () => {} },
    });
    expect(w.find('tbody tr').classes()).toContain('cursor-pointer');
    await w.find('tbody tr').trigger('click');
    expect(w.emitted('row-click')?.[0]).toEqual([rows2[0]]);
    const w2 = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk } });
    expect(w2.find('tbody tr').classes()).not.toContain('cursor-pointer');
  });

  it('rowClass applica classi per riga', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk, rowClass: (r) => (r.n === 'due' ? 'opacity-60' : '') } });
    const trs = w.findAll('tbody tr');
    expect(trs[0].classes()).not.toContain('opacity-60');
    expect(trs[1].classes()).toContain('opacity-60');
  });

  it('emptyMessage: EmptyState dentro la card con 0 righe, footer nascosto', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: [], rowKey: rk, pageSize: 20, emptyMessage: 'Nessun elemento' } });
    expect(w.get('[data-test="empty-state"]').text()).toContain('Nessun elemento');
    expect(w.find('[data-test="table-footer"]').exists()).toBe(false);
  });

  it('maxHeight: scroll interno e thead sticky', () => {
    const w = mount(DataTable, { props: { columns: cols1, rows: rows2, rowKey: rk, maxHeight: '400px' } });
    const scroller = w.find('div.overflow-x-auto');
    expect(scroller.classes()).toContain('overflow-y-auto');
    expect(scroller.attributes('style')).toContain('max-height: 400px');
    expect(w.find('th').classes()).toEqual(expect.arrayContaining(['sticky', 'top-0']));
  });
});
