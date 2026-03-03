-- Database functions for controlled data access

-- Minimal customer list for dropdowns (anon-safe)
CREATE OR REPLACE FUNCTION get_customer_list()
RETURNS TABLE (id bigint, display_name text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT id, COALESCE(display_name, CONCAT(first_name, ' ', last_name)) AS display_name
  FROM "Customers"
  WHERE deleted_at IS NULL AND is_active = true
  ORDER BY last_name, first_name;
$$;

-- Return only the RSA public key (anon-safe, avoids exposing full vault_config)
CREATE OR REPLACE FUNCTION get_public_key()
RETURNS text
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT rsa_public_key_jwk FROM vault_config LIMIT 1;
$$;

-- Auto-update updated_at on card_vault changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER card_vault_updated_at
  BEFORE UPDATE ON card_vault
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
