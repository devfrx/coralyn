import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import type { CustomerProvisionResponse } from '@coralyn/contracts';
import CustomerAccessModal from './CustomerAccessModal.vue';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRMOCK') },
}));

const result: CustomerProvisionResponse = {
  activationUrl: 'https://app.coralyn.example/attiva?token=abc123',
  pin: '482913',
  expiresAt: '2026-08-01T10:00:00.000Z',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

async function mount() {
  const w = mountApp(CustomerAccessModal, {
    attachTo: document.body,
    props: { open: false, result },
  });
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('CustomerAccessModal', () => {
  it('mostra link, PIN e QR quando aperto con result', async () => {
    const w = await mount();
    expect(document.querySelector('[data-testid="access-link"]')?.textContent).toContain('token=abc123');
    expect(document.querySelector('[data-testid="access-pin"]')?.textContent).toContain('482913');
    expect(document.querySelector('[data-testid="access-qr"]')?.getAttribute('src')).toBe('data:image/png;base64,QRMOCK');
    w.unmount();
  });

  it('copia il link negli appunti al click', async () => {
    const w = await mount();
    (document.querySelector('[data-testid="copy-link"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.coralyn.example/attiva?token=abc123');
    w.unmount();
  });

  it('copia il PIN negli appunti al click', async () => {
    const w = await mount();
    (document.querySelector('[data-testid="copy-pin"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('482913');
    w.unmount();
  });
});
