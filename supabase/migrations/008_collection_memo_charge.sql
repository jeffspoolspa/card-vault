-- Add memo and charge_now fields to card_collection_requests

ALTER TABLE card_collection_requests
  ADD COLUMN memo text,
  ADD COLUMN charge_now boolean NOT NULL DEFAULT false;
