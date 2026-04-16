const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireCompanyAccess } = require('../middleware/auth');

const router = express.Router();

// File upload config
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Allowlist: images and PDFs only
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf'
    ];
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'));
    }
  }
}); // 10MB limit


// GET /api/transactions?company_id=X&type=&category_id=&tag_id=&from=&to=&search=&page=&limit=
router.get('/', authenticate, (req, res) => {
  try {
    const { company_id, type, category_id, tag_id, from, to, search, page = 1, limit = 50 } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    // Check access
    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access) return res.status(403).json({ error: 'No access to this company' });
    }

    let where = ['t.company_id = ?'];
    let params = [company_id];

    if (type) { where.push('t.type = ?'); params.push(type); }
    if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
    if (from) { where.push('t.date >= ?'); params.push(from); }
    if (to) { where.push('t.date <= ?'); params.push(to); }
    if (search) { where.push('t.description LIKE ?'); params.push(`%${search}%`); }
    if (tag_id) {
      where.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)');
      params.push(tag_id);
    }

    const whereClause = where.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = db.prepare(`SELECT COUNT(*) as count FROM transactions t WHERE ${whereClause}`).get(...params).count;

    const transactions = db.prepare(`
      SELECT t.*, c.name as category_name, u.display_name as user_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${whereClause}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    // Fetch tags and attachments for each transaction
    const getTagsStmt = db.prepare(`
      SELECT tg.* FROM tags tg JOIN transaction_tags tt ON tg.id = tt.tag_id WHERE tt.transaction_id = ?
    `);
    const getAttachmentsStmt = db.prepare('SELECT * FROM attachments WHERE transaction_id = ?');

    for (const txn of transactions) {
      txn.tags = getTagsStmt.all(txn.id);
      txn.attachments = getAttachmentsStmt.all(txn.id);
    }

    res.json({ transactions, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions
router.post('/', authenticate, upload.array('files', 5), (req, res) => {
  try {
    const { company_id, type, amount, description, category_id, date, tags } = req.body;
    if (!company_id || !type || !amount || !date) {
      return res.status(400).json({ error: 'company_id, type, amount, and date required' });
    }

    // Check write access
    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access || access.role === 'viewer') return res.status(403).json({ error: 'No write access' });
    }

    const result = db.prepare(`
      INSERT INTO transactions (company_id, user_id, type, amount, description, category_id, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(company_id, req.user.id, type, parseFloat(amount), description || '', category_id || null, date);

    const txnId = result.lastInsertRowid;

    // Add tags
    if (tags) {
      const tagIds = Array.isArray(tags) ? tags : JSON.parse(tags);
      const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
      for (const tagId of tagIds) insertTag.run(txnId, tagId);
    }

    // Add attachments
    if (req.files && req.files.length > 0) {
      const insertAttachment = db.prepare(`
        INSERT INTO attachments (transaction_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)
      `);
      for (const file of req.files) {
        insertAttachment.run(txnId, file.originalname, file.filename, file.mimetype, file.size);
      }
    }

    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
    txn.tags = db.prepare('SELECT tg.* FROM tags tg JOIN transaction_tags tt ON tg.id = tt.tag_id WHERE tt.transaction_id = ?').all(txnId);
    txn.attachments = db.prepare('SELECT * FROM attachments WHERE transaction_id = ?').all(txnId);

    res.status(201).json(txn);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/transactions/:id
router.put('/:id', authenticate, (req, res) => {
  try {
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, txn.company_id);
      if (!access || access.role === 'viewer') return res.status(403).json({ error: 'No write access' });
    }

    const { type, amount, description, category_id, date, tags } = req.body;

    db.prepare(`
      UPDATE transactions SET
        type = COALESCE(?, type), amount = COALESCE(?, amount), description = COALESCE(?, description),
        category_id = COALESCE(?, category_id), date = COALESCE(?, date), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(type, amount ? parseFloat(amount) : null, description, category_id, date, req.params.id);

    // Update tags if provided
    if (tags !== undefined) {
      db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(req.params.id);
      const tagIds = Array.isArray(tags) ? tags : JSON.parse(tags);
      const insertTag = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
      for (const tagId of tagIds) insertTag.run(req.params.id, tagId);
    }

    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    updated.tags = db.prepare('SELECT tg.* FROM tags tg JOIN transaction_tags tt ON tg.id = tt.tag_id WHERE tt.transaction_id = ?').all(req.params.id);
    updated.attachments = db.prepare('SELECT * FROM attachments WHERE transaction_id = ?').all(req.params.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, txn.company_id);
      if (!access || access.role === 'viewer') return res.status(403).json({ error: 'No write access' });
    }

    // Delete attachment files
    const attachments = db.prepare('SELECT stored_name FROM attachments WHERE transaction_id = ?').all(req.params.id);
    for (const att of attachments) {
      const filepath = path.join(UPLOAD_DIR, att.stored_name);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions/:id/attachments - add files to existing transaction
router.post('/:id/attachments', authenticate, upload.array('files', 5), (req, res) => {
  try {
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const insertAttachment = db.prepare(`
      INSERT INTO attachments (transaction_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)
    `);
    const added = [];
    for (const file of req.files) {
      const result = insertAttachment.run(req.params.id, file.originalname, file.filename, file.mimetype, file.size);
      added.push({ id: result.lastInsertRowid, original_name: file.originalname, stored_name: file.filename });
    }

    res.status(201).json(added);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/attachments/:filename - serve file (authenticated)
router.get('/attachments/:filename', authenticate, (req, res) => {
  // Sanitize: only allow UUID-style filenames with a single safe extension
  const filename = path.basename(req.params.filename); // strip any directory components
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = path.resolve(UPLOAD_DIR, filename);
  // Double-check resolved path is still inside UPLOAD_DIR (defense-in-depth)
  if (!filepath.startsWith(path.resolve(UPLOAD_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Verify requester owns/accesses the attachment via DB
  const attachment = db.prepare(`
    SELECT a.*, t.company_id FROM attachments a
    JOIN transactions t ON a.transaction_id = t.id
    WHERE a.stored_name = ?
  `).get(filename);
  if (!attachment) return res.status(404).json({ error: 'File not found' });

  // Check company access
  if (req.user.role !== 'super_admin') {
    const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?')
      .get(req.user.id, attachment.company_id);
    if (!access) return res.status(403).json({ error: 'No access' });
  }

  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filepath);
});


// --- Categories ---
// GET /api/transactions/categories?company_id=X
router.get('/categories', authenticate, (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    const categories = db.prepare('SELECT * FROM categories WHERE company_id = ? ORDER BY type, name').all(company_id);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions/categories
router.post('/categories', authenticate, (req, res) => {
  try {
    const { name, type, company_id, icon } = req.body;
    if (!name || !type || !company_id) return res.status(400).json({ error: 'name, type, company_id required' });
    const result = db.prepare('INSERT INTO categories (name, type, company_id, icon) VALUES (?, ?, ?, ?)').run(name, type, company_id, icon || 'folder');
    res.status(201).json({ id: result.lastInsertRowid, name, type, company_id, icon: icon || 'folder' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/categories/:id
router.delete('/categories/:id', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tags ---
// GET /api/transactions/tags?company_id=X
router.get('/tags', authenticate, (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    const tags = db.prepare('SELECT * FROM tags WHERE company_id = ? ORDER BY name').all(company_id);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions/tags
router.post('/tags', authenticate, (req, res) => {
  try {
    const { name, color, company_id } = req.body;
    if (!name || !company_id) return res.status(400).json({ error: 'name and company_id required' });
    const result = db.prepare('INSERT INTO tags (name, color, company_id) VALUES (?, ?, ?)').run(name, color || '#6366f1', company_id);
    res.status(201).json({ id: result.lastInsertRowid, name, color: color || '#6366f1', company_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/tags/:id
router.delete('/tags/:id', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
