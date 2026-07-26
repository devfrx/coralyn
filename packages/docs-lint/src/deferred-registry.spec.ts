import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLOSURE_MARKERS, parseRegistry } from './deferred-registry';

/**
 * Il presidio di `deferred.md`, sul modello di `single-source.spec.ts` e con la stessa domanda:
 * non «il registro è ancora coerente?» ma **«cosa lo renderebbe rosso se smettesse di esserlo?»**.
 *
 * Misurato prima di scriverlo, sul file com'era il 2026-07-26: **6 voci chiuse nella tabella delle
 * aperte** (D-013, D-035, D-037, D-039, D-045, D-051), **4 aperte sotto «Risolte»** (D-059, D-063,
 * **D-064**, **D-066** — cioè le due decisioni in attesa dell'utente), **2 duplicate** (D-037,
 * D-051). Nessuna di queste incoerenze aveva un test che la nominasse, e in questo repo una
 * deferred chiusa per sbaglio è già successa.
 *
 * Il parser ha una fixture con la risposta nota, per la ragione che ADR-0059 documenta: in questa
 * area lo strumento si è rotto otto volte e l'oggetto misurato zero.
 */
const REGISTRY = path.resolve(import.meta.dirname, '../../../docs/architecture/deferred.md');

describe('parseRegistry — fixture a risposta nota', () => {
  const FIXTURE = [
    '# Registro',
    '',
    '## Indice',
    '',
    '| ID | Tema | Stato |',
    '|---|---|---|',
    '| [D-001](#d-001) | Primo tema | 🔓 aperta |',
    '| [D-002](#d-002) | Secondo tema | ✅ chiusa |',
    '',
    '## Aperte',
    '',
    '| ID | Tema | Perché | Trigger | Impatto |',
    '|---|---|---|---|---|',
    '| <a id="d-001"></a>D-001 | Primo tema | perché | trigger | impatto |',
    '',
    '## Chiuse',
    '',
    '### Voci estese',
    '',
    '- <a id="d-002"></a>**D-002** — Secondo tema → **RISOLTA** da ADR-0001.',
    '',
  ].join('\n');

  const parsed = parseRegistry(FIXTURE);

  it('legge l’indice con id, tema, href e stato', () => {
    expect(parsed.index).toEqual([
      { id: 'D-001', href: '#d-001', tema: 'Primo tema', status: 'aperta', line: 7 },
      { id: 'D-002', href: '#d-002', tema: 'Secondo tema', status: 'chiusa', line: 8 },
    ]);
  });

  it('deriva lo stato di una voce dalla SEZIONE, non dal suo testo', () => {
    expect(parsed.entries.map((e) => [e.id, e.status])).toEqual([
      ['D-001', 'aperta'],
      ['D-002', 'chiusa'],
    ]);
  });

  it('legge sia le righe di tabella sia le voci estese, con il loro anchor', () => {
    expect(parsed.entries.map((e) => e.anchor)).toEqual(['d-001', 'd-002']);
  });

  it('non scambia le righe dell’indice per voci', () => {
    // Le righe dell'indice sono righe di tabella con un ID: senza lo scoping per sezione
    // finirebbero fra le voci, e ogni ID risulterebbe duplicato.
    expect(parsed.entries).toHaveLength(2);
  });
});

describe('deferred.md — il registro è coerente con sé stesso', () => {
  const markdown = fs.readFileSync(REGISTRY, 'utf8');
  const { index, entries } = parseRegistry(markdown);

  it('il presidio guarda dove crede di guardare', () => {
    expect(entries.length).toBeGreaterThan(50);
    expect(index.length).toBeGreaterThan(50);
    expect(entries.filter((e) => e.status === 'aperta').length).toBeGreaterThan(10);
    expect(entries.filter((e) => e.status === 'chiusa').length).toBeGreaterThan(10);
  });

  it('nessun ID compare due volte', () => {
    const seen = new Map<string, number[]>();
    for (const e of entries) seen.set(e.id, [...(seen.get(e.id) ?? []), e.line]);
    const doppi = [...seen].filter(([, righe]) => righe.length > 1).map(([id, righe]) => `${id} alle righe ${righe.join(', ')}`);

    expect(doppi, '\nUna voce vive in un posto solo: unisci le due stesure e tieni la più completa.\n').toEqual([]);
  });

  it('ogni voce ha l’anchor che corrisponde al suo ID', () => {
    const sbagliati = entries
      .filter((e) => e.anchor !== e.id.toLowerCase())
      .map((e) => `${e.id} (riga ${e.line}) ha anchor ${e.anchor ?? 'ASSENTE'}`);

    expect(sbagliati, '\nOgni voce dichiara `<a id="d-0nn"></a>`, così i documenti possono citarla con precisione.\n').toEqual([]);
  });

  it('l’indice e le voci coincidono, ID per ID e stato per stato', () => {
    const perIndice = new Map(index.map((r) => [r.id, r.status]));
    const perVoce = new Map(entries.map((e) => [e.id, e.status]));

    const soloIndice = [...perIndice.keys()].filter((id) => !perVoce.has(id));
    const soloVoci = [...perVoce.keys()].filter((id) => !perIndice.has(id));
    const discordi = [...perVoce].filter(([id, s]) => perIndice.has(id) && perIndice.get(id) !== s).map(([id, s]) => `${id}: indice dice ${perIndice.get(id)}, la voce sta fra le ${s}`);

    expect({ soloIndice, soloVoci, discordi }).toEqual({ soloIndice: [], soloVoci: [], discordi: [] });
  });

  it('ogni voce fra le chiuse dice di essere chiusa', () => {
    // Una direzione sola, e il perché è in `CLOSURE_MARKERS`: D-061 contiene «CHIUSA sul piano
    // tecnico» ed è aperta, quindi il controllo opposto sarebbe rosso su una voce corretta.
    const mute = entries
      .filter((e) => e.status === 'chiusa' && !CLOSURE_MARKERS.test(e.body))
      .map((e) => `${e.id} (riga ${e.line})`);

    expect(mute, '\nUna voce sotto «Chiuse» deve dire da cosa è stata chiusa: ADR, branch o commit.\n').toEqual([]);
  });

  it('l’indice è ordinato per numero, così una voce si trova senza cercarla', () => {
    const numeri = index.map((r) => Number(r.id.slice(2)));
    expect(numeri).toEqual([...numeri].sort((a, b) => a - b));
  });

  it('ogni voce dell’indice ha un tema, non solo un ID', () => {
    const senzaTema = index.filter((r) => r.tema.length < 8).map((r) => r.id);
    expect(senzaTema).toEqual([]);
  });
});
