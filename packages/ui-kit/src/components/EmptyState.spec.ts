import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmptyState from './EmptyState.vue';

describe('EmptyState', () => {
  it('retro-compat: rende il messaggio dalla prop', () => {
    const w = mount(EmptyState, { props: { message: 'Nessuna prenotazione per questa data.' } });
    expect(w.text()).toContain('Nessuna prenotazione per questa data.');
  });

  it('mantiene il contenitore tratteggiato con i token standard', () => {
    const w = mount(EmptyState, { props: { message: 'x' } });
    const root = w.get('[data-test="empty-state"]');
    const cls = root.classes().join(' ');
    expect(cls).toContain('border-dashed');
    expect(cls).toContain('border-[var(--color-border)]');
    expect(cls).toContain('rounded-[var(--radius-lg)]');
    expect(cls).toContain('text-center');
  });

  it('con icon+title li mostra sopra il messaggio', () => {
    const w = mount(EmptyState, { props: { icon: 'calendar', title: 'Nessun abbonato', message: 'Aggiungine uno.' } });
    expect(w.find('svg').exists()).toBe(true);          // icona dal registry
    expect(w.text()).toContain('Nessun abbonato');
    expect(w.text()).toContain('Aggiungine uno.');
  });

  it('rende lo slot #action per la CTA', () => {
    const w = mount(EmptyState, {
      props: { message: 'Vuoto' },
      slots: { action: '<button data-test="cta">Aggiungi</button>' },
    });
    expect(w.find('[data-test="cta"]').exists()).toBe(true);
  });

  it('lo slot #default sovrascrive il messaggio prop', () => {
    const w = mount(EmptyState, { props: { message: 'ignorato' }, slots: { default: 'Contenuto ricco.' } });
    expect(w.text()).toContain('Contenuto ricco.');
    expect(w.text()).not.toContain('ignorato');
  });
});
