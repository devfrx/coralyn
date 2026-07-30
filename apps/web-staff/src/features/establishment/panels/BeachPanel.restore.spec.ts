import { describe, it, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, enableAutoUnmount } from '@vue/test-utils';
import type { EstablishmentStructureDTO, RetiredUmbrellaDTO } from '@coralyn/contracts';
import { mountApp, selectOption } from '@/test/utils';
import { server } from '@/mocks/server';
import BeachPanel from './BeachPanel.vue';

enableAutoUnmount(afterEach);

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };

// «Centro» ha tariffe dedicate, «Levante» no: bastano a coprire i due versi del confronto.
const DATA: EstablishmentStructureDTO = {
  sectors: [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: true, rows: [
      { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [] },
    ] },
    { id: 's-2', name: 'Levante', sortOrder: 2, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-2', label: 'F2', sortOrder: 1, umbrellas: [] },
    ] },
  ],
  umbrellaTypes: [],
};

/** `retiredFrom` è lo snapshot «Settore · Fila» scritto al ritiro, non un riferimento vivo. */
function retiredUmbrella(retiredFrom: string | null): RetiredUmbrellaDTO {
  return { id: 'u-r', label: 'R1', umbrellaTypeId: null, retiredAt: '2026-07-01T00:00:00.000Z', retiredFrom };
}

async function panel(retiredFrom: string | null, data: EstablishmentStructureDTO = DATA) {
  let posted: unknown = null;
  server.use(
    http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([retiredUmbrella(retiredFrom)])),
    http.post('/api/establishment/umbrellas/:id/restore', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ id: 'u-r', label: 'R1', umbrellaTypeId: null });
    }),
  );
  const w = mountApp(BeachPanel, { props: { data, canManage: true }, attachTo: document.body });
  await settle();
  return { w, posted: () => posted };
}

/** Sceglie la fila di destinazione nella Select (reka-ui, portalata) e preme «Ripristina». */
async function restoreInto(w: Awaited<ReturnType<typeof panel>>['w'], optionLabel: string) {
  await selectOption(w.get('[data-testid="retired-restore-row"]'), optionLabel);
  await w.get('[data-testid="retired-restore"]').trigger('click');
  await settle();
}

describe('BeachPanel — disclosure sul ripristino (D-038)', () => {
  it('verso un settore con tariffe dedicate diverso dall’origine: chiede prima, e NON scrive', async () => {
    const { w, posted } = await panel('Levante · F2');
    await restoreInto(w, 'Centro · F1'); // Centro, che ha tariffe dedicate
    expect(posted()).toBeNull();
    // reka-ui teleporta il dialogo fuori dall'albero del wrapper.
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('Levante');
    // La destinazione ha davvero le tariffe dedicate qui: il testo può dirlo.
    expect(document.body.textContent).toContain('dove il listino ha tariffe dedicate');
    expect(document.body.textContent).toContain('saranno prezzati con le tariffe di «Centro»');
    expect(document.body.textContent).not.toContain('il listino generale');
    w.unmount();
  });

  it('confermando, il ripristino parte con la fila scelta', async () => {
    const { w, posted } = await panel('Levante · F2');
    await restoreInto(w, 'Centro · F1');
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Ripristina comunque'))!;
    confirm.click();
    await settle();
    expect(posted()).toEqual({ rowId: 'r-1' });
    w.unmount();
  });

  it('tornando nel settore da cui era stato ritirato non chiede nulla', async () => {
    const { w, posted } = await panel('Centro · F1');
    await restoreInto(w, 'Centro · F1');
    expect(posted()).toEqual({ rowId: 'r-1' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('uscire da un settore con tariffe dedicate avvisa anche se l’arrivo non ne ha', async () => {
    // Spec §2.5: conta una tariffa agganciata alla partenza O all'arrivo. Uscendo da «Centro» il
    // prezzo smette di essere quello di «Centro», ed è quella la cosa da dichiarare — non che
    // «Levante» ne acquisti una: qui l'ombrellone la PERDE, non il contrario (4a).
    const { w, posted } = await panel('Centro · F1');
    await restoreInto(w, 'Levante · F2');
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('che non le ha');
    expect(document.body.textContent).toContain('il listino generale');
    expect(document.body.textContent).not.toContain('saranno prezzati con le tariffe di «Levante»');
    w.unmount();
  });

  it('quando NESSUNO dei due settori ha tariffe dedicate il gesto è diretto', async () => {
    const senzaTariffe: EstablishmentStructureDTO = {
      ...DATA, sectors: DATA.sectors.map((s) => ({ ...s, hasDedicatedRates: false })),
    };
    const { w, posted } = await panel('Centro · F1', senzaTariffe);
    await restoreInto(w, 'Levante · F2');
    expect(posted()).toEqual({ rowId: 'r-2' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('senza snapshot di provenienza non si inventa un confronto', async () => {
    const { w, posted } = await panel(null);
    await restoreInto(w, 'Centro · F1');
    expect(posted()).toEqual({ rowId: 'r-1' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('settore d’origine rinominato dopo il ritiro: il nome snapshot non combacia più e l’avviso salta (difetto noto, non risolto qui)', async () => {
    // «Ponente» è lo stesso settore fisico che al momento del ritiro si chiamava «Centro» (e aveva
    // tariffe dedicate: hasDedicatedRates non cambia con un rename). `retiredFrom` porta ancora il
    // nome vecchio, quindi il confronto per nome non trova più «Centro» fra i settori correnti:
    // `origin` resta null, il gate ricade sul solo target — «Scirocco», senza tariffe dedicate — e
    // il ripristino parte senza avviso, pur facendo perdere la tariffa dedicata di «Ponente».
    const rinominato: EstablishmentStructureDTO = {
      sectors: [
        { id: 's-1', name: 'Ponente', sortOrder: 1, kind: 'grid', hasDedicatedRates: true, rows: [
          { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [] },
        ] },
        { id: 's-2', name: 'Scirocco', sortOrder: 2, kind: 'grid', hasDedicatedRates: false, rows: [
          { id: 'r-2', label: 'F2', sortOrder: 1, umbrellas: [] },
        ] },
      ],
      umbrellaTypes: [],
    };
    const { w, posted } = await panel('Centro · F1', rinominato);
    await restoreInto(w, 'Scirocco · F2');
    expect(posted()).toEqual({ rowId: 'r-2' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });
});
