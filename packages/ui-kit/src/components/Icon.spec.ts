import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Icon from './Icon.vue';
import { icons } from '../icons/registry';

describe('Icon', () => {
  it('rende un svg per un nome noto', () => {
    expect(mount(Icon, { props: { name: 'umbrella' } }).find('svg').exists()).toBe(true);
  });
  it('usa il fallback per un nome ignoto', () => {
    expect(mount(Icon, { props: { name: 'non-esiste' } }).find('svg').exists()).toBe(true);
  });
  it('resolve le nuove chiavi del registry', () => {
    for (const k of ['bell','settings','euro','clock','phone','mail','renew','edit','logout','building','filter','waves','chevron-down']) {
      expect(icons[k]).toBeTruthy();
    }
  });
});
