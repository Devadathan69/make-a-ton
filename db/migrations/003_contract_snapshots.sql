ALTER TABLE subscription_lines ADD COLUMN pricing_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE INDEX subscriptions_pending_activation_idx ON subscriptions(start_date) WHERE status = 'CONFIRMED';
