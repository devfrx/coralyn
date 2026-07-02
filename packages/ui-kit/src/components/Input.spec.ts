import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from './Input.vue';

afterEach(() => vi.restoreAllMocks());

describe('Input', () => {
  it('accetta modelValue numerico senza warn (v-model su type="number" emette Number)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(Input, { props: { modelValue: 42 }, attrs: { type: 'number' } });
    const typeWarn = warn.mock.calls.find((c) => String(c[0]).includes('Invalid prop'));
    expect(typeWarn).toBeUndefined();
  });

  it('resta compatibile con modelValue stringa', () => {
    const w = mount(Input, { props: { modelValue: 'abc' } });
    expect(w.find('input').element.value).toBe('abc');
  });
});
