-- D-072 / ADR-0067 — la provenienza di un ombrellone ritirato diventa un RIFERIMENTO vivo.
-- Fino a qui l'unica traccia era `retiredFrom`, lo snapshot testuale «Settore · Fila» scritto al
-- ritiro: un rename del settore lo rendeva irrisolvibile e la disclosure sul ripristino taceva.
-- `retiredFrom` resta, ma da qui in avanti e' solo un'ETICHETTA storica da mostrare.

-- AlterTable
ALTER TABLE "Umbrella" ADD COLUMN     "retiredFromSectorId" UUID;

-- CreateIndex
CREATE INDEX "Umbrella_retiredFromSectorId_idx" ON "Umbrella"("retiredFromSectorId");

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_retiredFromSectorId_fkey" FOREIGN KEY ("retiredFromSectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill dell'archivio, con la stessa regola che il frontend applicava a ogni render: il primo
-- segmento di «Settore · Fila» confrontato col nome dei settori vivi. Applicata UNA volta sola qui,
-- diventa il valore migliore che quelle righe potranno mai avere; cio' che resta a NULL e' per
-- costruzione cio' che il nome NON risolve, quindi il frontend non ha piu' motivo di riprovarci.
--
-- ⚠️ `Umbrella` e `Sector` hanno FORCE ROW LEVEL SECURITY e l'utente delle migration (`coralyn_app`)
-- ne e' l'owner ma NON e' esente: un UPDATE scritto senza tenant vedrebbe zero righe e non
-- fallirebbe. Il ciclo qui sotto RISPETTA la policy invece di disattivarla, ripassando tenant per
-- tenant come farebbe l'applicazione. `Establishment` e' fuori da RLS (init migration), quindi la
-- lista dei tenant e' leggibile senza contesto.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT "id" FROM "Establishment" LOOP
    PERFORM set_config('app.current_tenant', t."id"::text, true);
    UPDATE "Umbrella" u
       SET "retiredFromSectorId" = s."id"
      FROM "Sector" s
     WHERE u."retiredAt" IS NOT NULL
       AND u."retiredFrom" IS NOT NULL
       AND u."retiredFromSectorId" IS NULL
       AND s."establishmentId" = u."establishmentId"
       AND s."name" = split_part(u."retiredFrom", ' · ', 1);
  END LOOP;
  PERFORM set_config('app.current_tenant', '', true);
END $$;
