import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useToasts } from '@/lib/toasts';
import PricingView from './PricingView.vue';

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

describe('PricingView', () => {
  it('mostra la stagione, i pacchetti e le tariffe reali dal mock', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Estate 2026'); // stagione dal mock
    expect(w.text()).toContain('Standard');    // pacchetto dal mock
    expect(w.text()).toContain('28');          // tariffa catch-all (28/giorno)
  });

  it('crea un pacchetto dal modale e compare tra le card', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-package"]').trigger('click');
    await flushPromises();
    const set = (name: string, val: string) => {
      const el = document.querySelector(`[data-test="form-package"] input[name="${name}"]`) as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('name', 'Prestige');
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Prestige');
  });

  it('compone un pacchetto con più voci e le mostra come "N × Nome"', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-package"]').trigger('click');
    await flushPromises();
    const nameEl = document.querySelector('[data-test="form-package"] input[name="name"]') as HTMLInputElement;
    nameEl.value = 'Prestige'; nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    // aggiungi una riga voce e scegli 'Lettino' (eq-1) qty 3
    (document.querySelector('[data-test="add-equipment-row"]') as HTMLButtonElement).click();
    await flushPromises();
    const typeSel = document.querySelector('[data-test="equip-row-0"] select') as HTMLSelectElement;
    typeSel.value = 'eq-1'; typeSel.dispatchEvent(new Event('change', { bubbles: true }));
    const qtyEl = document.querySelector('[data-test="equip-row-0"] input[name="quantity"]') as HTMLInputElement;
    qtyEl.value = '3'; qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Prestige');
    expect(w.text()).toContain('3 × Lettino');
  });

  it('le voci del pacchetto risultano ordinate per nome anche se inserite in ordine diverso (mock fedele al backend)', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-package"]').trigger('click');
    await flushPromises();
    const nameEl = document.querySelector('[data-test="form-package"] input[name="name"]') as HTMLInputElement;
    nameEl.value = 'Deluxe'; nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    // Riga 0: Sdraio (eq-2) qty 1 — inserita PRIMA di Lettino, quindi in ordine non alfabetico.
    (document.querySelector('[data-test="add-equipment-row"]') as HTMLButtonElement).click();
    await flushPromises();
    const typeSel0 = document.querySelector('[data-test="equip-row-0"] select') as HTMLSelectElement;
    typeSel0.value = 'eq-2'; typeSel0.dispatchEvent(new Event('change', { bubbles: true }));
    const qtyEl0 = document.querySelector('[data-test="equip-row-0"] input[name="quantity"]') as HTMLInputElement;
    qtyEl0.value = '1'; qtyEl0.dispatchEvent(new Event('input', { bubbles: true }));
    // Riga 1: Lettino (eq-1) qty 2 — inserita DOPO Sdraio.
    (document.querySelector('[data-test="add-equipment-row"]') as HTMLButtonElement).click();
    await flushPromises();
    const typeSel1 = document.querySelector('[data-test="equip-row-1"] select') as HTMLSelectElement;
    typeSel1.value = 'eq-1'; typeSel1.dispatchEvent(new Event('change', { bubbles: true }));
    const qtyEl1 = document.querySelector('[data-test="equip-row-1"] input[name="quantity"]') as HTMLInputElement;
    qtyEl1.value = '2'; qtyEl1.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Deluxe');
    // Ordine-sensibile: il backend/mock risolve e ordina per nome, quindi "Lettino" deve precedere "Sdraio"
    // nell'etichetta risultante, anche se in input erano stati inseriti nell'ordine opposto.
    const card = Array.from(document.querySelectorAll('*')).find((el) => el.textContent?.includes('Deluxe') && el.textContent?.includes('×'));
    const label = card!.textContent!;
    expect(label.indexOf('Lettino')).toBeGreaterThanOrEqual(0);
    expect(label.indexOf('Sdraio')).toBeGreaterThan(label.indexOf('Lettino'));
    expect(label).toContain('2 × Lettino · 1 × Sdraio');
  });

  it('modificando un pacchetto multi-voce e risalvando, nessuna voce sparisce (no clobber)', async () => {
    server.use(
      http.get('/api/packages', () => HttpResponse.json([
        { id: 'pkg-1', name: 'Standard', equipment: [
          { equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 },
          { equipmentTypeId: 'eq-2', name: 'Sdraio', quantity: 1 },
        ] },
      ])),
    );
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-pkg-pkg-1"]').trigger('click');
    await flushPromises();
    // due righe idratate
    expect(document.querySelectorAll('[data-test^="equip-row-"]').length).toBe(2);
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('2 × Lettino');
    expect(w.text()).toContain('1 × Sdraio');
  });

  it('crea una tariffa dal modale e compare in tabella', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-rate"]').trigger('click');
    await flushPromises();
    const setPrice = (val: string) => {
      const el = document.querySelector('[data-test="form-rate"] input[name="price"]') as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setPrice('42');
    (document.querySelector('[data-test="form-rate"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('42');
  });

  it('modifica il nome di un pacchetto dal modale e la card si aggiorna', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-pkg-pkg-1"]').trigger('click');
    await flushPromises();
    const nameInput = document.querySelector('[data-test="form-package"] input[name="name"]') as HTMLInputElement;
    nameInput.value = 'Deluxe';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Deluxe');
    expect(w.text()).not.toContain('Standard');
  });

  it('modifica il prezzo di una tariffa dal modale e la tabella si aggiorna', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-rate-ra-1"]').trigger('click');
    await flushPromises();
    const priceInput = document.querySelector('[data-test="form-rate"] input[name="price"]') as HTMLInputElement;
    priceInput.value = '55';
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-rate"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('55');
  });

  it('modifica una tariffa svuotando il pacchetto: la dimensione viene azzerata (non resta il vecchio valore)', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();

    // Crea una tariffa CON pacchetto (dal mock: pkg-1 = "Standard").
    await w.get('[data-test="new-rate"]').trigger('click');
    await flushPromises();
    const form = document.querySelector('[data-test="form-rate"]') as HTMLFormElement;
    const packageSelect = form.querySelectorAll('select')[2] as HTMLSelectElement; // Tipo, Settore, Pacchetto, Fascia
    packageSelect.value = 'pkg-1';
    packageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const priceInput = form.querySelector('input[name="price"]') as HTMLInputElement;
    priceInput.value = '60';
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    // La riga appena creata mostra il pacchetto "Standard".
    const rows = document.querySelectorAll('tbody tr, tr');
    const newRow = Array.from(rows).find((r) => r.textContent?.includes('60') && r.textContent?.includes('Standard'));
    expect(newRow).toBeTruthy();
    const editBtn = newRow!.querySelector('[data-test^="edit-rate-"]') as HTMLElement;
    const rateId = editBtn.getAttribute('data-test')!.replace('edit-rate-', '');

    // Riapri in modifica e svuota il pacchetto (torna a "Nessuno").
    await w.get(`[data-test="edit-rate-${rateId}"]`).trigger('click');
    await flushPromises();
    const editForm = document.querySelector('[data-test="form-rate"]') as HTMLFormElement;
    const editPackageSelect = editForm.querySelectorAll('select')[2] as HTMLSelectElement;
    expect(editPackageSelect.value).toBe('pkg-1'); // precompilato correttamente
    editPackageSelect.value = '';
    editPackageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    // La riga con prezzo 60 non deve più mostrare "Standard" come pacchetto.
    const updatedRows = Array.from(document.querySelectorAll('tbody tr, tr'));
    const updatedRow = updatedRows.find((r) => r.textContent?.includes('60'));
    expect(updatedRow).toBeTruthy();
    expect(updatedRow!.textContent).not.toContain('Standard');
  });

  // Helper: trova il bottone del ConfirmDialog per testo, nel document.body.
  const dialogBtn = (label: string) =>
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

  describe('elimina stagione: conferma via ConfirmDialog (cascata su tutte le tariffe)', () => {
    it('annullando la conferma NON elimina la stagione', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare la stagione?');
      dialogBtn('Annulla')!.click();
      await settle();
      expect(w.text()).toContain('Estate 2026'); // la stagione resta
    });

    it('confermando elimina la stagione (e le sue tariffe)', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.text()).toContain('Estate 2026');
      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();
      dialogBtn('Elimina')!.click();
      await settle();
      expect(w.text()).not.toContain('Estate 2026');
    });
  });

  describe('ciclo di vita pacchetto: archivia / ripristina / elimina definitivamente', () => {
    it('la card attiva mostra "Archivia" (non "Elimina") e archiviando sparisce dagli attivi', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.get('[data-test="archive-pkg-pkg-1"]')).toBeTruthy(); // throws (get) se assente
      expect(document.querySelector('[data-test="del-pkg-pkg-1"]')).toBeNull(); // niente delete sulla card attiva
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      // "Standard" non è più tra le card attive, ma la sezione Archiviati compare (chiusa).
      expect(w.get('[data-test="toggle-archived"]').text()).toContain('Archiviati (1)');
    });

    it('apre la sezione archiviati e ripristina il pacchetto', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived"]').trigger('click'); // apri
      await settle();
      await w.get('[data-test="restore-pkg-pkg-1"]').trigger('click');
      await settle();
      // Ripristinato: torna card attiva con azione Archivia, sezione archiviati sparita.
      expect(w.get('[data-test="archive-pkg-pkg-1"]')).toBeTruthy(); // throws (get) se assente
      expect(document.querySelector('[data-test="toggle-archived"]')).toBeNull();
    });

    it('"Elimina definitivamente" apre il ConfirmDialog e chiama la DELETE', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived"]').trigger('click');
      await settle();
      await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare definitivamente?');
      dialogBtn('Elimina')!.click();
      await settle();
      // Eliminato del tutto: niente più card, niente sezione archiviati.
      expect(document.querySelector('[data-test="toggle-archived"]')).toBeNull();
      expect(w.text()).not.toContain('Standard');
    });

    it('il selettore Pacchetto dell\'editor tariffe NON elenca gli archiviati', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-pkg-pkg-1"]').trigger('click');
      await settle();
      await w.get('[data-test="new-rate"]').trigger('click');
      await settle();
      const form = document.querySelector('[data-test="form-rate"]') as HTMLElement;
      const packageSelect = form.querySelectorAll('select')[2] as HTMLSelectElement; // Tipo, Settore, Pacchetto, Fascia
      expect(Array.from(packageSelect.options).some((o) => o.textContent?.includes('Standard'))).toBe(false);
      w.unmount();
    });
  });

  it('elimina tariffa: richiede conferma via ConfirmDialog', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('28'); // tariffa ra-1
    await w.get('[data-test="del-rate-ra-1"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain('Eliminare la tariffa?');
    dialogBtn('Elimina')!.click();
    await settle();
    expect(w.text()).not.toContain('28');
  });

  describe('editor fasce orarie (Slice B1)', () => {
    it('elenca le fasce con i relativi orari', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      const mattina = w.get('[data-test="slot-f-mat"]');
      expect(mattina.text()).toContain('Mattina');
      expect(mattina.text()).toContain('08:00–13:00');
      const pomeriggio = w.get('[data-test="slot-f-pom"]');
      expect(pomeriggio.text()).toContain('Pomeriggio');
      expect(pomeriggio.text()).toContain('13:00–19:00');
    });

    it('crea una nuova fascia dal modale e compare tra le fasce', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="new-time-slot"]').trigger('click');
      await flushPromises();
      const set = (name: string, val: string) => {
        const el = document.querySelector(`[data-test="form-time-slot"] input[name="${name}"]`) as HTMLInputElement;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('name', 'Serale');
      set('startTime', '17:00');
      set('endTime', '19:00');
      (document.querySelector('[data-test="form-time-slot"]') as HTMLFormElement)
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
      expect(w.text()).toContain('Serale');
    });

    it('409 dal server (fascia in uso, f-pom) → il messaggio del server diventa un toast', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="del-slot-f-pom"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare la fascia?');
      dialogBtn('Elimina')!.click();
      await settle();
      expect(useToasts().items.map((t) => t.message)).toEqual(['Fascia in uso da tariffe o prenotazioni: non eliminabile.']);
      expect(w.text()).toContain('Pomeriggio'); // niente rimozione ottimistica
    });
  });

  describe('precedenza tariffe (ADR-0032, Slice B2)', () => {
    it('ordina le tariffe per specificità e mostra la legenda di precedenza', async () => {
      server.use(
        http.get('/api/rates', () => HttpResponse.json([
          { id: 'ra-catch', seasonId: 'se-1', price: 20 },
          { id: 'ra-slot', seasonId: 'se-1', price: 40, timeSlotId: 'f-pom' },
        ])),
      );
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      const rows = w.findAll('tbody tr');
      const idxSlot = rows.findIndex((r) => r.text().includes('40'));
      const idxCatch = rows.findIndex((r) => r.text().includes('20'));
      expect(idxSlot).toBeGreaterThanOrEqual(0);
      expect(idxCatch).toBeGreaterThanOrEqual(0);
      expect(idxSlot).toBeLessThan(idxCatch); // la più specifica (fascia) è sopra la catch-all
      expect(w.text()).toContain('vince la più specifica'); // legenda
    });
  });

  describe('tabella tariffe: etichette wildcard coerenti (cleanup B2)', () => {
    it('una tariffa senza fascia (wildcard) mostra "Tutte" in colonna Fascia, non "—"', async () => {
      server.use(
        http.get('/api/rates', () => HttpResponse.json([
          { id: 'ra-wild-slot', seasonId: 'se-1', price: 33, packageId: 'pkg-1' },
        ])),
      );
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      const rows = w.findAll('tbody tr');
      const row = rows.find((r) => r.text().includes('33'));
      expect(row).toBeTruthy();
      expect(row!.text()).toContain('Tutte');
      expect(row!.text()).not.toContain('—');
    });

    it('una tariffa senza pacchetto (wildcard) mostra "Tutti" in colonna Pacchetto, non "—"', async () => {
      server.use(
        http.get('/api/rates', () => HttpResponse.json([
          { id: 'ra-wild-pkg', seasonId: 'se-1', price: 37, timeSlotId: 'f-pom' },
        ])),
      );
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      const rows = w.findAll('tbody tr');
      const row = rows.find((r) => r.text().includes('37'));
      expect(row).toBeTruthy();
      expect(row!.text()).toContain('Tutti');
      expect(row!.text()).not.toContain('—');
    });
  });

  describe('chiarezza tipi (slice)', () => {
    it('il modale tariffa non ha più il selettore "Unità"', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="new-rate"]').trigger('click');
      await settle();
      const form = document.querySelector('[data-test="form-rate"]') as HTMLElement;
      expect(form.textContent).not.toContain('Unità');
      w.unmount();
    });

    it('colonna Prezzo: subscription → "forfait", altri tipi → "/giorno"', async () => {
      server.use(
        http.get('/api/rates', () => HttpResponse.json([
          { id: 'ra-sub', seasonId: 'se-1', price: 800, type: 'subscription' },
          { id: 'ra-day', seasonId: 'se-1', price: 28 },
        ])),
      );
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      const rows = w.findAll('tbody tr');
      const rowSub = rows.find((r) => r.text().includes('800'))!;
      const rowDay = rows.find((r) => r.text().includes('28'))!;
      expect(rowSub.text()).toContain('forfait');
      expect(rowDay.text()).toContain('/giorno');
      w.unmount();
    });
  });

  describe('catalogo tipi di dotazione', () => {
    it('elenca i tipi e ne crea uno nuovo dal catalogo', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.text()).toContain('Lettino'); // tipo dal mock
      await w.get('[data-test="new-equipment-type"]').trigger('click');
      await flushPromises();
      const el = document.querySelector('[data-test="form-equipment-type"] input[name="name"]') as HTMLInputElement;
      el.value = 'Cassaforte';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      (document.querySelector('[data-test="form-equipment-type"]') as HTMLFormElement)
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
      expect(w.text()).toContain('Cassaforte');
    });

    it('archivia un tipo e lo mostra nella sezione archiviati', async () => {
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-eqt-eq-2"]').trigger('click');
      await settle();
      expect(w.get('[data-test="toggle-archived-eqt"]').text()).toContain('Archiviati');
    });
  });
});
