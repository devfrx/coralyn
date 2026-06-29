-- NOTA (ADR-0026): "Utente" è una tabella d'identità e NON abilita la policy RLS
-- tenant_isolation. Il login interroga Utente prima di conoscere il tenant e
-- stabilimentoId è nullable (superuser). L'accesso è mediato solo da IdentitaService.

-- CreateEnum
CREATE TYPE "Ruolo" AS ENUM ('admin', 'staff', 'superuser');

-- CreateTable
CREATE TABLE "Utente" (
    "id" UUID NOT NULL,
    "stabilimentoId" UUID,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ruolo" "Ruolo" NOT NULL,

    CONSTRAINT "Utente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utente_email_key" ON "Utente"("email");

-- CreateIndex
CREATE INDEX "Utente_stabilimentoId_idx" ON "Utente"("stabilimentoId");

-- AddForeignKey
ALTER TABLE "Utente" ADD CONSTRAINT "Utente_stabilimentoId_fkey" FOREIGN KEY ("stabilimentoId") REFERENCES "Stabilimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
