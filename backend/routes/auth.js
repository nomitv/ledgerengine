const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticate, requireRole, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    // Get user's companies
    const companies = db.prepare(`
      SELECT c.*, uc.role as user_role
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = ?
    `).all(user.id);

    // Super admin gets all companies
    const allCompanies = user.role === 'super_admin'
      ? db.prepare("SELECT *, 'admin' as user_role FROM companies").all()
      : companies;

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, role: user.role },
      companies: allCompanies
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
router.post('/register', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const { username, email, password, display_name, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    const allowedRoles = ['admin', 'manager', 'viewer'];
    const userRole = allowedRoles.includes(role) ? role : 'viewer';

    // Only super_admin can create admin users
    if (userRole === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can create admin users' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hash, display_name || username, userRole);

    res.status(201).json({ id: result.lastInsertRowid, username, email, display_name: display_name || username, role: userRole });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const companies = req.user.role === 'super_admin'
    ? db.prepare("SELECT *, 'admin' as user_role FROM companies").all()
    : db.prepare(`
        SELECT c.*, uc.role as user_role
        FROM companies c JOIN user_companies uc ON c.id = uc.company_id
        WHERE uc.user_id = ?
      `).all(req.user.id);

  res.json({ user: req.user, companies });
});

// GET /api/auth/users - list all users (admin only)
router.get('/users', authenticate, requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, email, display_name, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', authenticate, requireRole('super_admin'), (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
