import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './permission.decorator';
import { Permission, PERMISSION_ROLES } from './permission';

/**
 * Copertura dell'autorizzazione, verificata MECCANICAMENTE su tutti i controller.
 *
 * Il difetto che questo file impedisce di ripetere: con `RolesGuard` allow-by-default, 9
 * controller di dominio sono rimasti scoperti per mesi senza che nulla lo segnalasse, e la suite
 * e2e non poteva accorgersene perché fa login come `admin` ovunque — il ruolo `staff` non era
 * esercitato proprio sugli endpoint che lo riguardavano.
 *
 * Un test che elenca i controller a mano avrebbe lo stesso difetto della doc: invecchia in
 * silenzio. Qui il set di partenza è il **filesystem**, quindi un controller nuovo entra nel
 * test per il solo fatto di esistere. Stesso spirito del test anti-`/privacy` in `legal-routes`.
 */

const SRC_DIR = path.resolve(__dirname, '..');

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.isFile() && entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface Handler {
  controller: string;
  method: string;
  permission: Permission | undefined;
  isPublic: boolean;
}

function handlersOf(file: string): Handler[] {
  // `require` dinamico: il set di controller è il filesystem, non una lista importata a mano
  // (che invecchierebbe in silenzio, che è il difetto che questo file esiste per impedire).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exported = require(file) as Record<string, unknown>;
  return Object.values(exported).flatMap((exp) => {
    if (typeof exp !== 'function') return [];
    const cls = exp as new (...args: never[]) => object;
    if (Reflect.getMetadata(PATH_METADATA, cls) === undefined) return [];
    const proto = cls.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .filter((name) => Reflect.getMetadata(PATH_METADATA, proto[name] as object) !== undefined)
      .map((name) => ({
        controller: cls.name,
        method: name,
        permission:
          (Reflect.getMetadata(PERMISSION_KEY, proto[name] as object) as Permission | undefined) ??
          (Reflect.getMetadata(PERMISSION_KEY, cls) as Permission | undefined),
        isPublic:
          (Reflect.getMetadata(IS_PUBLIC_KEY, proto[name] as object) as boolean | undefined) ??
          (Reflect.getMetadata(IS_PUBLIC_KEY, cls) as boolean | undefined) ??
          false,
      }));
  });
}

const files = controllerFiles(SRC_DIR);
const handlers = files.flatMap(handlersOf);

describe('Copertura dell’autorizzazione (fail-closed, ADR-0057)', () => {
  it('lo scan trova i controller e i loro handler (il test deve poter fallire)', () => {
    // Ancore: se lo scan si rompe, questi numeri crollano invece di lasciare la suite verde.
    expect(files.length).toBeGreaterThanOrEqual(24);
    expect(handlers.length).toBeGreaterThanOrEqual(90);
  });

  it('ogni handler dichiara @RequiresPermission oppure @Public', () => {
    const scoperti = handlers
      .filter((h) => h.permission === undefined && !h.isPublic)
      .map((h) => `${h.controller}.${h.method}`);
    expect(scoperti).toEqual([]);
  });

  it('nessun handler dichiara insieme @Public e un permesso (contraddizione)', () => {
    // @Public salta il guard: un permesso accanto sarebbe un requisito che non viene mai valutato,
    // cioè una protezione apparente. Il canale cliente usa @Public + CustomerJwtGuard, non permessi.
    const ambigui = handlers
      .filter((h) => h.isPublic && h.permission !== undefined)
      .map((h) => `${h.controller}.${h.method}`);
    expect(ambigui).toEqual([]);
  });

  it('ogni permesso dichiarato dal codice esiste nella tabella dei ruoli', () => {
    const ignoti = handlers
      .filter((h) => h.permission !== undefined && !(h.permission in PERMISSION_ROLES))
      .map((h) => `${h.controller}.${h.method} → ${h.permission}`);
    expect(ignoti).toEqual([]);
  });

  it('nessun permesso della tabella è morto (ognuno protegge almeno un endpoint)', () => {
    const usati = new Set(handlers.map((h) => h.permission).filter(Boolean));
    const morti = Object.keys(PERMISSION_ROLES).filter((p) => !usati.has(p as Permission));
    expect(morti).toEqual([]);
  });

  it('nessun permesso è concedibile a zero ruoli (sarebbe un endpoint irraggiungibile)', () => {
    const vuoti = Object.entries(PERMISSION_ROLES)
      .filter(([, roles]) => roles.length === 0)
      .map(([p]) => p);
    expect(vuoti).toEqual([]);
  });
});
