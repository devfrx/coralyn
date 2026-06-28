-- Abilita RLS sulla prima tabella tenant-scoped e forza anche per l'owner.
ALTER TABLE "Cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cliente" FORCE ROW LEVEL SECURITY;

-- Una riga è visibile/scrivibile solo se appartiene al tenant corrente.
-- Tenant corrente = GUC di sessione app.current_tenant.
-- nullif(..., '') converte la stringa vuota (GUC non impostata, missing_ok=true)
-- in NULL, così la policy nega l'accesso quando nessun tenant è attivo.
CREATE POLICY tenant_isolation ON "Cliente"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "stabilimentoId");
