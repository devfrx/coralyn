import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { CONFIGURABLE_PERMISSIONS, Permission, Role } from '@coralyn/contracts';
import { mountApp, permissionsOfRole } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import StaffPermissionsModal from './StaffPermissionsModal.vue';

// Il Modal ui-kit teleporta in document.body: si legge/scrive via document.querySelector, come le
// altre spec di modal del progetto.
const TARGET = 'u-9';
const sel = (p: Permission) => document.querySelector(`[data-testid="permission-${p}"]`) as HTMLButtonElement;

/** L'admin che configura: serve `team.manage`, altrimenti la query è disabilitata. */
function asAdmin() {
  const s = useSessionStore();
  s.user = {
    id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin,
    establishmentId: 'e-1', establishmentName: 'Lido', permissions: permissionsOfRole(Role.Admin),
  };
}

function mockPermissions(effective: Permission[], onPut?: (body: unknown) => void) {
  server.use(
    http.get(`/api/establishment/users/${TARGET}/permissions`, () =>
      HttpResponse.json({ userId: TARGET, permissions: effective }),
    ),
    http.put(`/api/establishment/users/${TARGET}/permissions`, async ({ request }) => {
      const body = await request.json();
      onPut?.(body);
      return HttpResponse.json({ userId: TARGET, permissions: (body as { permissions: Permission[] }).permissions });
    }),
  );
}

/**
 * ⚠️ La sessione va impostata DOPO il mount: `mountApp` installa una Pinia propria, e chiamare
 * `useSessionStore()` prima colpirebbe un'istanza diversa da quella del componente — la query
 * resterebbe disabilitata (`enabled` richiede `team.manage`) e gli interruttori tutti spenti.
 */
const mount = () => {
  const w = mountApp(StaffPermissionsModal, {
    attachTo: document.body,
    props: { open: true, userId: TARGET, email: 'bagnino@lido.it' },
  });
  asAdmin();
  return w;
};

