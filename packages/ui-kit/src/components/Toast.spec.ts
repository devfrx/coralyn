import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Toast from './Toast.vue';

describe('Toast', () => {
  it('rende il messaggio con role="alert" (annunciato dagli screen reader)', () => {
    const w = mount(Toast, { props: { message: 'Pacchetto in uso: non eliminabile.' } });
    expect(w.attributes('role')).toBe('alert');
    expect(w.text()).toContain('Pacchetto in uso: non eliminabile.');
  });

  it('emette dismiss al click sul bottone di chiusura', async () => {
    const w = mount(Toast, { props: { message: 'Errore' } });
    await w.get('button[aria-label="Chiudi"]').trigger('click');
    expect(w.emitted('dismiss')).toHaveLength(1);
  });

  it('usa i token di superficie/danger (niente colori hardcoded)', () => {
    const w = mount(Toast, { props: { message: 'Errore' } });
    expect(w.classes().join(' ')).toContain('border-[var(--color-danger)]');
    expect(w.classes().join(' ')).toContain('bg-[var(--color-surface)]');
  });
});
