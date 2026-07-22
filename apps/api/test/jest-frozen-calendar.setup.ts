// Il calendario delle e2e è una FIXTURE, come il seed. Le suite raccontano una storia con date
// letterali leggibili sulla stagione seed «Estate 2026» [2026-05-01, 2026-09-30]
// (helpers/seed-pricing.ts), ma il server valida regole relative a «oggi» in Europe/Rome
// (todayInRome, ADR-0031): suspend richiede S ≥ oggi, absence-release richiede D ≥ oggi.
// Le due cose convivono solo se «oggi» è deterministico: qui si congela l'orologio a METÀ
// stagione, così ogni data letterale delle suite resta per sempre nel suo rapporto originale
// con «oggi» (passato → 422 di guardia, futuro → 200). Senza questo, i test marciscono col
// passare del tempo reale (time-bomb 2026-07-20: 17 test rossi) e nessuna data può più essere
// insieme ≥ oggi e ≤ endDate dopo il 2026-09-30.
//
// Si finge SOLO `Date`: i timer (setTimeout & co.) restano REALI per supertest, Prisma e
// throttler. Il TTL del throttler non scade mai dentro un file (Date.now congelato): irrilevante,
// customer-throttle.e2e asserisce solo il 429 entro richieste ravvicinate, mai il reset.
// I timestamp DB-side (@default(now())) restano reali: nessuna suite li confronta col calendario.
const FAKEABLE_EXCEPT_DATE = [
  'hrtime', 'nextTick', 'performance', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
] as const;

/** «Oggi» delle e2e: 2026-07-15, ore 09:00 Europe/Rome (CEST), metà Estate 2026. */
export const FROZEN_NOW = '2026-07-15T07:00:00Z';
export const FROZEN_TODAY = '2026-07-15';

jest.useFakeTimers({ doNotFake: [...FAKEABLE_EXCEPT_DATE], now: new Date(FROZEN_NOW) });

afterAll(() => {
  jest.useRealTimers();
});
