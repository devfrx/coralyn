-- D-063 / ADR-0063: i permessi dello staff diventano configurabili dall'admin del lido.
--
-- La tabella contiene un DELTA sul default di fabbrica `PERMISSION_ROLES`, non uno snapshot:
-- assenza di riga = default. Cosi' un lido che non configura nulla non si accorge della slice, e
-- un permesso aggiunto in futuro all'enum eredita il default invece di nascere negato per tutti
-- gli operatori gia' configurati.
--
-- ⚠️ NESSUNA POLICY RLS, ed e' una decisione motivata, non una dimenticanza.
-- Misurato su coralyn_dev (300 campioni, hrtime, strumento validato con 3xSELECT 1 / 1xSELECT 1
-- = 2,81): la lettura costa 1,54 ms fuori transazione e 4,92 ms dentro `forTenant`, cioe' 3 round
-- trip strutturali in piu' (BEGIN, set_config, COMMIT) che crescono con l'RTT del database. Ma la
-- ragione che decide non e' il millisecondo: sotto RLS il guard dovrebbe aprire una transazione su
-- OGNI richiesta autenticata, prima del lavoro vero, occupando una connessione del pool per
-- autorizzare — cioe' pre-decidere D-067, che e' una decisione separata con la sua misura.
-- L'esenzione e' DICHIARATA in rls-isolation.e2e-spec.ts, che deriva le tabelle dal catalogo di
-- Postgres e fallirebbe nominando questa se non lo fosse.

-- CreateTable
CREATE TABLE "StaffPermissionOverride" (
    "userId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPermissionOverride_pkey" PRIMARY KEY ("userId","permission")
);

-- CreateIndex
CREATE INDEX "StaffPermissionOverride_establishmentId_idx" ON "StaffPermissionOverride"("establishmentId");

-- CreateIndex
-- Bersaglio della FK composita qui sotto: Postgres pretende un vincolo univoco sulle colonne
-- referenziate. `id` e' gia' PK, quindi la coppia e' univoca per costruzione e l'indice non puo'
-- fallire su dati esistenti — il warning di `migrate dev` e' generico, non specifico di questo caso.
CREATE UNIQUE INDEX "User_id_establishmentId_key" ON "User"("id", "establishmentId");

-- AddForeignKey
-- L'invariante che sostituisce RLS su questa tabella (radice R3 dell'audit: «l'invariante vive nel
-- codice applicativo perche' il posto dove dichiararla una volta sola e' vuoto»). Una riga di
-- override che rivendica un tenant diverso da quello dell'operatore non e' improbabile: e' NON
-- RAPPRESENTABILE. Costo: zero round trip, e' un vincolo di scrittura.
--
-- ⚠️ Effetto collaterale voluto: questa FK non puo' MAI matchare un superuser, perche' il suo
-- `establishmentId` e' NULL e in SQL NULL non uguaglia nulla. Il superuser e' quindi
-- strutturalmente incapace di detenere permessi tenant-scoped — cosa che ADR-0039 finora
-- dichiarava soltanto a parole.
ALTER TABLE "StaffPermissionOverride" ADD CONSTRAINT "StaffPermissionOverride_userId_establishmentId_fkey" FOREIGN KEY ("userId", "establishmentId") REFERENCES "User"("id", "establishmentId") ON DELETE CASCADE ON UPDATE CASCADE;
