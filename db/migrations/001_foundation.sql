-- Foundation only. Devadathan owns service behavior, seed data, and subsequent migrations.
CREATE TABLE customers (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, company text NOT NULL,
  address text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_search_idx ON customers (company, email);

CREATE TABLE users (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','STAFF','CUSTOMER')),
  customer_id text UNIQUE REFERENCES customers(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'CUSTOMER' AND customer_id IS NOT NULL) OR (role <> 'CUSTOMER' AND customer_id IS NULL))
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE password_resets (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, used_at timestamptz
);

CREATE TABLE products (
  id text PRIMARY KEY, name text NOT NULL, type text NOT NULL CHECK (type IN ('SOFTWARE','SERVICE','ADDON')),
  sales_price bigint NOT NULL CHECK (sales_price >= 0), cost_price bigint NOT NULL CHECK (cost_price >= 0),
  notes text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_variants (
  id text PRIMARY KEY, product_id text NOT NULL REFERENCES products(id), name text NOT NULL,
  price_adjustment bigint NOT NULL CHECK (price_adjustment >= 0), active boolean NOT NULL DEFAULT true,
  UNIQUE(product_id, name)
);
CREATE TABLE taxes (
  id text PRIMARY KEY, name text NOT NULL, rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE plans (
  id text PRIMARY KEY, name text NOT NULL, price bigint NOT NULL CHECK (price >= 0),
  interval text NOT NULL CHECK (interval IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  minimum_quantity integer NOT NULL CHECK (minimum_quantity > 0),
  available_from date NOT NULL, available_until date,
  auto_close boolean NOT NULL DEFAULT true, allow_early_close boolean NOT NULL DEFAULT true,
  allow_pause boolean NOT NULL DEFAULT false, allow_renew boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_until IS NULL OR available_until >= available_from)
);
CREATE TABLE plan_taxes (
  plan_id text NOT NULL REFERENCES plans(id), tax_id text NOT NULL REFERENCES taxes(id), PRIMARY KEY(plan_id, tax_id)
);
CREATE TABLE discounts (
  id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('FIXED','PERCENTAGE')),
  value bigint NOT NULL CHECK (value >= 0), scope text NOT NULL CHECK (scope IN ('PRODUCT','SUBSCRIPTION')),
  minimum_purchase bigint NOT NULL DEFAULT 0 CHECK (minimum_purchase >= 0),
  minimum_quantity integer NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  starts_at date NOT NULL, ends_at date, usage_limit integer CHECK (usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'PERCENTAGE' OR value <= 10000),
  CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CHECK (usage_limit IS NULL OR usage_count <= usage_limit)
);
CREATE TABLE discount_products (
  discount_id text NOT NULL REFERENCES discounts(id), product_id text NOT NULL REFERENCES products(id), PRIMARY KEY(discount_id, product_id)
);
CREATE TABLE quotation_templates (
  id text PRIMARY KEY, name text NOT NULL, plan_id text NOT NULL REFERENCES plans(id),
  valid_days integer NOT NULL CHECK (valid_days > 0), lines jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE subscription_number_seq;
CREATE TABLE subscriptions (
  id text PRIMARY KEY, number text NOT NULL UNIQUE, customer_id text NOT NULL REFERENCES customers(id),
  plan_id text NOT NULL REFERENCES plans(id), template_id text REFERENCES quotation_templates(id),
  status text NOT NULL CHECK (status IN ('DRAFT','QUOTATION','CONFIRMED','ACTIVE','PAUSED','CLOSED')),
  start_date date NOT NULL, expiry_date date, next_billing_date date,
  billing_anchor_day integer CHECK (billing_anchor_day BETWEEN 1 AND 31),
  payment_terms_days integer NOT NULL CHECK (payment_terms_days >= 0), quotation_valid_until date,
  plan_snapshot jsonb, paused_at date, closed_at date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR expiry_date > start_date)
);
CREATE INDEX subscriptions_due_idx ON subscriptions(next_billing_date) WHERE status = 'ACTIVE';
CREATE INDEX subscriptions_customer_status_idx ON subscriptions(customer_id,status);
CREATE TABLE subscription_lines (
  id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES subscriptions(id),
  product_id text NOT NULL REFERENCES products(id), variant_id text REFERENCES product_variants(id),
  description text NOT NULL, quantity integer NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0), tax_ids jsonb NOT NULL DEFAULT '[]',
  tax_snapshot jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX subscription_lines_parent_idx ON subscription_lines(subscription_id);
CREATE SEQUENCE invoice_number_seq;
CREATE TABLE invoices (
  id text PRIMARY KEY, number text NOT NULL UNIQUE, subscription_id text NOT NULL REFERENCES subscriptions(id),
  customer_id text NOT NULL REFERENCES customers(id), customer_snapshot jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','PAID','CANCELLED')),
  issued_at date NOT NULL, due_at date NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
  subtotal bigint NOT NULL CHECK (subtotal >= 0), discount bigint NOT NULL CHECK (discount >= 0),
  tax bigint NOT NULL CHECK (tax >= 0), total bigint NOT NULL CHECK (total >= 0),
  paid bigint NOT NULL DEFAULT 0 CHECK (paid >= 0), explanation jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, period_start, period_end),
  CHECK (period_end > period_start), CHECK (due_at >= issued_at),
  CHECK (discount <= subtotal), CHECK (total = subtotal - discount + tax), CHECK (paid <= total)
);
CREATE INDEX invoices_customer_status_idx ON invoices(customer_id,status);
CREATE INDEX invoices_due_idx ON invoices(due_at) WHERE status = 'CONFIRMED';
CREATE TABLE invoice_lines (
  id text PRIMARY KEY, invoice_id text NOT NULL REFERENCES invoices(id), description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0), unit_price bigint NOT NULL CHECK (unit_price >= 0),
  subtotal bigint NOT NULL CHECK (subtotal >= 0), discount bigint NOT NULL CHECK (discount >= 0),
  tax bigint NOT NULL CHECK (tax >= 0), total bigint NOT NULL CHECK (total >= 0),
  pricing_snapshot jsonb NOT NULL, CHECK (discount <= subtotal), CHECK (total = subtotal - discount + tax)
);
CREATE INDEX invoice_lines_parent_idx ON invoice_lines(invoice_id);
CREATE TABLE payments (
  id text PRIMARY KEY, invoice_id text NOT NULL REFERENCES invoices(id), amount bigint NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('BANK_TRANSFER','CARD','UPI','CASH','OTHER')),
  paid_at date NOT NULL, note text NOT NULL DEFAULT '', idempotency_key text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_invoice_idx ON payments(invoice_id);
CREATE INDEX payments_date_idx ON payments(paid_at);
CREATE TABLE discount_redemptions (
  discount_id text NOT NULL REFERENCES discounts(id), invoice_id text NOT NULL REFERENCES invoices(id),
  released_at timestamptz, PRIMARY KEY(discount_id,invoice_id)
);
CREATE TABLE billing_runs (
  id text PRIMARY KEY, as_of date NOT NULL, status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  generated integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE billing_failures (
  id text PRIMARY KEY, run_id text NOT NULL REFERENCES billing_runs(id),
  subscription_id text NOT NULL REFERENCES subscriptions(id), period_start date NOT NULL,
  message text NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id text PRIMARY KEY, actor_id text REFERENCES users(id), entity_type text NOT NULL,
  entity_id text NOT NULL, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type,entity_id,created_at);
CREATE TABLE outbox_messages (
  id text PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, kind text NOT NULL,
  payload jsonb NOT NULL, sent_at timestamptz, attempts integer NOT NULL DEFAULT 0,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE demo_clock (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), as_of date NOT NULL
);
