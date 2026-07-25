import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Mappa i codici Prisma noti che altrimenti sfuggirebbero come 500 verso status HTTP puliti.
 * `null` = codice non gestito → il chiamante delega al comportamento di default (500 + log).
 * D-041 (P2002→409), D-050 (P2023→400) e AUD-008 (P2003→409): companion, gestiti in un unico punto.
 */
export function mapPrismaKnownError(
  code: string,
): { status: number; message: string; error: string } | null {
  switch (code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'Operazione in conflitto: esiste già una risorsa con questi dati.',
        error: 'Conflict',
      };
    case 'P2003':
      // Violazione di FK. È il BACKSTOP della cascata applicativa dimenticata: ogni FK RESTRICT
      // nuova nasce con un errore azionabile invece di un 500 (P1-002/AUD-008 — `Season` ne ha
      // acquisite due senza che nessuno aggiornasse `SeasonsService.remove`). Il messaggio è
      // volutamente generico: quello specifico lo dà la guardia del service, che conosce le
      // dipendenze e le sa nominare (cfr. `SeasonsService.remove`, `deletePackage`).
      return {
        status: HttpStatus.CONFLICT,
        message: 'Operazione in conflitto: la risorsa è collegata ad altri dati.',
        error: 'Conflict',
      };
    case 'P2023':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Identificatore non valido.',
        error: 'Bad Request',
      };
    default:
      return null;
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const mapped = mapPrismaKnownError(exception.code);
    if (!mapped) {
      // Codici non gestiti (P2025/P2034/…): comportamento INVARIATO (default Nest = 500 + log).
      super.catch(exception, host);
      return;
    }
    const res = host.switchToHttp().getResponse<Response>();
    res.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      error: mapped.error,
    });
  }
}
