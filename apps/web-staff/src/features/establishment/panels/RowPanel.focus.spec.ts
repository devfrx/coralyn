import { describe, it, expect, afterEach, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import RowPanel from './RowPanel.vue';

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

const TYPES: UmbrellaTypeDTO[] = [{ id: 'typ-1', name: 'Gazebo', sortOrder: 1, icon: 'palmtree' }];
const ROW: StructureRowDTO = { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] };
const base = { row: ROW, sectorName: 'Centro', types: TYPES, canManage: true };

// Intent dal rail della fila (StructureRow ⚡/🗑): il pannello contiene sia il generatore sia la zona
// rischiosa; l'intent deve scorrere ed evidenziare la sezione giusta. Prima i due handler erano
// identici (selection = {kind:'row',id}) → i pulsanti facevano la stessa cosa.
describe('RowPanel — intent focus dal rail della fila', () => {
  it("focus='danger' evidenzia la zona rischiosa e ci scorre", async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const w = mountApp(RowPanel, { props: { ...base, focus: 'danger' } });
    await w.vm.$nextTick();
    expect(w.get('[data-testid="row-danger-section"]').attributes('data-focus')).toBe('on');
    expect(w.get('[data-testid="row-generate-section"]').attributes('data-focus')).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("focus='generate' evidenzia il generatore e ci scorre", async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const w = mountApp(RowPanel, { props: { ...base, focus: 'generate' } });
    await w.vm.$nextTick();
    expect(w.get('[data-testid="row-generate-section"]').attributes('data-focus')).toBe('on');
    expect(w.get('[data-testid="row-danger-section"]').attributes('data-focus')).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('senza focus (click sul nome fila) non scorre e nessuna sezione è evidenziata', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const w = mountApp(RowPanel, { props: { ...base } });
    await w.vm.$nextTick();
    expect(w.get('[data-testid="row-generate-section"]').attributes('data-focus')).toBeUndefined();
    expect(w.get('[data-testid="row-danger-section"]').attributes('data-focus')).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('cambiando intent sulla stessa fila (⚡ -> 🗑) scorre di nuovo alla nuova sezione', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const w = mountApp(RowPanel, { props: { ...base, focus: 'generate' } });
    await w.vm.$nextTick();
    spy.mockClear();
    await w.setProps({ focus: 'danger' });
    await w.vm.$nextTick(); await w.vm.$nextTick();
    expect(w.get('[data-testid="row-danger-section"]').attributes('data-focus')).toBe('on');
    expect(w.get('[data-testid="row-generate-section"]').attributes('data-focus')).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
