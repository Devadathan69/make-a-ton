-- Additive changes only: keep the applied foundation checksum stable.
CREATE INDEX subscriptions_start_idx ON subscriptions(start_date, id);
CREATE INDEX invoices_issued_idx ON invoices(issued_at, id);
CREATE INDEX products_created_idx ON products(created_at, id);
CREATE INDEX customers_created_idx ON customers(created_at, id);
CREATE INDEX outbox_pending_idx ON outbox_messages(created_at) WHERE sent_at IS NULL;
CREATE INDEX resets_user_idx ON password_resets(user_id);
CREATE TABLE auth_throttles (
  bucket text PRIMARY KEY, attempts integer NOT NULL, resets_at timestamptz NOT NULL
);
-- A separate anchor survives clamping and resume starts a new anchored schedule.
ALTER TABLE subscriptions ADD COLUMN cycle_anchor date;
ALTER TABLE payments ADD COLUMN request_hash text;
