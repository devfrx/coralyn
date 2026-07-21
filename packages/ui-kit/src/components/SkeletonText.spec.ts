import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SkeletonText from './SkeletonText.vue';

describe('SkeletonText', () => {
  it('rende N righe skeleton, ultima più corta (60%)', () => {
    const w = mount(SkeletonText, { props: { lines: 4 } });
    const rows = w.findAll('[data-test="skeleton"]');
    expect(rows).toHaveLength(4);
    expect(rows[3].attributes('style')).toContain('width: 60%');
  });

  it('default 3 righe', () => {
    expect(mount(SkeletonText).findAll('[data-test="skeleton"]')).toHaveLength(3);
  });

  it('deterministico: due mount identici producono lo stesso markup', () => {
    const a = mount(SkeletonText, { props: { lines: 5 } });
    const b = mount(SkeletonText, { props: { lines: 5 } });
    expect(a.html()).toBe(b.html());
  });
});
