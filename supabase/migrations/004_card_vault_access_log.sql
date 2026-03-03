-- Audit trail for all card access events

CREATE TABLE card_vault_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_vault_id uuid REFERENCES card_vault(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'copied', 'created', 'deleted', 'archived', 'created_manual_entry')),
  performed_by uuid REFERENCES auth.users(id),
  performed_by_email text,
  ip_address text,
  user_agent text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE card_vault_access_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read and insert logs
CREATE POLICY "Authenticated access" ON card_vault_access_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon can insert logs (for manual entry form logging)
CREATE POLICY "Anon can insert logs" ON card_vault_access_log
  FOR INSERT TO anon WITH CHECK (true);
