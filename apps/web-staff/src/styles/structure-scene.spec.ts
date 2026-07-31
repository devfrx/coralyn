import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Le evidenze di STATO della fila devono vincere sull'hover (D-074).
 *
 * `.st-row-drop` (fila bersaglio del rilascio) e `.st-row-sel` (fila selezionata) scrivono
 * `background`, e la stessa proprietà è scritta anche da `.st-row:hover` — che con una classe **più**
 * una pseudo-classe ha specificità superiore e vince comunque la si ordini nel file.
 *
 * ⚠️ **Il caso non è teorico ed è stato osservato, non dedotto** (2026-07-31, browser Chromium, pagina
 * autonoma che riproduce questa cascata con un drag HTML5 nativo):
 *
 * - trascinando su un'ALTRA fila, `:hover` non risulta applicato durante il drag e `.st-row-drop`
 *   dipinge: lì il segno di rilascio si vedeva;
 * - trascinando DENTRO la stessa fila — il riordino più comune del Cantiere, e la fila di partenza è
 *   per costruzione quella che il puntatore stava sorvolando quando la maniglia è comparsa —
 *   `:hover` resta applicato per tutta la durata del trascinamento, e il segno di rilascio **non si
 *   vedeva affatto**.
 *
 * Questo test non può osservare la resa: jsdom non calcola la cascata e il repo non ha test di
 * browser ([ADR-0065](../../../../docs/architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md)
 * §Negative). Verifica la **regola** che rende quell'osservazione impossibile: a parità di proprietà,
 * la regola di stato deve battere quella di hover per specificità o, a pari specificità, per ordine.
 */

const CSS_PATH = path.resolve(__dirname, 'structure-scene.css');

type Rule = { selector: string; order: number };

/** Selettori (uno per voce della lista) delle regole che scrivono `background`, in ordine di file. */
function backgroundSelectors(css: string): Rule[] {
  const out: Rule[] = [];
  let order = 0;
  // Regola = «testo senza graffe { corpo senza graffe }». Il blocco @media in coda non ha corpi
  // annidati con `background`, e questa forma lo attraversa senza inciampare.
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selectorList, body] of senzaCommenti.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    order += 1;
    if (!/(^|[;\s])background(-color)?\s*:/.test(body)) continue;
    for (const selector of selectorList.split(',')) out.push({ selector: selector.trim(), order });
  }
  return out;
}

/**
 * Peso della colonna «classi» della specificità: classi, attributi e pseudo-CLASSI.
 * Le altre due colonne sono coperte dalla guardia qui sotto, che pretende che questo file non usi
 * né id né nomi di elemento — se un giorno ne usasse, il test lo dice invece di rispondere a caso.
 */
function classWeight(selector: string): number {
  const senzaPseudoElementi = selector.replace(/::[\w-]+/g, '');
  return (senzaPseudoElementi.match(/\.[\w-]+/g) ?? []).length
    + (senzaPseudoElementi.match(/\[[^\]]*\]/g) ?? []).length
    + (senzaPseudoElementi.match(/:[\w-]+/g) ?? []).length;
}

/** true se `a` dipinge sopra `b`: specificità maggiore, o pari specificità e più in basso nel file. */
function vince(a: Rule, b: Rule): boolean {
  const wa = classWeight(a.selector);
  const wb = classWeight(b.selector);
  return wa > wb || (wa === wb && a.order > b.order);
}

describe('structure-scene.css — le evidenze di stato della fila battono l’hover (D-074)', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const regole = backgroundSelectors(css);
  const hover = regole.filter((r) => /^\.st-row[\w-]*:hover$/.test(r.selector));

  it('il calcolo di specificità è applicabile: nessun id e nessun nome di elemento nei selettori', () => {
    const fuoriIpotesi = regole
      .map((r) => r.selector)
      .filter((s) => /#/.test(s) || /(^|[\s>+~])[a-z]/i.test(s.replace(/::[\w-]+/g, '')));
    expect(fuoriIpotesi).toEqual([]);
  });

  it('la regola dell’hover sulla fila esiste ancora: è lei l’avversaria', () => {
    // Senza questa, i due test sotto passerebbero a vuoto il giorno in cui `.st-row:hover`
    // smettesse di scrivere `background` — verdi, e ciechi.
    expect(hover.map((r) => r.selector)).toContain('.st-row:hover');
  });

  for (const stato of ['.st-row-drop', '.st-row-sel']) {
    it(`${stato} dipinge sopra l’hover della fila`, () => {
      const regoleStato = regole.filter((r) => r.selector.includes(stato) && !/[\s>+~]/.test(r.selector));
      expect(regoleStato.length).toBeGreaterThan(0);
      for (const r of regoleStato) {
        for (const h of hover) {
          expect(vince(r, h), `«${r.selector}» deve battere «${h.selector}»`).toBe(true);
        }
      }
    });
  }
});
