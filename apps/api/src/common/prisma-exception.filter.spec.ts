import { HttpStatus } from '@nestjs/common';
import { mapPrismaKnownError } from './prisma-exception.filter';

describe('mapPrismaKnownError', () => {
  it('mappa P2002 → 409 con messaggio di conflitto', () => {
    const m = mapPrismaKnownError('P2002');
    expect(m).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Operazione in conflitto: esiste già una risorsa con questi dati.',
      error: 'Conflict',
    });
  });

  it('mappa P2023 → 400 con messaggio di id non valido', () => {
    const m = mapPrismaKnownError('P2023');
    expect(m).toEqual({
      status: HttpStatus.BAD_REQUEST,
      message: 'Identificatore non valido.',
      error: 'Bad Request',
    });
  });

  it('mappa P2003 → 409: la FK dimenticata è un conflitto azionabile, non un 500 (AUD-008)', () => {
    const m = mapPrismaKnownError('P2003');
    expect(m).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Operazione in conflitto: la risorsa è collegata ad altri dati.',
      error: 'Conflict',
    });
  });

  it('restituisce null (delega al default) per i codici non gestiti', () => {
    expect(mapPrismaKnownError('P2025')).toBeNull(); // record not found
    expect(mapPrismaKnownError('P2034')).toBeNull(); // deadlock/write conflict
    expect(mapPrismaKnownError('P1000')).toBeNull();
  });
});
