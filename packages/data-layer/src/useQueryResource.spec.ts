import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { clearToasts, useToasts } from '@coralyn/ui-kit/toasts';
import { mountHook } from './test/host';
import { queryResource, mutationResource } from './useQueryResource';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };

describe('queryResource', () => {
  it('esegue queryFn e ritorna .data reattivo', async () => {
    const queryFn = vi.fn().mockResolvedValue(['a', 'b']);
    const { api } = mountHook(() => queryResource({ queryKey: () => ['test-key'], queryFn }));
    await flushPromises();
    await tick();
    await flushPromises();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(api().data.value).toEqual(['a', 'b']);
  });

  it('la queryKey è reattiva: cambia quando cambia la dipendenza', async () => {
    const dep = ref('x');
    const queryFn = vi.fn().mockResolvedValue('ok');
    mountHook(() => queryResource({ queryKey: () => ['test-key', dep.value], queryFn }));
    await flushPromises();
    dep.value = 'y';
    await flushPromises();
    await tick();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('mutationResource', () => {
  it('esegue mutationFn e invoca invalidates() (lazy) dopo il successo', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const invalidates = vi.fn().mockReturnValue([['test-key']]);
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates }));
    await api().mutateAsync('input');
    await flushPromises();
    expect(mutationFn).toHaveBeenCalledWith('input', expect.anything());
    expect(invalidates).toHaveBeenCalled();
  });

  // Prima l'invalidazione stava in onSuccess: dopo un fallimento l'albero smentito dal server
  // restava a schermo finché l'utente non ricaricava la pagina. Ma i rifiuti più probabili di una
  // scrittura su una struttura condivisa («quella fila non esiste più», «quella posizione è fuori
  // dalla fila») dicono proprio che la copia in cache è vecchia.
  it('rilegge anche quando la mutation FALLISCE: il rifiuto del server dice che la cache è vecchia', async () => {
    const queryFn = vi.fn().mockResolvedValue('albero');
    const mutationFn = vi.fn().mockRejectedValue(new Error('Fila non trovata.'));
    const { api } = mountHook(() => ({
      albero: queryResource({ queryKey: () => ['albero'], queryFn }),
      sposta: mutationResource({ mutationFn, invalidates: () => [['albero']] }),
    }));
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(1);

    await expect(api().sposta.mutateAsync('x')).rejects.toThrow();
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  // La mutation si conclude appena risponde la SCRITTURA: la rilettura innescata è lanciata e non
  // attesa. È la scelta documentata in useQueryResource.ts — attenderla toglierebbe il rimbalzo
  // alle anteprime ottimistiche ma farebbe cadere le callback della singola `mutate()` nei
  // componenti che la rilettura stessa smonta. Se un giorno la si attende, questo test lo dice.
  it('si conclude senza aspettare la rilettura che ha innescato', async () => {
    let releaseRilettura: () => void = () => {};
    const queryFn = vi.fn()
      .mockResolvedValueOnce('vecchio')
      .mockImplementationOnce(() => new Promise((resolve) => { releaseRilettura = () => resolve('nuovo'); }));
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const { api } = mountHook(() => ({
      albero: queryResource({ queryKey: () => ['albero'], queryFn }),
      sposta: mutationResource({ mutationFn, invalidates: () => [['albero']] }),
    }));
    await settle();

    await api().sposta.mutateAsync('x');
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(2); // la rilettura è partita…
    expect(api().albero.data.value).toBe('vecchio'); // …ma non è ancora atterrata
    expect(api().sposta.isPending.value).toBe(false);

    releaseRilettura();
    await settle();
    expect(api().albero.data.value).toBe('nuovo');
  });
});

describe('mutationResource — feedback errori (Slice A)', () => {
  it("su errore pubblica un toast col message dell'errore", async () => {
    clearToasts();
    const mutationFn = vi.fn().mockRejectedValue(new Error('Pacchetto in uso: non eliminabile.'));
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates: () => [] }));
    await expect(api().mutateAsync('x')).rejects.toThrow();
    await flushPromises();
    expect(useToasts().items.map((t) => t.message)).toEqual(['Pacchetto in uso: non eliminabile.']);
  });

  it('quiet: true NON pubblica il toast (il chiamante gestisce inline, es. SettlePaymentModal)', async () => {
    clearToasts();
    const mutationFn = vi.fn().mockRejectedValue(new Error('boom'));
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates: () => [], quiet: true }));
    await expect(api().mutateAsync('x')).rejects.toThrow();
    await flushPromises();
    expect(useToasts().items).toHaveLength(0);
  });
});
