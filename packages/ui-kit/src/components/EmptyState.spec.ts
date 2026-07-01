import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('rende il messaggio con le classi standard', () => {
    const w = mount(EmptyState, { props: { message: 'Nessuna prenotazione per questa data.' } });
    expect(w.text()).toBe('Nessuna prenotazione per questa data.');
    const p = w.find('p');
    expect(p.classes()).toEqual(
      expect.arrayContaining([
        'rounded-[var(--radius-lg)]',
        'border',
        'border-dashed',
        'border-[var(--color-border)]',
        'px-6',
        'py-10',
        'text-center',
        'text-sm',
        'text-[var(--color-text-2nd)]',
      ]),
    );
  });

  it('con slot #default rende il contenuto ricco invece del testo prop', () => {
    const w = mount(EmptyState, {
      props: { message: 'ignorato' },
      slots: { default: '<span data-test="icona">★</span> Nessun abbonato.' },
    });
    expect(w.find('[data-test="icona"]').exists()).toBe(true);
    expect(w.text()).toContain('Nessun abbonato.');
    expect(w.text()).not.toContain('ignorato');
  });
});
