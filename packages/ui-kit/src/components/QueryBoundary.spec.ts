import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import QueryBoundary from './QueryBoundary.vue';
import ErrorState from './ErrorState.vue';

/**
 * Il valore di QueryBoundary non è che sappia rendere tre stati: è la PRECEDENZA fra loro.
 * Prima che esistesse, `queryResource` non aveva toast d'errore (a differenza di
 * `mutationResource`) e 9 viste su 12 non consultavano mai `isError` — un guasto di rete finiva
 * reso come «nessun dato». La maggior parte dei test qui asserisce quindi quale stato VINCE
 * quando due sono veri insieme, che è la condizione in cui il difetto originale si manifestava.
 */
describe('QueryBoundary', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const slots = { default: '<p class="contenuto">dati</p>' };

  /** Supera il gate anti-flicker di useDelayedLoading (delay 150ms). */
  const passDelay = async (w: { vm: { $nextTick: () => Promise<void> } }) => {
    vi.advanceTimersByTime(200);
    await w.vm.$nextTick();
  };

  it('senza loading, senza errore e non vuoto: rende il contenuto', () => {
    const w = mount(QueryBoundary, { slots });
    expect(w.find('p.contenuto').exists()).toBe(true);
    expect(w.find('[data-test="error-state"]').exists()).toBe(false);
  });

  it("l'errore VINCE sul caricamento: in retry non si torna a mostrare lo scheletro", async () => {
    // TanStack lascia isFetching a true durante un retry: senza questa precedenza un guasto in
    // ritentativo direbbe di nuovo «sto lavorando» al posto di «non ha funzionato».
    const w = mount(QueryBoundary, { props: { loading: true, error: new Error('rete giù') }, slots });
    await passDelay(w);
    expect(w.find('[data-test="error-state"]').exists()).toBe(true);
    expect(w.find('[data-test="boundary-skeleton"]').exists()).toBe(false);
  });

  it("l'errore VINCE sul vuoto: è il difetto originale (AUD-012), non un dettaglio", async () => {
    // La riga che conta di tutto il file: un guasto NON deve mai apparire come «nessun dato».
    const w = mount(QueryBoundary, { props: { error: new Error('500'), empty: true, emptyMessage: 'Nessuna prenotazione' } });
    expect(w.find('[data-test="error-state"]').exists()).toBe(true);
    expect(w.find('[data-test="empty-state"]').exists()).toBe(false);
    expect(w.text()).not.toContain('Nessuna prenotazione');
  });

  it("l'errore espone il message dell'Error come dettaglio", () => {
    const w = mount(QueryBoundary, { props: { error: new Error('Sessione scaduta') } });
    expect(w.get('[data-test="error-detail"]').text()).toBe('Sessione scaduta');
  });

  it('un errore non-Error viene comunque reso (String), senza rompere il boundary', () => {
    const w = mount(QueryBoundary, { props: { error: 'guasto grezzo' } });
    expect(w.get('[data-test="error-detail"]').text()).toBe('guasto grezzo');
  });

  it('il caricamento VINCE sul vuoto: nessun lampo di «nessun dato» mentre si carica', async () => {
    const w = mount(QueryBoundary, { props: { loading: true, empty: true, emptyMessage: 'Nessuna prenotazione' } });
    await passDelay(w);
    expect(w.find('[data-test="boundary-skeleton"]').exists()).toBe(true);
    expect(w.find('[data-test="empty-state"]').exists()).toBe(false);
  });

  it('dentro la finestra anti-flicker non rende NULLA: né scheletro né vuoto', async () => {
    const w = mount(QueryBoundary, { props: { loading: true, empty: true, emptyMessage: 'Nessuna prenotazione' } });
    vi.advanceTimersByTime(100); // sotto la soglia di 150ms
    await w.vm.$nextTick();
    expect(w.find('[data-test="boundary-skeleton"]').exists()).toBe(false);
    expect(w.find('[data-test="empty-state"]').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('vuoto senza errore né caricamento: EmptyState col messaggio del chiamante', () => {
    const w = mount(QueryBoundary, { props: { empty: true, emptyMessage: 'Nessuna prenotazione' }, slots });
    expect(w.get('[data-test="empty-state"]').text()).toContain('Nessuna prenotazione');
    expect(w.find('p.contenuto').exists()).toBe(false);
  });

  it('lo slot skeleton sostituisce lo scheletro di default', async () => {
    const w = mount(QueryBoundary, {
      props: { loading: true },
      slots: { skeleton: '<div class="mio-scheletro" />' },
    });
    await passDelay(w);
    expect(w.find('.mio-scheletro').exists()).toBe(true);
  });

  it('retry: propagato al chiamante solo se qualcuno ascolta', async () => {
    const onRetry = vi.fn();
    const w = mount(QueryBoundary, { props: { error: new Error('x'), onRetry } });
    await w.get('[data-test="error-retry"]').trigger('click');
    expect(onRetry).toHaveBeenCalledTimes(1);

    const senza = mount(QueryBoundary, { props: { error: new Error('x') } });
    expect(senza.find('[data-test="error-retry"]').exists()).toBe(false);
  });

  it("error null/undefined non è un errore: 0 e '' non devono attivare il boundary per sbaglio", () => {
    expect(mount(QueryBoundary, { props: { error: null }, slots }).find('p.contenuto').exists()).toBe(true);
    expect(mount(QueryBoundary, { props: { error: undefined }, slots }).find('p.contenuto').exists()).toBe(true);
  });
});

describe('ErrorState', () => {
  it('ha role="alert": un guasto va annunciato appena compare, non alla prossima interazione', () => {
    const w = mount(ErrorState, { props: { message: 'ko' } });
    expect(w.get('[data-test="error-state"]').attributes('role')).toBe('alert');
  });

  it('titolo di default esplicito, sovrascrivibile', () => {
    expect(mount(ErrorState).text()).toContain('Caricamento non riuscito');
    expect(mount(ErrorState, { props: { title: 'Mappa non disponibile' } }).text()).toContain('Mappa non disponibile');
  });

  it('senza listener @retry non mostra un pulsante che non fa niente', () => {
    expect(mount(ErrorState, { props: { message: 'ko' } }).find('[data-test="error-retry"]').exists()).toBe(false);
  });
});
