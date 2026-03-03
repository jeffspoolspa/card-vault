-- Vault configuration: stores RSA key pair (private key encrypted) and PBKDF2 params
-- Populated once by scripts/setup-vault.ts

CREATE TABLE vault_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsa_public_key_jwk text NOT NULL,
  rsa_private_key_encrypted text NOT NULL,
  rsa_private_key_iv text NOT NULL,
  rsa_private_key_salt text NOT NULL,
  pbkdf2_iterations integer NOT NULL DEFAULT 600000,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: anon can read public key, authenticated full access
ALTER TABLE vault_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read public key" ON vault_config
  FOR SELECT TO anon USING (true);

CREATE POLICY "Authenticated full access" ON vault_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
