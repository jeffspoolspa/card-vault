-- Token-gated collection links

CREATE TABLE card_collection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  completed_at timestamptz,
  pre_auth_amount integer,

  CONSTRAINT fk_collection_customer
    FOREIGN KEY (customer_id) REFERENCES "Customers"(id) ON DELETE RESTRICT
);

ALTER TABLE card_collection_requests ENABLE ROW LEVEL SECURITY;

-- Anon can validate tokens
CREATE POLICY "Anon can validate tokens" ON card_collection_requests
  FOR SELECT TO anon USING (true);

-- Anon can mark pending tokens as completed
CREATE POLICY "Anon can complete requests" ON card_collection_requests
  FOR UPDATE TO anon
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status = 'completed');

-- Authenticated full access
CREATE POLICY "Authenticated full access" ON card_collection_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
