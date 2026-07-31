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
function retiredUmbrella(retiredFrom: string | null, retiredFromSectorId: string | null = null): RetiredUmbrellaDTO {
  return { id: 'u-r', label: 'R1', umbrellaTypeId: null, retiredAt: '2026-07-01T00:00:00.000Z', retiredFrom, retiredFromSectorId };
}

async function panel(retiredFrom: string | null, data: EstablishmentStructureDTO = DATA, retiredFromSectorId: string | null = null) {
  let posted: unknown = null;
  server.use(
    http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([retiredUmbrella(retiredFrom, retiredFromSectorId)])),
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

// D-072. La provenienza è un RIFERIMENTO (`retiredFromSectorId`), non più il nome letto dentro lo
// snapshot testuale: `retiredFrom` sopravvive come etichetta storica da mostrare, mai come chiave.
describe('BeachPanel — provenienza del ritirato risolta per id (D-072)', () => {
  // «Ponente» è lo STESSO settore fisico che al momento del ritiro si chiamava «Centro»: un rename
  // non tocca né l'id né `hasDedicatedRates`, quindi l'origine è ancora quella e la tariffa c'è.
  const RINOMINATO: EstablishmentStructureDTO = {
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

  it('settore d’origine rinominato dopo il ritiro: l’id lo risolve e l’avviso NON tace', async () => {
    const { w, posted } = await panel('Centro · F1', RINOMINATO, 's-1');
    await restoreInto(w, 'Scirocco · F2');
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('il listino generale');
    w.unmount();
  });

  it('il dialogo nomina l’origine col nome ATTUALE, non con quello congelato nello snapshot', async () => {
    const { w } = await panel('Centro · F1', RINOMINATO, 's-1');
    await restoreInto(w, 'Scirocco · F2');
    // Lo snapshot «Centro · F1» resta a schermo nella riga d'archivio: l'asserzione va sulla frase
    // del dialogo, non sulla presenza della parola nel body.
    expect(document.body.textContent).toContain('era stato ritirato da «Ponente»');
    expect(document.body.textContent).not.toContain('era stato ritirato da «Centro»');
    w.unmount();
  });

  it('tornando nel settore d’origine RINOMINATO non chiede nulla: il confronto è sugli id', async () => {
    const { w, posted } = await panel('Centro · F1', RINOMINATO, 's-1');
    await restoreInto(w, 'Ponente · F1');
    expect(posted()).toEqual({ rowId: 'r-1' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('ritirato d’archivio senza id d’origine: il confronto sull’origine non si INVENTA dal nome', async () => {
    // Il backfill della migration ha già risolto per nome tutto ciò che era risolvibile: una riga
    // rimasta a `null` è per costruzione una che il nome NON risolve. Ricadere sul nome qui non
    // recupererebbe nulla — potrebbe solo agganciare un settore OMONIMO creato dopo.
    const { w, posted } = await panel('Centro · F1', DATA, null);
    await restoreInto(w, 'Levante · F2');
    expect(posted()).toEqual({ rowId: 'r-2' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('senza id d’origine l’avviso della DESTINAZIONE resta, con l’etichetta storica a schermo', async () => {
    const { w, posted } = await panel('Ovest · F9', DATA, null);
    await restoreInto(w, 'Centro · F1');
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('era stato ritirato da «Ovest»');
    // Invariante da tenere ferma: il gate si apre solo su `target.hasDedicatedRates ||
    // origin?.hasDedicatedRates`, quindi con l'origine NON risolta può essere stato solo il primo.
    // Ne segue che il ramo di testo che AFFERMA qualcosa sull'origine («da «X», dove il listino ha
    // tariffe dedicate») è irraggiungibile senza un'origine risolta — non si può mentire su un
    // settore che non si è saputo identificare. Qui deve uscire il testo della DESTINAZIONE.
    expect(document.body.textContent).toContain('dove il listino ha tariffe dedicate');
    expect(document.body.textContent).not.toContain('il listino generale');
    w.unmount();
  });

  it('rename avvenuto PRIMA della migration: il backfill non ha risolto e il silenzio è DICHIARATO', async () => {
    // Il residuo che questa scelta lascia scoperto, e che va tenuto visibile: se il settore era già
    // stato rinominato quando la migration è passata, il backfill non aveva un nome da agganciare e
    // la riga è rimasta a `null`. Qui l'avviso tace — ma per una ragione dichiarata, non perché il
    // confronto abbia fallito di nascosto. Era questo il presidio del «difetto noto» di D-072:
    // resta, cambiato di significato, perché il caso che copriva ora si divide in due.
    const { w, posted } = await panel('Centro · F1', RINOMINATO, null);
    await restoreInto(w, 'Scirocco · F2');
    expect(posted()).toEqual({ rowId: 'r-2' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('id d’origine che non risolve (settore cancellato) vale come assente', async () => {
    const { w, posted } = await panel('Centro · F1', DATA, 's-scomparso');
    await restoreInto(w, 'Levante · F2');
    expect(posted()).toEqual({ rowId: 'r-2' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });
});

describe('BeachPanel — disclosure sul ripristino (D-038)', () => {
  it('verso un settore con tariffe dedicate diverso dall’origine: chiede prima, e NON scrive', async () => {
    const { w, posted } = await panel('Levante · F2', DATA, 's-2');
    await restoreInto(w, 'Centro · F1'); // Centro, che ha tariffe dedicate
    expect(posted()).toBeNull();
    // reka-ui teleporta il dialogo fuori dall'albero del wrapper.
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('Levante');
    // La destinazione ha davvero le tariffe dedicate qui: il testo può dirlo.
    expect(document.body.textContent).toContain('dove il listino ha tariffe dedicate');
    expect(document.body.textContent).toContain('saranno prezzati con le tariffe di «Centro»');
    expect(document.body.textContent).not.toContain('il listino generale');
    expect(document.body.textContent).toContain('prenotazioni già registrate');
    w.unmount();
  });

  it('confermando, il ripristino parte con la fila scelta', async () => {
    const { w, posted } = await panel('Levante · F2', DATA, 's-2');
    await restoreInto(w, 'Centro · F1');
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Ripristina comunque'))!;
    confirm.click();
    await settle();
    expect(posted()).toEqual({ rowId: 'r-1' });
    w.unmount();
  });

  it('tornando nel settore da cui era stato ritirato non chiede nulla', async () => {
    const { w, posted } = await panel('Centro · F1', DATA, 's-1');
    await restoreInto(w, 'Centro · F1');
    expect(posted()).toEqual({ rowId: 'r-1' });
    expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
    w.unmount();
  });

  it('quando ENTRAMBI i settori hanno tariffe dedicate: chiede comunque, col testo della destinazione', async () => {
    // Terzo ramo della coppia (destinazione, origine): finora c'erano solo «solo destinazione» e
    // «solo origine» (più «nessuno dei due»). Oggi «entrambi» prende lo stesso percorso di «solo
    // destinazione» nel codice, ma la copertura dichiarata era di tre rami, non quattro.
    const entrambe: EstablishmentStructureDTO = {
      ...DATA, sectors: DATA.sectors.map((s) => ({ ...s, hasDedicatedRates: true })),
    };
    const { w, posted } = await panel('Levante · F2', entrambe, 's-2');
    await restoreInto(w, 'Centro · F1');
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('dove il listino ha tariffe dedicate');
    expect(document.body.textContent).toContain('saranno prezzati con le tariffe di «Centro»');
    w.unmount();
  });

  it('uscire da un settore con tariffe dedicate avvisa anche se l’arrivo non ne ha', async () => {
    // Spec §2.5: conta una tariffa agganciata alla partenza O all'arrivo. Uscendo da «Centro» il
    // prezzo smette di essere quello di «Centro», ed è quella la cosa da dichiarare — non che
    // «Levante» ne acquisti una: qui l'ombrellone la PERDE, non il contrario (4a).
    const { w, posted } = await panel('Centro · F1', DATA, 's-1');
    await restoreInto(w, 'Levante · F2');
    expect(posted()).toBeNull();
    expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
    expect(document.body.textContent).toContain('che non le ha');
    expect(document.body.textContent).toContain('il listino generale');
    expect(document.body.textContent).not.toContain('saranno prezzati con le tariffe di «Levante»');
    expect(document.body.textContent).toContain('prenotazioni già registrate');
    w.unmount();
  });

  it('quando NESSUNO dei due settori ha tariffe dedicate il gesto è diretto', async () => {
    const senzaTariffe: EstablishmentStructureDTO = {
      ...DATA, sectors: DATA.sectors.map((s) => ({ ...s, hasDedicatedRates: false })),
    };
    const { w, posted } = await panel('Centro · F1', senzaTariffe, 's-1');
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
});
