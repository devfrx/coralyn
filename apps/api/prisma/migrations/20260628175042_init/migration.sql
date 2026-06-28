-- CreateTable
CREATE TABLE "Stabilimento" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Stabilimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_stabilimentoId_idx" ON "Cliente"("stabilimentoId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
