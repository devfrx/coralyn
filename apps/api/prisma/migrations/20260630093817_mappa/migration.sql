-- CreateTable
CREATE TABLE "Tipologia" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "icona" TEXT,

    CONSTRAINT "Tipologia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fascia" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "oraInizio" TIME(0) NOT NULL,
    "oraFine" TIME(0) NOT NULL,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "Fascia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settore" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "Settore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fila" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "settoreId" UUID NOT NULL,
    "etichetta" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,

    CONSTRAINT "Fila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ombrellone" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "filaId" UUID NOT NULL,
    "tipologiaId" UUID,
    "etichetta" TEXT NOT NULL,
    "ordineLogico" INTEGER NOT NULL,
    "posizionePresentazione" JSONB,

    CONSTRAINT "Ombrellone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tipologia_stabilimentoId_idx" ON "Tipologia"("stabilimentoId");

-- CreateIndex
CREATE INDEX "Fascia_stabilimentoId_idx" ON "Fascia"("stabilimentoId");

-- CreateIndex
CREATE INDEX "Settore_stabilimentoId_idx" ON "Settore"("stabilimentoId");

-- CreateIndex
CREATE INDEX "Fila_stabilimentoId_idx" ON "Fila"("stabilimentoId");

-- CreateIndex
CREATE INDEX "Fila_settoreId_idx" ON "Fila"("settoreId");

-- CreateIndex
CREATE INDEX "Ombrellone_stabilimentoId_idx" ON "Ombrellone"("stabilimentoId");

-- CreateIndex
CREATE INDEX "Ombrellone_filaId_idx" ON "Ombrellone"("filaId");

-- CreateIndex
CREATE UNIQUE INDEX "Ombrellone_stabilimentoId_etichetta_key" ON "Ombrellone"("stabilimentoId", "etichetta");

-- AddForeignKey
ALTER TABLE "Tipologia" ADD CONSTRAINT "Tipologia_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fascia" ADD CONSTRAINT "Fascia_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settore" ADD CONSTRAINT "Settore_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fila" ADD CONSTRAINT "Fila_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fila" ADD CONSTRAINT "Fila_settoreId_fkey" FOREIGN KEY ("settoreId") REFERENCES "Settore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ombrellone" ADD CONSTRAINT "Ombrellone_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ombrellone" ADD CONSTRAINT "Ombrellone_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "Fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ombrellone" ADD CONSTRAINT "Ombrellone_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera) — stesso pattern di 20260628175658_rls.
ALTER TABLE "Tipologia"  ENABLE ROW LEVEL SECURITY; ALTER TABLE "Tipologia"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "Fascia"     ENABLE ROW LEVEL SECURITY; ALTER TABLE "Fascia"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "Settore"    ENABLE ROW LEVEL SECURITY; ALTER TABLE "Settore"    FORCE ROW LEVEL SECURITY;
ALTER TABLE "Fila"       ENABLE ROW LEVEL SECURITY; ALTER TABLE "Fila"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "Ombrellone" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Ombrellone" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tipologia"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
CREATE POLICY tenant_isolation ON "Fascia"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
CREATE POLICY tenant_isolation ON "Settore"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
CREATE POLICY tenant_isolation ON "Fila"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
CREATE POLICY tenant_isolation ON "Ombrellone"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
