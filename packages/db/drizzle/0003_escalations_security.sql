-- ContourAI — RLS + audit trigger for the escalations table.
-- Mirrors the pattern in 0001_rls_and_audit.sql.

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations FORCE ROW LEVEL SECURITY;

CREATE POLICY escalations_tenant_isolation ON escalations
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE TRIGGER audit_escalations
  AFTER INSERT OR UPDATE OR DELETE ON escalations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
