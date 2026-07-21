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

  it('cella default: usa row[column.key], classi TD_FIRST sulla prima colonna, TD_NUM se column.numeric', () => {
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
