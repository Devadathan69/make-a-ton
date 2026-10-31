ALTER TABLE outbox_messages ADD COLUMN delivery_state text NOT NULL DEFAULT 'QUEUED' CHECK(delivery_state IN ('QUEUED','SENT','FAILED','UNCERTAIN'));
ALTER TABLE outbox_messages ADD COLUMN next_attempt_at timestamptz DEFAULT now();
CREATE INDEX outbox_invoice_idx ON outbox_messages((payload->>'invoiceId')) WHERE kind='INVOICE';
