import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Select from './Select.vue';

describe('Select', () => {
  it('rende le option da props.options e supporta v-model', async () => {
    const w = mount(Select, {
      props: {
        options: [
          { value: 'a', label: 'Alfa' },
          { value: 'b', label: 'Beta' },
        ],
        modelValue: 'a',
      },
    });
    const options = w.findAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].text()).toBe('Alfa');
    expect(w.find('select').element.value).toBe('a');
  });

  it('con slot #default rende gli <option> passati (gruppi/"Nessun…")', () => {
    const w = mount(Select, {
      props: { modelValue: '' },
      slots: { default: '<option value="">Nessun pacchetto</option><option value="p1">Standard</option>' },
    });
    expect(w.findAll('option')).toHaveLength(2);
    expect(w.text()).toContain('Nessun pacchetto');
  });

  it('emette le classi standard del select stilizzato', () => {
    const w = mount(Select, { props: { modelValue: '' } });
    expect(w.find('select').classes()).toEqual(
      expect.arrayContaining([
        'w-full',
        'rounded-[var(--radius-md)]',
        'border-[1.5px]',
        'border-[var(--color-border-input)]',
        'bg-[var(--color-surface)]',
        'px-3.5',
        'py-3',
        'text-[13.5px]',
        'text-[var(--color-text)]',
        'outline-none',
        'focus:border-[var(--color-brand)]',
        'focus:[box-shadow:var(--ring-focus)]',
      ]),
    );
  });

  it('passa attraverso gli attributi nativi (inheritAttrs coerente con Input.vue)', () => {
    const w = mount(Select, { props: { modelValue: '' }, attrs: { name: 'pacchetto', disabled: true } });
    expect(w.find('select').attributes('name')).toBe('pacchetto');
    expect(w.find('select').attributes('disabled')).toBeDefined();
  });

  it('mostra un anello di focus coerente (come Input/Textarea)', () => {
    const cls = mount(Select).classes().join(' ');
    expect(cls).toContain('focus:border-[var(--color-brand)]');
    expect(cls).toContain('focus:[box-shadow:var(--ring-focus)]');
    expect(cls).toContain('rounded-[var(--radius-md)]');
  });
});
