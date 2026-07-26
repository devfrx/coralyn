import { availableParallelism } from 'node:os';
import type { Config } from 'jest';

// Cap dei worker, ADR-0061 (D-066). «Meta' dei core, ma non piu' di 4»: il tetto assoluto e' cio'
// che serviva, perche' una percentuale cresce con la macchina proprio dove il problema e' la
// macchina grande — 50% su 32 core sono 16 worker. Sul runner CI (4 core) la formula da' 2, cioe'
// esattamente il `50%` di prima: la CI non cambia. `availableParallelism` e non `cpus().length`
// perche' rispetta i limiti di cgroup, che in un container sono la verita'.
const MAX_WORKERS = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',

  // Senza, Jest usa `cpu-1` worker (32 core -> 31 processi) per 59 file di test. Ogni worker
  // istanzia un Program TypeScript completo, dominato da .prisma/client/index.d.ts (~2,4 MB,
  // ~57k righe): 31 copie insieme esaurivano la RAM di sistema e una suite a caso moriva con
  // `FATAL ERROR: Zone Allocation failed - process out of memory`. E' l'allocatore Zone di V8,
  // cioe' memoria del compilatore chiesta all'OS: saturazione della macchina, non una suite che
  // perde memoria.
  // ⚠️ `50%` non bastava: su questa macchina erano ancora 16 worker, e D-066 si riproduceva su
  // questo pacchetto DA SOLO. Vedi MAX_WORKERS sopra.
  maxWorkers: MAX_WORKERS,

  // Cintura: ricicla il worker che sfora invece di lasciarlo crescere fino al teardown (il warning
  // "worker process has failed to exit gracefully" era gia' presente e segnalava memoria trattenuta).
  workerIdleMemoryLimit: '768MB',
};
export default config;
