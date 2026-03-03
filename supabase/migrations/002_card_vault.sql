-- Encrypted card storage

CREATE TABLE card_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint NOT NULL,
  card_number_encrypted text NOT NULL,
  card_exp_encrypted text NOT NULL,
  card_last_four text NOT NULL CHECK (length(card_last_four) = 4),
  card_brand text,
  encrypted_envelope text,
  aes_iv_number text NOT NULL,
  aes_iv_exp text NOT NULL,
  aes_salt text,
  encryption_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_vault_customer
    FOREIGN KEY (customer_id) REFERENCES "Customers"(id) ON DELETE RESTRICT
);

ALTER TABLE card_vault ENABLE ROW LEVEL SECURITY;

-- Authenticated users get full access
CREATE POLICY "Authenticated full access" ON card_vault
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- NOTE: The anon INSERT policy (token validation) is in 003b_card_vault_anon_policy.sql
-- because it references card_collection_requests which must be created first.
