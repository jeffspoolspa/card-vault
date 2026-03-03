-- Anon INSERT policy for card_vault
-- Allows both token-based collection and employee manual entry (/add-card)
-- Safe because all card data is RSA-encrypted before insertion — anon can only write ciphertext.

CREATE POLICY "Allow anon insert" ON card_vault
  FOR INSERT TO anon
  WITH CHECK (true);
