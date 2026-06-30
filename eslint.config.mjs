import js from '@eslint/js';
import tseslint from 'typescript-eslint';

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
);
