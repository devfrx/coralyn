import { registerDecorator, ValidationOptions } from 'class-validator';
import { icons as lucide } from '@iconify-json/lucide';

/**
 * Valida che il valore sia una chiave icona che il prodotto sa davvero rendere: un nome Lucide non
 * deprecato, oppure un suo alias.
 *
 * Esiste perche' `ValidationPipe` gira senza `forbidNonWhitelisted` e il campo e' una `String?` a
 * schema: senza questo controllo un client puo' scrivere spazzatura nel database, e la Mappa
 * renderebbe il fallback per sempre senza che nessun errore venga mai sollevato. Gemello di
 * `IsUuidShape`.
 *
 * Le `hidden` sono escluse per la stessa ragione per cui non le offre il picker: sono deprecate a
 * monte, e accettarle significherebbe persistere nomi che la libreria puo' togliere.
 */
// ⚠️ Il predicato sugli alias dev'essere IDENTICO per costruzione a quello del catalogo (Task 2):
// il padre dev'essere PRESENTE e non hidden. Scrivere solo `!hidden` non basta, perche'
// `undefined?.hidden` e' falsy e un alias con padre inesistente passerebbe dall'API senza che il
// picker lo offra — cioe' l'API accetterebbe un nome che il prodotto non sa rendere.
const RENDIBILI = new Set(
  Object.entries(lucide.icons).filter(([, d]) => !d.hidden).map(([name]) => name),
);
const VALID = new Set<string>([
  ...RENDIBILI,
  ...Object.entries(lucide.aliases ?? {})
    .filter(([, d]) => d.parent && RENDIBILI.has(d.parent))
    .map(([alias]) => alias),
]);

export function IsIconKey(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIconKey',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a known icon key`, ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && VALID.has(value);
        },
      },
    });
  };
}
