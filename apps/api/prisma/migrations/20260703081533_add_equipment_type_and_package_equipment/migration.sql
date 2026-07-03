-- CreateTable
CREATE TABLE "EquipmentType" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackageEquipment" (
    "establishmentId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "equipmentTypeId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "PackageEquipment_pkey" PRIMARY KEY ("packageId","equipmentTypeId")
);

-- Index
CREATE UNIQUE INDEX "EquipmentType_establishmentId_name_key" ON "EquipmentType"("establishmentId","name");
CREATE INDEX "EquipmentType_establishmentId_idx" ON "EquipmentType"("establishmentId");
CREATE INDEX "PackageEquipment_equipmentTypeId_idx" ON "PackageEquipment"("equipmentTypeId");
CREATE INDEX "PackageEquipment_establishmentId_idx" ON "PackageEquipment"("establishmentId");

-- ForeignKey
ALTER TABLE "EquipmentType" ADD CONSTRAINT "EquipmentType_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageEquipment" ADD CONSTRAINT "PackageEquipment_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DATA MIGRATION: JSONB -> catalogo + link.
-- Il ruolo applicativo (coralyn_app) e' NOBYPASSRLS e possiede "Package" con FORCE RLS:
-- senza NO FORCE la SELECT su "Package" leggerebbe 0 righe (GUC app.current_tenant non impostata).
ALTER TABLE "Package" NO FORCE ROW LEVEL SECURITY;

-- 1) Catalogo: una riga per (tenant, nome-mappato) distinto.
INSERT INTO "EquipmentType" ("id", "establishmentId", "name")
SELECT gen_random_uuid(), x."establishmentId", x."name"
FROM (
  SELECT DISTINCT
    p."establishmentId" AS "establishmentId",
    CASE e.key
      WHEN 'sunbeds'    THEN 'Lettino'
      WHEN 'deckchairs' THEN 'Sdraio'
      WHEN 'umbrellas'  THEN 'Ombrellone'
      ELSE initcap(e.key)
    END AS "name"
  FROM "Package" p, jsonb_each_text(p."equipment") e
) x;

-- 2) Link: aggrega per (package, tipo) con SUM per gestire due chiavi che collassano sullo stesso nome.
INSERT INTO "PackageEquipment" ("establishmentId", "packageId", "equipmentTypeId", "quantity")
SELECT p."establishmentId", p.id, t.id, SUM((e.value)::int)
FROM "Package" p
CROSS JOIN LATERAL jsonb_each_text(p."equipment") e
JOIN "EquipmentType" t
  ON t."establishmentId" = p."establishmentId"
 AND t."name" = CASE e.key
      WHEN 'sunbeds'    THEN 'Lettino'
      WHEN 'deckchairs' THEN 'Sdraio'
      WHEN 'umbrellas'  THEN 'Ombrellone'
      ELSE initcap(e.key)
    END
WHERE (e.value)::int > 0
GROUP BY p."establishmentId", p.id, t.id;

ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;

-- Rimuovi la colonna JSONB ormai migrata.
ALTER TABLE "Package" DROP COLUMN "equipment";

-- RLS tenant_isolation sulle nuove tabelle (Prisma non la genera). Dopo il data-copy: i nuovi
-- INSERT sopra sono avvenuti senza FORCE, ora abilitiamo la policy per il runtime.
ALTER TABLE "EquipmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EquipmentType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EquipmentType"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "PackageEquipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackageEquipment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PackageEquipment"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
