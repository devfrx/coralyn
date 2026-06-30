import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCalendarDate } from '../../common/dates';

/** Valida 'yyyy-mm-dd' come data di calendario reale (no 2026-13-40). */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: { message: 'date must be a real yyyy-mm-dd calendar date', ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCalendarDate(value);
        },
      },
    });
  };
}
