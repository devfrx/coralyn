import { describe, it, expect } from 'vitest';
import { sortRows, paginate, pageCount, countLabel } from './tableData';

const byNome = (r: { nome: string | null }) => r.nome;

describe('sortRows', () => {
  const rows = [{ nome: 'mario' }, { nome: 'Anna' }, { nome: 'Luca' }];
  it('ordina stringhe case-insensitive con localeCompare', () => {
    expect(sortRows(rows, byNome, 'asc').map((r) => r.nome)).toEqual(['Anna', 'Luca', 'mario']);
    expect(sortRows(rows, byNome, 'desc').map((r) => r.nome)).toEqual(['mario', 'Luca', 'Anna']);
  });
  it('non muta l\'array di partenza', () => {
    const input = [...rows];
    sortRows(input, byNome, 'asc');
    expect(input.map((r) => r.nome)).toEqual(['mario', 'Anna', 'Luca']);
  });
  it('ordina numeri numericamente, non lessicograficamente', () => {
    const nums = [{ v: 10 }, { v: 2 }, { v: 1 }];
    expect(sortRows(nums, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, 10]);
  });
  it('null/undefined finiscono in fondo in entrambe le direzioni', () => {
    const withNull = [{ nome: null }, { nome: 'Anna' }, { nome: 'Luca' }];
    expect(sortRows(withNull, byNome, 'asc').map((r) => r.nome)).toEqual(['Anna', 'Luca', null]);
    expect(sortRows(withNull, byNome, 'desc').map((r) => r.nome)).toEqual(['Luca', 'Anna', null]);
  });
  it('stringhe con numeri: ordinamento naturale (Fila 2 < Fila 10)', () => {
    const labels = [{ nome: 'Fila 10' }, { nome: 'Fila 2' }];
    expect(sortRows(labels, byNome, 'asc').map((r) => r.nome)).toEqual(['Fila 2', 'Fila 10']);
  });
});

describe('paginate / pageCount', () => {
  const rows = Array.from({ length: 87 }, (_, i) => i + 1);
  it('finestra 1-based', () => {
    expect(paginate(rows, 1, 20)).toEqual(rows.slice(0, 20));
    expect(paginate(rows, 5, 20)).toEqual([81, 82, 83, 84, 85, 86, 87]);
  });
  it('pagina oltre la fine → vuota', () => {
    expect(paginate(rows, 6, 20)).toEqual([]);
  });
  it('pageCount arrotonda in alto, minimo 1', () => {
    expect(pageCount(87, 20)).toBe(5);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(0, 20)).toBe(1);
  });
});

describe('countLabel', () => {
  it('senza finestra: conteggio con plurale', () => {
    expect(countLabel(87)).toBe('87 righe');
    expect(countLabel(1)).toBe('1 riga');
    expect(countLabel(0)).toBe('0 righe');
  });
  it('con finestra: range «1–20 di 87»', () => {
    expect(countLabel(87, { page: 1, pageSize: 20 })).toBe('1–20 di 87');
    expect(countLabel(87, { page: 5, pageSize: 20 })).toBe('81–87 di 87');
  });
  it('0 righe con finestra: niente range', () => {
    expect(countLabel(0, { page: 1, pageSize: 20 })).toBe('0 righe');
  });
});
