-- Access level control for admin UI users

CREATE TABLE vault_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  access_level text NOT NULL DEFAULT 'entry_only' CHECK (access_level IN ('entry_only', 'full_access')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vault_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read own row" ON vault_users
  FOR SELECT TO authenticated USING (id = auth.uid());

-- SECURITY DEFINER function to check access level without RLS recursion
CREATE OR REPLACE FUNCTION is_full_access_user(user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM vault_users WHERE id = user_id AND access_level = 'full_access');
$$;

CREATE POLICY "Full access users can manage" ON vault_users
  FOR ALL TO authenticated
  USING (is_full_access_user(auth.uid()))
  WITH CHECK (true);
