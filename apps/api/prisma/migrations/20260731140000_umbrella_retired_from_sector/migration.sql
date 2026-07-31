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

-- Backfill dell'archivio. Applicato UNA volta sola qui, diventa il valore migliore che quelle righe
-- potranno mai avere; cio' che resta a NULL e' per costruzione cio' che il nome NON risolve, quindi
-- il frontend non ha piu' motivo di riprovarci.
--
-- ⚠️ La regola NON e' `s.name = split_part(retiredFrom, ' · ', 1)`, cioe' quella che il frontend
-- applicava a ogni render, perche' quella regola SBAGLIA. `retiredFrom` nasce da
-- «<nome settore> · <label fila>» e nessuno dei due pezzi vieta il separatore: il nome del settore e'
-- testo libero (create-sector.dto.ts: solo IsString/IsNotEmpty/MaxLength) e l'unicita' e' sul nome
-- INTERO, quindi «Blu» e «Blu · Alto» convivono legittimamente. Riprodotto su coralyn_dev: un
-- ritirato da «Blu · Alto» con snapshot «Blu · Alto · F1» veniva agganciato a «Blu» — un settore da
-- cui non era mai passato, scritto senza esitazione. Peggio del NULL, perche' il NULL almeno tace.
--
-- ⚠️ Cio' che questa regola NON puo' escludere: se un settore e' stato **rinominato** e poi ne e' stato
-- creato uno **nuovo col vecchio nome**, entrambi prima di questa migration, il candidato e' UNO — il
-- nuovo — e il backfill scrive un riferimento sbagliato con sicurezza. Non e' distinguibile dai dati:
-- `Sector` non ha un `createdAt`, quindi non esiste alcun modo di sapere quale settore portava quel
-- nome al momento del ritiro. E' un limite ACCETTATO e dichiarato, non un caso non visto: vedi
-- ADR-0067 §3. Pesa poco perche' nessun database di produzione esiste — al primo deploy questa
-- tabella e' vuota e il backfill e' un no-op — e perche' l'alternativa (non ripararlo affatto)
-- perde ogni riga recuperabile per evitarne una sbagliata.
--
-- Qui si confronta il PREFISSO ESATTO (`<nome> · `) e si scrive **solo quando il candidato e' UNICO**.
-- Con «Blu» e «Blu · Alto» entrambi candidati lo snapshot e' genuinamente ambiguo — potrebbe venire
-- da «Blu · Alto»/fila «F1» o da «Blu»/fila «Alto · F1», e nessuna regola puo' deciderlo — quindi la
-- riga resta a NULL. E' la stessa scelta dell'ADR: meglio nessuna origine che una sbagliata.
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
       SET "retiredFromSectorId" = c."sector_id"
      FROM (
        SELECT u2."id" AS umbrella_id, (array_agg(s."id"))[1] AS sector_id
          FROM "Umbrella" u2
          JOIN "Sector" s
            ON s."establishmentId" = u2."establishmentId"
           AND left(u2."retiredFrom", length(s."name") + 3) = s."name" || ' · '
         WHERE u2."retiredAt" IS NOT NULL
           AND u2."retiredFrom" IS NOT NULL
           AND u2."retiredFromSectorId" IS NULL
         GROUP BY u2."id"
        HAVING count(*) = 1
      ) c
     WHERE u."id" = c."umbrella_id";
  END LOOP;
  PERFORM set_config('app.current_tenant', '', true);
END $$;