describe('StaffPermissionsModal (ADR-0063)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mostra un interruttore per ciascuno dei 17 configurabili, e NESSUNO per gli altri due', async () => {
    mockPermissions(permissionsOfRole(Role.Staff));
    mount();
    await flushPromises();
    const interruttori = document.querySelectorAll('button[data-testid^="permission-"]');
    expect(interruttori).toHaveLength(CONFIGURABLE_PERMISSIONS.length);
    expect(CONFIGURABLE_PERMISSIONS).toHaveLength(17);
    // I due non configurabili non devono comparire: il backend li rifiuterebbe con un 400.
    expect(sel(Permission.SessionRead)).toBeNull();
    expect(sel(Permission.PlatformAdminister)).toBeNull();
  });

  it('lo stato iniziale rispecchia i permessi effettivi, non il default', async () => {
    // Listino revocato, editor della struttura concesso: due scarti in versi opposti.
    const effettivi = permissionsOfRole(Role.Staff)
      .filter((p) => p !== Permission.PricingManage)
      .concat(Permission.StructureManage);
    mockPermissions(effettivi);
    mount();
    await flushPromises();
    expect(sel(Permission.PricingManage).getAttribute('aria-pressed')).toBe('false');
    expect(sel(Permission.StructureManage).getAttribute('aria-pressed')).toBe('true');
    expect(sel(Permission.MapRead).getAttribute('aria-pressed')).toBe('true');
  });

  it('salva l’insieme COMPLETO desiderato, non un delta', async () => {
    let inviato: { permissions: Permission[] } | null = null;
    mockPermissions(permissionsOfRole(Role.Staff), (b) => { inviato = b as { permissions: Permission[] }; });
    mount();
    await flushPromises();
    sel(Permission.PricingManage).click(); // spegne il Listino
    await flushPromises();
    (document.querySelector('[data-testid="save-permissions"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(inviato).not.toBeNull();
    const corpo = inviato as unknown as { permissions: Permission[] };
    expect(corpo.permissions).not.toContain(Permission.PricingManage);
    // Completo, non un delta: le altre voci accese ci sono tutte.
    expect(corpo.permissions).toContain(Permission.MapRead);
    expect(corpo.permissions).toContain(Permission.BookingsManage);
    // E mai i non configurabili, che il server rifiuterebbe.
    expect(corpo.permissions).not.toContain(Permission.SessionRead);
  });

  it('l’interruttore commuta nei due versi', async () => {
    mockPermissions(permissionsOfRole(Role.Staff));
    mount();
    await flushPromises();
    const b = sel(Permission.MapRead);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click();
    await flushPromises();
    expect(sel(Permission.MapRead).getAttribute('aria-pressed')).toBe('false');
    sel(Permission.MapRead).click();
    await flushPromises();
    expect(sel(Permission.MapRead).getAttribute('aria-pressed')).toBe('true');
  });

  it('un guasto della lettura mostra l’errore, non una lista vuota di interruttori spenti', async () => {
    // AUD-012: «un guasto indistinguibile da nessun dato». Qui sarebbe peggio del solito — una
    // lista tutta spenta suggerirebbe che l'operatore non ha alcun permesso.
    server.use(
      http.get(`/api/establishment/users/${TARGET}/permissions`, () => new HttpResponse(null, { status: 500 })),
    );
    mount();
    await flushPromises();
    expect(document.querySelectorAll('button[data-testid^="permission-"]')).toHaveLength(0);
    expect(document.body.textContent).toContain('Permessi non disponibili');
  });

  // ⚠️ Il gemello del test qui sopra, dal lato della SCRITTURA. AUD-012 era chiusa solo per la
  // lettura: il footer del Modal sta fuori dal QueryBoundary, quindi con la GET in errore Salva
  // restava cliccabile e inviava `{"permissions":[]}` — che il server tratta come insieme completo
  // desiderato. Non un buco di autorizzazione (degrada in «nega tutto»), ma una perdita di dati
  // silenziosa, per giunta confermata da un toast di successo.
  it('con la lettura in errore, Salva è disabilitato e NON invia un insieme vuoto', async () => {
    let inviato: unknown = null;
    server.use(
      http.get(`/api/establishment/users/${TARGET}/permissions`, () => new HttpResponse(null, { status: 500 })),
      http.put(`/api/establishment/users/${TARGET}/permissions`, async ({ request }) => {
        inviato = await request.json();
        return HttpResponse.json({ userId: TARGET, permissions: [] });
      }),
    );
    mount();
    await flushPromises();
    const salva = document.querySelector('[data-testid="save-permissions"]') as HTMLButtonElement;
    expect(salva.disabled).toBe(true);
    salva.click();
    await flushPromises();
    expect(inviato).toBeNull();
    expect(document.body.textContent).not.toContain('Permessi aggiornati.');
  });

  // La finestra anti-flicker: `useDelayedLoading` tiene lo scheletro nascosto per i primi ms, e in
  // quella finestra il modale è visivamente vuoto ma già interattivo.
  it('mentre la lettura è in corso, Salva è disabilitato e NON invia un insieme vuoto', async () => {
    let inviato: unknown = null;
    server.use(
      http.get(`/api/establishment/users/${TARGET}/permissions`, () => new Promise(() => {})),
      http.put(`/api/establishment/users/${TARGET}/permissions`, async ({ request }) => {
        inviato = await request.json();
        return HttpResponse.json({ userId: TARGET, permissions: [] });
      }),
    );
    mount();
    await flushPromises();
    const salva = document.querySelector('[data-testid="save-permissions"]') as HTMLButtonElement;
    expect(salva.disabled).toBe(true);
    salva.click();
    await flushPromises();
    expect(inviato).toBeNull();
  });

  // I due test sopra provano il gate VISIVO. Questo prova la guardia in `submit()`, cioè quello che
  // resta se il footer perde il binding in un refactor: `dispatchEvent` raggiunge il listener anche
  // su un bottone disabilitato, mentre `.click()` no.
  it('anche forzando il click, con la lettura in errore submit() non invia nulla', async () => {
    let inviato: unknown = null;
    server.use(
      http.get(`/api/establishment/users/${TARGET}/permissions`, () => new HttpResponse(null, { status: 500 })),
      http.put(`/api/establishment/users/${TARGET}/permissions`, async ({ request }) => {
        inviato = await request.json();
        return HttpResponse.json({ userId: TARGET, permissions: [] });
      }),
    );
    mount();
    await flushPromises();
    const salva = document.querySelector('[data-testid="save-permissions"]') as HTMLButtonElement;
    salva.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(inviato).toBeNull();
  });
});
