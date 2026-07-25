// Importato qui e non solo in main.ts: `enableImplicitConversion` legge i design:type via
// Reflect, e questo modulo gira anche fuori dal bootstrap Nest (unit spec).
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Schema della configurazione, verificato all'AVVIO (AUD-016/017, radice R2 di P7).
 *
 * Il difetto che chiude: la stessa domanda — «questa variabile è obbligatoria?» — riceveva tre
 * risposte diverse nello stesso servizio. `JWT_SECRET` e `MAIL_HOST` facevano fallire l'avvio;
 * `APP_WEB_STAFF_URL` e `MAIL_FROM` fallivano al PRIMO INVITO (l'API partiva healthy e il primo
 * invito reale esplodeva con 500); `CUSTOMER_APP_URL` non falliva mai e degradava in silenzio,
 * producendo un `activationUrl` **relativo** — QR inutilizzabile, e il token monouso già bruciato
 * perché generarlo revoca i precedenti. L'unica traccia era un cliente che dice «non funziona».
 *
 * Due scelte deliberate:
 *
 * 1. **Nessuna nuova dipendenza.** `@nestjs/config` documenta Joi, ma `class-validator` e
 *    `class-transformer` sono già dipendenze dirette e sono l'idioma dei 45 DTO del repo.
 *    Introdurre un secondo validatore avrebbe aggiunto un modo diverso di fare la stessa cosa.
 *
 * 2. **Si valida, non si trasforma.** `validateEnv` restituisce l'oggetto ricevuto, invariato.
 *    I lettori esistenti fanno `Number(config.get('MAIL_PORT') || '1025')` e
 *    `config.get('MAIL_SECURE') === 'true'`: coercire i tipi qui li romperebbe in silenzio, e
 *    proprio il confronto con `'true'` diventerebbe sempre falso. La validazione rende quei
 *    `Number(...)` provabilmente sicuri, che è ciò che serviva — `CUSTOMER_THROTTLE_LIMIT=abc`
 *    non arriva più al throttler come `NaN`.
 *
 * I **default non sono qui**: restano nel punto di lettura. Duplicarli darebbe una settima sede
 * agli stessi valori (sono già in sei file, finding aperto): questo schema dichiara cosa è
 * *ammissibile*, non cosa vale in assenza. Le variabili con un default nel codice sono
 * `@IsOptional()`; le altre sono obbligatorie e la loro assenza ferma l'avvio.
 *
 * I nomi delle proprietà sono le variabili d'ambiente stesse: mapping 1:1, nessuno strato di
 * traduzione da tenere allineato.
 */
class EnvVars {
  // ---- Obbligatorie: senza, l'API non deve partire ----

  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL deve essere un URL postgresql://' })
  DATABASE_URL!: string;

  // 32 caratteri: sotto questa soglia la firma HS256 è indebolita, ed è la lunghezza che gli
  // example dichiarano da sempre («almeno 32 caratteri casuali»).
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET deve avere almeno 32 caratteri' })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  MAIL_HOST!: string;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM!: string;

  // require_tld: false — in sviluppo questi sono `http://localhost:5173` e simili, che sono URL
  // legittimi. È il ramo relativo/vuoto che va escluso, non l'assenza di un dominio pubblico.
  @IsUrl({ require_tld: false, require_protocol: true })
  APP_WEB_STAFF_URL!: string;

  /**
   * Origin pubblico dell'app dei bagnanti: è il prefisso del link `/attiva?token=…` nel QR.
   * Obbligatoria SEMPRE e non solo in produzione: è in dev che l'assenza non si vedeva, e il
   * costo di scoprirlo è un token monouso bruciato. Dev locale `http://localhost:5175`;
   * compose `--profile full` `http://localhost:8082`; produzione l'origin di DOMAIN_CUSTOMER.
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  CUSTOMER_APP_URL!: string;

  // ---- Facoltative: il default vive nel punto di lettura, qui si dichiara solo cosa è valido ----

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CUSTOMER_JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  MAIL_PORT?: number;

  @IsOptional()
  @IsBooleanString()
  MAIL_SECURE?: string;

  @IsOptional()
  @IsString()
  MAIL_USER?: string;

  @IsOptional()
  @IsString()
  MAIL_PASS?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  CREDENTIAL_TOKEN_TTL_HOURS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CUSTOMER_ENROLLMENT_TTL_HOURS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CUSTOMER_REFRESH_TTL_DAYS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CUSTOMER_PIN_MAX_ATTEMPTS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  CUSTOMER_THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  STAFF_AUTH_THROTTLE_LIMIT?: number;

  /**
   * Numero di reverse proxy davanti all'API. Il tetto a 10 non è cautela generica: serve a
   * intercettare `TRUST_PROXY_HOPS=true`, che Express accetterebbe col significato «fidati
   * dell'intera catena X-Forwarded-For», cioè nessuna fiducia verificabile.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS?: number;
}

/**
 * Hook `validate` di `ConfigModule.forRoot`. Riceve l'ambiente unito ai file `.env` caricati e
 * **restituisce lo stesso oggetto**: qui si decide solo se l'avvio può proseguire.
 */
export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const parsed = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false, forbidUnknownValues: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(' · ')}`)
      .join('\n');
    throw new Error(
      `Configurazione non valida: l'API non parte.\n${detail}\n` +
        `Confronta il tuo .env con .env.example (o deploy/.env.prod.example in produzione).`,
    );
  }
  return raw;
}
