import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PageToolbar from './PageToolbar.vue';

describe('PageToolbar', () => {
  it('rende #left e #right con lo spacer flex-1 in mezzo, classi del wrapper standard', () => {
    const w = mount(PageToolbar, {
      slots: { left: '<span data-test="left">Filtro</span>', right: '<button data-test="right">Azione</button>' },
    });
    expect(w.classes()).toEqual(expect.arrayContaining(['mb-4', 'flex', 'flex-wrap', 'items-center', 'gap-3']));
    expect(w.find('[data-test="left"]').exists()).toBe(true);
    expect(w.find('[data-test="right"]').exists()).toBe(true);
    expect(w.find('.flex-1').exists()).toBe(true);
  });

  it('non richiede alcuna prop (slot opzionali)', () => {
    expect(() => mount(PageToolbar)).not.toThrow();
  });
});
