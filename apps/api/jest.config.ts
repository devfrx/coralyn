import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',

  // maxWorkers: senza, Jest usa `cpu-1` worker (32 core -> 31 processi) per 50 file di test. Ogni
  // worker istanzia un Program TypeScript completo, dominato da .prisma/client/index.d.ts (~2,4 MB,
  // ~57k righe): 31 copie insieme esaurivano la RAM di sistema e una suite a caso moriva con
  // `FATAL ERROR: Zone Allocation failed - process out of memory`. E' l'allocatore Zone di V8,
  // cioe' memoria del compilatore chiesta all'OS: saturazione della macchina, non una suite che
  // perde memoria. Su 50 file, meta' dei core sono comunque abbondanti.
  maxWorkers: '50%',

  // Cintura: ricicla il worker che sfora invece di lasciarlo crescere fino al teardown (il warning
  // "worker process has failed to exit gracefully" era gia' presente e segnalava memoria trattenuta).
  workerIdleMemoryLimit: '768MB',
};
export default config;
