import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Icon from './Icon.vue';
import { icons } from '../icons/registry';
import { registerIconCatalog, resetIconCatalog } from '../icons/registered-catalog';
import { lucideCatalog } from '../icons/lucide-catalog';

describe('Icon', () => {
  it('rende un svg per un nome noto', () => {
    expect(mount(Icon, { props: { name: 'umbrella' } }).find('svg').exists()).toBe(true);
  });
  it('usa il fallback per un nome ignoto', () => {
    expect(mount(Icon, { props: { name: 'non-esiste' } }).find('svg').exists()).toBe(true);
  });
  it('resolve le nuove chiavi del registry', () => {
    for (const k of ['bell','settings','euro','clock','phone','mail','renew','pencil','logout','building-2','filter','waves','chevron-down','archive','loader-2']) {
      expect(icons[k]).toBeTruthy();
    }
  });
});

describe('Icon — catena di risoluzione', () => {
  it('senza catalogo registrato, un nome fuori dal registry cade sul fallback', () => {
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.find('svg').exists()).toBe(true);
    expect(w.html()).not.toContain('<path d="M12 6v16');
  });

  it('col catalogo registrato rende il glifo vero, non il fallback', () => {
    registerIconCatalog(lucideCatalog);
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.html()).toContain('circle');
    expect(w.get('svg').attributes('viewBox')).toBe('0 0 24 24');
  });

  it('il registry vince sul catalogo per le icone del chrome', () => {
    registerIconCatalog(lucideCatalog);
    expect(mount(Icon, { props: { name: 'umbrella' } }).find('svg').exists()).toBe(true);
  });

  it('un alias risolve lo stesso glifo del suo padre nel catalogo', () => {
    // 'alert-circle' e' un alias Lucide di 'circle-alert': nessuno dei due e' una chiave del
    // registry (a differenza di 'palmtree', che lo e' e quindi risolverebbe dal registry senza
    // mai toccare il catalogo). Il padre non e' `hidden`, quindi l'alias sopravvive nel catalogo
    // (vedi lucide-catalog.ts).
    registerIconCatalog(lucideCatalog);
    const alias = mount(Icon, { props: { name: 'alert-circle' } });
    const canonico = mount(Icon, { props: { name: 'circle-alert' } });
    const ignoto = mount(Icon, { props: { name: 'nome-che-non-esiste-affatto' } });
    // Stesso glifo del padre: prova che l'alias e' stato seguito, non solo che "c'e' un svg".
    expect(alias.html()).toBe(canonico.html());
    // E diverso dal fallback: prova che non e' semplicemente caduto fuori catalogo.
    expect(alias.html()).not.toBe(ignoto.html());
  });

  it('un nome ignoto non rende NESSUN glifo che una tipologia possa avere addosso', () => {
    // Il difetto vecchio: icons[name] ?? icons['umbrella'] rendeva un ombrellone plausibile per un
    // nome sbagliato, indistinguibile da un ombrellone voluto. Asserire `FALLBACK !== 'umbrella'`
    // non basterebbe: passerebbe con qualsiasi altra chiave, comprese quelle che il picker offre —
    // e allora una tipologia a cui si assegna VOLUTAMENTE quel glifo sarebbe di nuovo
    // indistinguibile da una risoluzione fallita. Il fallback deve stare FUORI dal catalogo.
    registerIconCatalog(lucideCatalog);
    const ignoto = mount(Icon, { props: { name: 'non-esiste-affatto' } }).html();
    for (const sceglibile of ['umbrella', 'alert-triangle', 'circle-help', 'tree-palm']) {
      expect(ignoto).not.toBe(mount(Icon, { props: { name: sceglibile } }).html());
    }
  });

  it('registrare e poi azzerare riporta al comportamento senza catalogo', () => {
    registerIconCatalog(lucideCatalog);
    resetIconCatalog();
    const w = mount(Icon, { props: { name: 'anchor' } });
    expect(w.html()).toBe(mount(Icon, { props: { name: 'altro-ignoto' } }).html());
  });

  it('un nome uguale a un membro di Object.prototype non "trova" nulla nel registry: fallback', () => {
    // Il difetto: `icons[props.name]` con accesso diretto risolverebbe 'toString' alla funzione
    // ereditata da Object.prototype (truthy), rendendo irraggiungibile il ramo v-else del
    // fallback visibile. Object.hasOwn, come in resolveFromCatalog e nel filtro delle suggerite,
    // tratta 'toString' come assente e il template cade sul fallback vero.
    registerIconCatalog(lucideCatalog);
    const w = mount(Icon, { props: { name: 'toString' } });
    expect(w.html()).toBe(mount(Icon, { props: { name: 'nome-che-non-esiste-affatto' } }).html());
  });
});
