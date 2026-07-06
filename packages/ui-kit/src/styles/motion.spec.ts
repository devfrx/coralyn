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
  it('la keyframe del dialog anima solo scale/opacity, mai translate (la centratura resta all\'utility: TW v4 usa la proprietà translate, non transform)', () => {
    expect(css).toMatch(/@keyframes dialog-in[^}]*scale\(\.?96\)/s);
    expect(css).not.toMatch(/@keyframes dialog-in[^}]*translate\(-50%/s);
  });
});
