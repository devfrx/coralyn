-- Diritto all'oblio (GDPR D-024): tracce di anonimizzazione sul Cliente.
ALTER TABLE "Customer" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "anonymizedBy" UUID;
