-- ContourAI — RLS policies + audit trigger function.
-- Hand-written; runs after the Drizzle-generated 0000_initial.sql.
--
-- Conventions:
--   * Tenant context is set per-request via:
--       SELECT set_config('app.current_clinic_id', '<uuid>', true);
--       SELECT set_config('app.current_actor',     '<actor>', true);
--     `true` = SET LOCAL semantics — scope is the current transaction.
--   * The Supabase `service_role` JWT bypasses RLS (default Supabase behavior).
--     Use it ONLY in trusted server-side workers; the API layer always uses
--     the `authenticated` role for staff requests.
--   * `anon` is denied across the board.

-- ============================================================================
-- Helper: resolve current clinic context. Returns NULL if unset (denies access).
-- ============================================================================
CREATE OR REPLACE FUNCTION app_current_clinic_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
$$;

-- ============================================================================
-- Enable RLS on all tenant-scoped tables.
-- ============================================================================
ALTER TABLE clinics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

-- Also force RLS for table owners (defense-in-depth: even superuser-via-app
-- can't bypass without explicit BYPASSRLS role).
ALTER TABLE clinics       FORCE ROW LEVEL SECURITY;
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE patients      FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages      FORCE ROW LEVEL SECURITY;
ALTER TABLE leads         FORCE ROW LEVEL SECURITY;
ALTER TABLE lead_scores   FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log     FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Policies.
--
-- Pattern: one policy per (table, command) tagged "tenant_isolation". Each
-- enforces clinic_id = app_current_clinic_id(). The `clinics` table itself
-- uses `id = app_current_clinic_id()`.
-- ============================================================================

-- clinics: a staff member can only see their own clinic.
CREATE POLICY clinics_tenant_isolation ON clinics
  FOR ALL TO authenticated
  USING (id = app_current_clinic_id())
  WITH CHECK (id = app_current_clinic_id());

-- users, patients, conversations, messages, leads, lead_scores: standard
-- clinic_id check.
CREATE POLICY users_tenant_isolation ON users
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE POLICY patients_tenant_isolation ON patients
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE POLICY messages_tenant_isolation ON messages
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE POLICY leads_tenant_isolation ON leads
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

CREATE POLICY lead_scores_tenant_isolation ON lead_scores
  FOR ALL TO authenticated
  USING (clinic_id = app_current_clinic_id())
  WITH CHECK (clinic_id = app_current_clinic_id());

-- audit_log: read-only via RLS (clinic-scoped). Writes happen exclusively
-- via the audit trigger function below, which runs as SECURITY DEFINER and
-- therefore bypasses RLS. App code MUST NOT INSERT directly into audit_log.
CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR SELECT TO authenticated
  USING (clinic_id = app_current_clinic_id());

-- ============================================================================
-- Audit trigger.
--
-- One function attached to every PHI/PII-relevant table. Captures old/new
-- snapshots into audit_log. Runs SECURITY DEFINER so it can write to
-- audit_log regardless of the calling role's RLS.
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_actor text;
  v_target_id text;
  v_diff jsonb;
BEGIN
  v_actor := COALESCE(NULLIF(current_setting('app.current_actor', true), ''), 'system');

  IF TG_OP = 'DELETE' THEN
    v_diff := jsonb_build_object('old', to_jsonb(OLD));
    v_target_id := to_jsonb(OLD)->>'id';
    v_clinic_id := NULLIF(to_jsonb(OLD)->>'clinic_id', '')::uuid;
  ELSIF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('new', to_jsonb(NEW));
    v_target_id := to_jsonb(NEW)->>'id';
    v_clinic_id := NULLIF(to_jsonb(NEW)->>'clinic_id', '')::uuid;
  ELSE
    v_diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    v_target_id := to_jsonb(NEW)->>'id';
    v_clinic_id := NULLIF(to_jsonb(NEW)->>'clinic_id', '')::uuid;
  END IF;

  -- The `clinics` table doesn't have a clinic_id column; its own id IS the
  -- tenant scope. Use that for the audit row.
  IF TG_TABLE_NAME = 'clinics' THEN
    v_clinic_id := COALESCE(
      NULLIF(to_jsonb(COALESCE(NEW, OLD))->>'id', '')::uuid,
      v_clinic_id
    );
  END IF;

  INSERT INTO audit_log (clinic_id, actor, action, target_table, target_id, diff)
  VALUES (v_clinic_id, v_actor, lower(TG_OP), TG_TABLE_NAME, v_target_id, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to every tenant-scoped table. audit_log itself is NOT audited
-- (would either recurse or be pointless).
CREATE TRIGGER audit_clinics       AFTER INSERT OR UPDATE OR DELETE ON clinics       FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_users         AFTER INSERT OR UPDATE OR DELETE ON users         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_patients      AFTER INSERT OR UPDATE OR DELETE ON patients      FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_conversations AFTER INSERT OR UPDATE OR DELETE ON conversations FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_messages      AFTER INSERT OR UPDATE OR DELETE ON messages      FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_leads         AFTER INSERT OR UPDATE OR DELETE ON leads         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_lead_scores   AFTER INSERT OR UPDATE OR DELETE ON lead_scores   FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ============================================================================
-- Invariant: messages.clinic_id must match conversations.clinic_id.
--
-- We denormalize messages.clinic_id for single-equality RLS. This trigger
-- enforces consistency so app bugs can't poison the denormalization.
-- ============================================================================
CREATE OR REPLACE FUNCTION messages_clinic_id_matches_conversation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_conv_clinic_id uuid;
BEGIN
  SELECT clinic_id INTO v_conv_clinic_id FROM conversations WHERE id = NEW.conversation_id;
  IF v_conv_clinic_id IS NULL THEN
    RAISE EXCEPTION 'conversation % does not exist', NEW.conversation_id;
  END IF;
  IF v_conv_clinic_id <> NEW.clinic_id THEN
    RAISE EXCEPTION
      'messages.clinic_id (%) must match conversations.clinic_id (%)',
      NEW.clinic_id, v_conv_clinic_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_clinic_id_check
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_clinic_id_matches_conversation();
