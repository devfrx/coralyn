import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidClockTime } from './time';

/** Valida "HH:MM" come orario 24h reale (gemello di IsCalendarDate). */
export function IsClockTime(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isClockTime',
      target: object.constructor,
      propertyName,
      options: { message: 'time must be a real HH:MM 24h clock time', ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidClockTime(value);
        },
      },
    });
  };
}
