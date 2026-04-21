const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/companies
router.get('/', authenticate, (req, res) => {
  try {
    let companies;
    if (req.user.role === 'super_admin') {
      companies = db.prepare('SELECT * FROM companies WHERE deleted_at IS NULL ORDER BY name').all();
    } else {
      companies = db.prepare(`
        SELECT c.*, uc.role as user_role
        FROM companies c JOIN user_companies uc ON c.id = uc.company_id
        WHERE uc.user_id = ? AND c.deleted_at IS NULL
        ORDER BY c.name
      `).all(req.user.id);
    }
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies
router.post('/', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const { name, description, currency } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name required' });

    const result = db.prepare(`
      INSERT INTO companies (name, description, currency, created_by) VALUES (?, ?, ?, ?)
    `).run(name, description || '', currency || 'INR', req.user.id);

    const companyId = result.lastInsertRowid;

    // Add creator as admin of the company
    db.prepare('INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)').run(req.user.id, companyId, 'admin');

    // Create default categories
    const defaultCategories = [
      { name: 'Salary', type: 'income' }, { name: 'Sales', type: 'income' },
      { name: 'Investment', type: 'income' }, { name: 'Other Income', type: 'income' },
      { name: 'Rent', type: 'expense' }, { name: 'Utilities', type: 'expense' },
      { name: 'Payroll', type: 'expense' }, { name: 'Marketing', type: 'expense' },
      { name: 'Office Supplies', type: 'expense' }, { name: 'Travel', type: 'expense' },
      { name: 'Software', type: 'expense' }, { name: 'Other Expense', type: 'expense' }
    ];

    const insertCat = db.prepare('INSERT INTO categories (name, type, company_id) VALUES (?, ?, ?)');
    for (const cat of defaultCategories) {
      insertCat.run(cat.name, cat.type, companyId);
    }

    res.status(201).json({ id: companyId, name, description, currency: currency || 'INR' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/companies/:id
router.put('/:id', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const { name, description, currency, gstin, address, phone, email, state_code } = req.body;
    db.prepare(`
      UPDATE companies SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        currency = COALESCE(?, currency),
        gstin = COALESCE(?, gstin),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        state_code = COALESCE(?, state_code)
      WHERE id = ?
    `).run(name, description, currency, gstin, address, phone, email, state_code, req.params.id);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// DELETE /api/companies/:id
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  try {
    if (req.query.hard === 'true' && req.user.role === 'super_admin') {
      db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
    } else {
      db.prepare('UPDATE companies SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies/:id/users - assign user to company
router.post('/:id/users', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const { user_id, role } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    db.prepare('INSERT OR REPLACE INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)')
      .run(user_id, req.params.id, role || 'viewer');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/companies/:id/users - list company users
router.get('/:id/users', authenticate, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.display_name, u.role as global_role, uc.role as company_role
      FROM users u JOIN user_companies uc ON u.id = uc.user_id
      WHERE uc.company_id = ? AND u.deleted_at IS NULL
    `).all(req.params.id);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/companies/:id/users/:userId - remove user from company
router.delete('/:id/users/:userId', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM user_companies WHERE user_id = ? AND company_id = ?').run(req.params.userId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
