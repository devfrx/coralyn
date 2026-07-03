import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionCard from './SectionCard.vue';

describe('SectionCard', () => {
  it('rende il titolo e l’icona', () => {
    const w = mount(SectionCard, { props: { title: 'Pagamenti', icon: 'euro' } });
    expect(w.text()).toContain('Pagamenti');
    expect(w.find('svg').exists()).toBe(true);
  });

  it('rende lo slot action nell’header e lo slot default nel corpo', () => {
    const w = mount(SectionCard, {
      props: { title: 'Anagrafica' },
      slots: { action: '<button>Modifica</button>', default: '<p>corpo</p>' },
    });
    expect(w.text()).toContain('Modifica');
    expect(w.text()).toContain('corpo');
  });

  it('senza prop icon non rende il quadratino-icona', () => {
    const w = mount(SectionCard, { props: { title: 'X' } });
    expect(w.find('svg').exists()).toBe(false);
  });
});
