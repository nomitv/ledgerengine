const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fintrack.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'viewer' CHECK(role IN ('super_admin','admin','manager','viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      currency TEXT DEFAULT 'INR',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'viewer' CHECK(role IN ('admin','manager','viewer')),
      UNIQUE(user_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      icon TEXT DEFAULT 'folder',
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(transaction_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions(company_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_user_companies_user ON user_companies(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_companies_company ON user_companies(company_id);

    -- ── v0.3.0: Inventory & Billing ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      description TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      gst_rate REAL DEFAULT 18,
      hsn_code TEXT,
      stock_qty INTEGER DEFAULT 0,
      track_stock INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
      invoice_number TEXT NOT NULL,
      customer_name TEXT,
      customer_gstin TEXT,
      customer_address TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','issued','paid','cancelled')),
      subtotal REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_cgst REAL DEFAULT 0,
      total_sgst REAL DEFAULT 0,
      total_igst REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      notes TEXT,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      issued_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      sku TEXT,
      hsn_code TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      gst_rate REAL DEFAULT 0,
      cgst_rate REAL DEFAULT 0,
      sgst_rate REAL DEFAULT 0,
      igst_rate REAL DEFAULT 0,
      line_total REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  `);

  // Seed default admin user if no users exist.
  // All values are configurable via environment variables.
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@ledgerengine.local';
    const adminName     = process.env.ADMIN_NAME     || 'Administrator';

    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, role)
      VALUES (?, ?, ?, ?, 'super_admin')
    `).run(adminUsername, adminEmail, hash, adminName);
    console.log(`✓ Default admin created  →  ${adminUsername} / ${adminPassword}`);
  }

  // ── v0.3.0 migration: add billing profile columns to companies ─────────────
  // SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we try each
  // separately and swallow "duplicate column" errors.
  const companyBillingCols = ['gstin', 'address', 'phone', 'email', 'logo_path', 'state_code'];
  for (const col of companyBillingCols) {
    try {
      db.exec(`ALTER TABLE companies ADD COLUMN ${col} TEXT`);
    } catch (_) { /* column already exists — safe to ignore */ }
  }

}

initializeDatabase();

module.exports = db;
