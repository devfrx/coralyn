import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/migrations/**',
      // Dump locale dell'export del design tool (gitignored, vedi .gitignore §32-34).
      'Redesign coralyn gestionale moderno/**',
      'Coralyn - Gestionale Lidi.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Il repo usa il prefisso `_` per gli scarti da destructuring e per i parametri non usati
    // (es. `const [, _drop] = ...`, `(_t, cb) => ...`). La convenzione era gia' in uso nel codice
    // ma non era dichiarata al linter, che la segnalava come errore.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // La policy UUID del repo e' `common/uuid.ts`: forma canonica 8-4-4-4-12, SENZA vincolo di
    // versione/variante RFC-4122, perche' gli id sintetici dei seed sono `uuid` validi per
    // Postgres. `@IsUUID()` applica il vincolo RFC e li rifiuta: il Pedalo' shippato non era
    // noleggiabile, e lo stesso customerId passava da POST /bookings ma non da .../transfer
    // (AUD-011). Sostituire le 16 occorrenze non bastava — finche' la strada scorretta non costa
    // nulla, torna al primo DTO nuovo. Il decoratore giusto e' `common/is-uuid-shape.ts`.
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'class-validator',
              importNames: ['IsUUID'],
              message:
                "Usa @IsUuidShape() da src/common/is-uuid-shape: @IsUUID() applica il vincolo RFC-4122 e rifiuta gli id sintetici che common/uuid.ts dichiara validi.",
            },
          ],
        },
      ],
    },
  },
  {
    // Nei test e nei mock `any` e' la scelta pragmatica corretta: i fake di Prisma e i doppi di
    // test modellano solo la porzione di superficie che serve, e tipizzarli per intero
    // significherebbe reimplementare i tipi generati. Resta `warn` per non perderne traccia.
    // NB: `mocks/` e' infrastruttura di test (server MSW), non codice di produzione.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/mocks/**', '**/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
  // I 109 SFC non erano analizzati da nulla: nessuno dei due preset sopra dichiara `files` per
  // `.vue`, e ESLint 9 non li tratta come lintabili di default. `vue-tsc` copre i TIPI nei
  // template, non le REGOLE di correttezza di Vue: una prop mutata in un figlio o un `computed`
  // con side-effect sono type-correct e sbagliati.
  //
  // Si parte da `flat/essential` (solo regole di correttezza, niente stile) di proposito: alzare
  // l'asticella a `flat/recommended` e' una decisione a se', da prendere quando il gate e' verde.
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      // Il design system usa deliberatamente nomi di una parola (Button, Card, Modal, Select...):
      // e' la convenzione del repo, coerente su tutti e 35 i componenti di ui-kit e ratificata da
      // ADR-0033. Le convenzioni del repo vincono sull'opinione del linter.
      'vue/multi-word-component-names': 'off',
      // `no-undef` e' gia' disattivata da typescript-eslint sui .ts perche' TypeScript fa lo
      // stesso controllo meglio; sui .vue rientrava dalla finestra via js.configs.recommended,
      // producendo falsi positivi su ogni global del DOM (document, window, setTimeout,
      // HTMLElement...). Stessa ragione, stessa scelta.
      'no-undef': 'off',
    },
  },
  {
    // In coda, perche' i blocchi successivi vincono: il preset Vue sopra rientrerebbe altrimenti.
    // I doppi di test nominano i propri stub come i componenti reali che sostituiscono
    // (`Select`, `Option`): e' voluto e rende leggibile l'asserzione.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
    rules: { 'vue/no-reserved-component-names': 'off' },
  },
);
