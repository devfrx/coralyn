import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// NB: sotto jsdom la global `URL` è quella di jsdom e `fs.readFileSync` la rifiuta
// ("URL must be of scheme file"): si usa esplicitamente la `URL` nativa di Node.
// I tipi `node:*` arrivano da `@types/node` (vedi tsconfig.json → compilerOptions.types).
import { URL as NodeURL } from 'node:url';

const css = readFileSync(new NodeURL('./theme.css', import.meta.url), 'utf8');

describe('motion tokens & keyframes (theme.css)', () => {
  it('definisce i token di durata', () => {
    for (const token of ['--motion-fast', '--motion-base', '--motion-slow']) {
      expect(css).toContain(token);
    }
  });
  it('definisce le keyframes usate dagli overlay e dai toast', () => {
    for (const kf of ['overlay-in', 'overlay-out', 'dialog-in', 'dialog-out', 'drawer-in', 'drawer-out', 'toast-in', 'toast-out']) {
      expect(css).toContain(`@keyframes ${kf}`);
    }
  });
  it('le keyframes del dialog preservano la centratura (-50%, -50%)', () => {
    expect(css).toMatch(/@keyframes dialog-in[^}]*translate\(-50%,\s*-50%\)/s);
  });
});
