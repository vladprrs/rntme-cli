ALTER TABLE project           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project           FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_version   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_version   FORCE  ROW LEVEL SECURITY;
ALTER TABLE api_token         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log         FORCE  ROW LEVEL SECURITY;
ALTER TABLE event_outbox      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox      FORCE  ROW LEVEL SECURITY;
ALTER TABLE membership_mirror ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_project ON project;
DROP POLICY IF EXISTS tenant_isolation_project_version ON project_version;
DROP POLICY IF EXISTS tenant_isolation_token ON api_token;
DROP POLICY IF EXISTS pre_auth_token_lookup ON api_token;
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_log;
DROP POLICY IF EXISTS tenant_isolation_outbox ON event_outbox;
DROP POLICY IF EXISTS tenant_isolation_membership ON membership_mirror;
DROP POLICY IF EXISTS pre_auth_membership_lookup ON membership_mirror;

CREATE POLICY tenant_isolation_project    ON project           USING (org_id = current_setting('app.org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY tenant_isolation_project_version ON project_version USING (org_id = current_setting('app.org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY tenant_isolation_token      ON api_token         USING (org_id = current_setting('app.org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY pre_auth_token_lookup       ON api_token         FOR SELECT USING (true);
CREATE POLICY tenant_isolation_audit      ON audit_log         USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY tenant_isolation_outbox     ON event_outbox      USING (org_id = current_setting('app.org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY tenant_isolation_membership ON membership_mirror USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY pre_auth_membership_lookup  ON membership_mirror FOR SELECT USING (true);
