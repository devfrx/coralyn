import * as fs from 'fs';
import * as path from 'path';

// Carica .env.test dalla root del repo (tre livelli su: test -> api -> apps -> root).
//
// Il file NON e' versionato (vedi .gitignore): esiste `.env.test.example` da copiare.
// La sua assenza e' FATALE di proposito. Senza, `ConfigModule.forRoot()` (che non dichiara
// `envFilePath`) ricadrebbe su `<cwd>/.env` = `apps/api/.env`, cioe' il DB di SVILUPPO, e gli
// helper in `test/helpers/` lo svuoterebbero con deleteMany({}) senza un solo messaggio.
const envPath = path.resolve(__dirname, '..', '..', '..', '.env.test');
if (!fs.existsSync(envPath)) {
  throw new Error(
    `e2e: manca ${envPath}. Copialo dall'esempio versionato:\n` +
      `  cp .env.test.example .env.test\n` +
      `Senza, la suite ricadrebbe sul .env di sviluppo e cancellerebbe coralyn_dev.`,
  );
}

const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  // L'ambiente vince sul file: e' deliberato, serve alla CI per iniettare il DB del servizio
  // Postgres del runner. Non e' piu' un rischio: la guardia qui sotto vale comunque.
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Guardia strutturale, l'unica che conta: qualunque sia la provenienza di DATABASE_URL (file,
// ambiente, CI), le e2e possono girare SOLO su un database il cui nome contiene `coralyn_test`.
// Ancorata al nome della RISORSA e non a NODE_ENV, che l'entrypoint puo' sovrascrivere.
const dbUrl = process.env.DATABASE_URL ?? '';
const dbName = dbUrl.split('/').pop()?.split('?')[0] ?? '';
if (!/coralyn_test/i.test(dbName)) {
  throw new Error(
    `e2e: rifiutato il database "${dbName || '(vuoto)'}" — atteso un nome contenente "coralyn_test".\n` +
      `Le e2e svuotano le tabelle: puntarle a un altro DB ne distrugge i dati.\n` +
      `Controlla DATABASE_URL in .env.test (o nell'ambiente, che ha la precedenza).`,
  );
}
