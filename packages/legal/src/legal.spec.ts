import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PrivacyPolicyView from './PrivacyPolicyView.vue';
import ImprintView from './ImprintView.vue';
import { PRIVACY_OPERATORI_SECTIONS, PRIVACY_OPERATORI_VERSION } from './privacy.content';
import { IMPRINT_FIELDS, IMPRINT_NOT_APPLICABLE } from './imprint.content';

describe('PrivacyPolicyView (operatori)', () => {
  it('rende tutte le sezioni con i rispettivi paragrafi', () => {
    const w = mount(PrivacyPolicyView);
    const text = w.text();
    for (const s of PRIVACY_OPERATORI_SECTIONS) {
      expect(text).toContain(s.heading);
      for (const p of s.paragraphs) expect(text).toContain(p);
    }
    w.unmount();
  });

  it('mostra versione e data di aggiornamento', () => {
    const w = mount(PrivacyPolicyView);
    expect(w.get('[data-testid="legal-version"]').text()).toContain(PRIVACY_OPERATORI_VERSION);
    w.unmount();
  });

  it('chiarisce che il documento riguarda gli operatori, non i bagnanti', () => {
    const w = mount(PrivacyPolicyView);
    expect(w.get('[data-testid="privacy-scope"]').text()).toContain('operatore');
    w.unmount();
  });

  it('porta il disclaimer di validazione legale: non e mai "pronto alla pubblicazione"', () => {
    const w = mount(PrivacyPolicyView);
    expect(w.text()).toContain('non costituisce un parere legale');
    w.unmount();
  });
});

describe('ImprintView', () => {
  it('rende tutte le voci obbligatorie dell art. 7', () => {
    const w = mount(ImprintView);
    const text = w.text();
    for (const f of IMPRINT_FIELDS) expect(text).toContain(f.label);
    w.unmount();
  });

  it('dichiara esplicitamente le voci non applicabili invece di ometterle', () => {
    const w = mount(ImprintView);
    const text = w.text();
    for (const f of IMPRINT_NOT_APPLICABLE) {
      expect(text).toContain(f.label);
      expect(text).toContain(f.source);
    }
    w.unmount();
  });

  it('include la lett. h (prezzi e tariffe), che era la voce mancante in review', () => {
    expect(IMPRINT_FIELDS.some((f) => f.source === 'art. 7.1.h')).toBe(true);
  });

  it('mappa la P. IVA sulla lett. g, non sulla e', () => {
    const piva = IMPRINT_FIELDS.find((f) => f.label === 'Partita IVA');
    expect(piva?.source).toBe('art. 7.1.g');
  });
});

describe('separazione dei piani GDPR (ADR-0055)', () => {
  // Questo package esiste per il piano B: verso l'operatore il titolare e Coralyn. Il testo non
  // deve MAI presentare il lido come titolare: sarebbe la contaminazione tra piani che ADR-0055
  // esiste per impedire, ed e gia stata trovata una volta in review sul DPA.
  it('non presenta lo stabilimento come titolare del trattamento', () => {
    const w = mount(PrivacyPolicyView);
    const text = w.text();
    expect(text).toContain('Il titolare del trattamento è [COMPILARE: ragione sociale]');
    expect(text).toContain('lo stabilimento presso cui lavori, che ne è il titolare');
    // La frase sopra e ammessa SOLO perche distingue esplicitamente i dati dei bagnanti.
    expect(text).not.toMatch(/lo stabilimento (è|e) il titolare del trattamento dei tuoi dati/i);
    w.unmount();
  });

  it('non cattura consenso: la base giuridica non e il consenso (ADR-0055 punto 3)', () => {
    const w = mount(PrivacyPolicyView);
    const text = w.text();
    expect(text).not.toMatch(/acconsent|presta il consenso|dai il consenso/i);
    expect(text).toContain('esecuzione del contratto');
    w.unmount();
  });

  it('dichiara entrambe le memorizzazioni sul dispositivo, non solo il token', () => {
    // Rilievo della review tecnica: dire "unica memorizzazione" era falso, le app sono PWA con
    // precaching. La conclusione "niente banner" regge, l'affermazione no.
    const w = mount(PrivacyPolicyView);
    const text = w.text();
    expect(text).toContain('identificativo di sessione');
    expect(text).toContain('applicazione installabile');
    expect(text).toContain('non trovi un banner');
    w.unmount();
  });
});
