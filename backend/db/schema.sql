-- Supabase / PostgreSQL Schema for INE Price Tracker
-- Phase 1 Foundation & Phase 2 Tracking API

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. PRODUCTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) UNIQUE NOT NULL, -- INE Product ID (e.g. "767")
    name TEXT NOT NULL,
    slug TEXT,
    brand TEXT,
    category TEXT,
    sku VARCHAR(255),
    url TEXT NOT NULL,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    scrape_interval_minutes INTEGER NOT NULL DEFAULT 120 CHECK (scrape_interval_minutes >= 30),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scraped_at TIMESTAMPTZ
);

-- Index for fast lookup by external INE product ID
CREATE INDEX IF NOT EXISTS idx_products_external_id ON products(external_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- ==========================================
-- 2. PRICES TABLE
-- ==========================================
-- Non-negotiable rule: Never store null, 0, NaN, or unparseable values as a price.
-- A failed scrape writes ONLY a scrape_logs row (status=failed), NEVER a price row.
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    mrp NUMERIC(10, 2) CHECK (mrp >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_status VARCHAR(20) CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
    badge TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for product price history queries ordered by timestamp
CREATE INDEX IF NOT EXISTS idx_price_history_product_captured ON price_history(product_id, captured_at DESC);

-- ==========================================
-- 3. SCRAPE_LOGS TABLE
-- ==========================================
-- Stores execution history of all scrape attempts (success & failure)
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
    http_status INTEGER,
    error_message TEXT,
    response_time_ms INTEGER,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for product logs ordered by timestamp
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_created ON scrape_logs(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);

-- ==========================================
-- 4. AUTOMATIC UPDATED_AT TRIGGER
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
