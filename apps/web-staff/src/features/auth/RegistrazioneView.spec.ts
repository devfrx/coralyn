import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from '@/stores/session';
import RegistrazioneView from './RegistrazioneView.vue';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/AuthLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }));

const stubs = { RouterLink: { props: ['to'], template: '<a><slot /></a>' } };

beforeEach(() => setActivePinia(createPinia()));

describe('RegistrazioneView', () => {
  it('è una pagina informativa "su invito": nessun form, nessun login', () => {
    const w = mount(RegistrazioneView, { global: { stubs } });
    expect(w.text().toLowerCase()).toContain('su invito');
    // Provisioning fornitore + inviti (ADR): niente self-registration → niente form.
    expect(w.find('input').exists()).toBe(false);
    expect(useSessionStore().authenticated).toBe(false);
  });

  it('offre un contatto per l’attivazione e il link al login', () => {
    const w = mount(RegistrazioneView, { global: { stubs } });
    expect(w.find('a[href^="mailto:"]').exists()).toBe(true);
  });
});
