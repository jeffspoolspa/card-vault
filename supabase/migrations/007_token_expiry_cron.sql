-- Expire stale collection tokens every 15 minutes
-- Requires pg_cron extension (enabled by default on Supabase)

SELECT cron.schedule(
  'expire-collection-tokens',
  '*/15 * * * *',
  $$UPDATE card_collection_requests SET status = 'expired' WHERE status = 'pending' AND expires_at < now()$$
);
