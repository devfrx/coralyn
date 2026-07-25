import { registerDecorator, ValidationOptions } from 'class-validator';
import { UUID_SHAPE } from './uuid';

/**
 * Valida la FORMA canonica 8-4-4-4-12 di un UUID secondo la policy del repo (`common/uuid.ts`):
 * nessun vincolo di versione/variante RFC-4122. Gemello di `IsCalendarDate`/`IsClockTime`.
 *
 * Esiste perche' `@IsUUID()` di class-validator applica il vincolo RFC e rifiuta gli id sintetici
 * che il seed di sviluppo genera e che Postgres accetta come `uuid` — il Pedalo' shippato non era
 * noleggiabile, e lo stesso `customerId` era accettato da `POST /bookings` e rifiutato da
 * `POST /bookings/:id/transfer` (P1-003/AUD-011). Una regola ESLint vieta ora `@IsUUID`: finche'
 * la strada scorretta non costa nulla, ogni correzione puntuale ha una scadenza.
 */
export function IsUuidShape(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isUuidShape',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a canonical UUID`, ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && UUID_SHAPE.test(value);
        },
      },
    });
  };
}
