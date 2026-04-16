const express = require('express');
const db = require('../database');
const { authenticate, requireCompanyAccess } = require('../middleware/auth');

const router = express.Router();

// ─── Access helper ─────────────────────────────────────────────────────────────
function checkAccess(user, companyId, minRole = 'viewer') {
  if (user.role === 'super_admin') return true;
  const row = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(user.id, companyId);
  if (!row) return false;
  const hierarchy = { admin: 3, manager: 2, viewer: 1 };
  return (hierarchy[row.role] || 0) >= (hierarchy[minRole] || 0);
}
function checkWrite(user, companyId) { return checkAccess(user, companyId, 'manager'); }

// GET /api/inventory/products?company_id=&search=&page=&limit=
router.get('/products', authenticate, (req, res) => {
  try {
    const { company_id, search, page = 1, limit = 50 } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    if (!checkAccess(req.user, company_id)) return res.status(403).json({ error: 'No access' });

    let where = ['company_id = ?'];
    let params = [company_id];
    if (search) { where.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const whereClause = where.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM products WHERE ${whereClause}`).get(...params).count;
    const products = db.prepare(`SELECT * FROM products WHERE ${whereClause} ORDER BY name LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    res.json({ products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/inventory/products/barcode/:code — look up by barcode OR sku
router.get('/products/barcode/:code', authenticate, (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    if (!checkAccess(req.user, company_id)) return res.status(403).json({ error: 'No access' });

    const product = db.prepare(
      "SELECT * FROM products WHERE company_id = ? AND (barcode = ? OR sku = ?) LIMIT 1"
    ).get(company_id, req.params.code, req.params.code);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/inventory/products
router.post('/products', authenticate, (req, res) => {
  try {
    const { company_id, name, sku, barcode, description, unit_price, gst_rate, hsn_code, stock_qty, track_stock } = req.body;
    if (!company_id || !name) return res.status(400).json({ error: 'company_id and name required' });
    if (!checkWrite(req.user, company_id)) return res.status(403).json({ error: 'No write access' });

    const result = db.prepare(`
      INSERT INTO products (company_id, name, sku, barcode, description, unit_price, gst_rate, hsn_code, stock_qty, track_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(company_id, name, sku || null, barcode || null, description || null,
       parseFloat(unit_price) || 0, parseFloat(gst_rate) ?? 18,
       hsn_code || null, parseInt(stock_qty) || 0, track_stock ? 1 : 1);

    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/inventory/products/:id
router.put('/products/:id', authenticate, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!checkWrite(req.user, product.company_id)) return res.status(403).json({ error: 'No write access' });

    const { name, sku, barcode, description, unit_price, gst_rate, hsn_code, stock_qty, track_stock } = req.body;
    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name), sku = COALESCE(?, sku), barcode = COALESCE(?, barcode),
        description = COALESCE(?, description), unit_price = COALESCE(?, unit_price),
        gst_rate = COALESCE(?, gst_rate), hsn_code = COALESCE(?, hsn_code),
        stock_qty = COALESCE(?, stock_qty), track_stock = COALESCE(?, track_stock)
      WHERE id = ?
    `).run(name, sku, barcode, description,
       unit_price ? parseFloat(unit_price) : null,
       gst_rate != null ? parseFloat(gst_rate) : null,
       hsn_code, stock_qty != null ? parseInt(stock_qty) : null,
       track_stock != null ? (track_stock ? 1 : 0) : null,
       req.params.id);

    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/inventory/products/:id
router.delete('/products/:id', authenticate, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!checkWrite(req.user, product.company_id)) return res.status(403).json({ error: 'No write access' });
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
