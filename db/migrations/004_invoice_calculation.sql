ALTER TABLE invoices ADD COLUMN calculation_snapshot jsonb NOT NULL DEFAULT '{}';
