/**
 * Su quali database sono ammesse le operazioni di sviluppo distruttive o di popolamento.
 *
 * Ancorata al **nome della risorsa**, non a un segnale d'ambiente. `NODE_ENV` lo sovrascrive un
 * entrypoint — ed è precisamente ciò che accadeva: `seed.ts` si difendeva con
 * `NODE_ENV !== 'production'` e `docker-entrypoint.sh` forzava `NODE_ENV=development` per il solo
 * comando di seed, disarmando la guardia proprio sulla variabile su cui poggiava. Il nome
 * restituito da `current_database()` non è falsificabile dal processo che gira.
 *
 * Il repo conteneva già entrambi i pattern — quello forte in `reset-dev`, quello debole nel seed.
 * Questa è l'estrazione del pattern forte, perché lo usino tutti e due.
 */
export const DEV_DATABASE_PATTERN = /^coralyn_(dev|test)/i;

/** @param operation nome dell'operazione, per un messaggio che dica cosa è stato rifiutato. */
export function assertDevDatabase(operation: string, dbName: string): void {
  if (!DEV_DATABASE_PATTERN.test(dbName)) {
    throw new Error(
      `${operation}: database "${dbName}" non matcha ${DEV_DATABASE_PATTERN} — rifiutato`,
    );
  }
}
