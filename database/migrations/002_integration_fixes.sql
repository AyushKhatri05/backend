-- backend/database/migrations/002_integration_fixes.sql
-- Adds columns that the integration code relies on but may be absent from 001_initial_schema.sql

-- Users: password reset support
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token   TEXT,
    ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Products: track who created each product
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS maximum_stock INTEGER;

-- Sales: updated_at for refund tracking
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Inventory transactions: ensure reference_id column exists
ALTER TABLE inventory_transactions
    ADD COLUMN IF NOT EXISTS reference_id UUID;

-- Reorder alerts: ON CONFLICT requires a unique constraint on product_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reorder_alerts_product_id_key'
    ) THEN
        ALTER TABLE reorder_alerts ADD CONSTRAINT reorder_alerts_product_id_key UNIQUE (product_id);
    END IF;
END
$$;

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_sales_created_at   ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status        ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON inventory_transactions(product_id);
