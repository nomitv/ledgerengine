const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/summary?company_id=X&from=&to=
router.get('/summary', authenticate, (req, res) => {
  try {
    const { company_id, from, to } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    // Check access
    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access) return res.status(403).json({ error: 'No access' });
    }

    let dateFilter = '';
    const params = [company_id];
    if (from) { dateFilter += ' AND date >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND date <= ?'; params.push(to); }

    const totalIncome = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = ? AND type = 'income'${dateFilter}`).get(...params).total;
    const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE company_id = ? AND type = 'expense'${dateFilter}`).get(...params).total;
    const txnCount = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE company_id = ?${dateFilter}`).get(...params).count;

    // Recent transactions
    const recent = db.prepare(`
      SELECT t.*, c.name as category_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.company_id = ?${dateFilter}
      ORDER BY t.date DESC LIMIT 5
    `).all(...params);

    res.json({
      total_income: totalIncome,
      total_expense: totalExpense,
      net: totalIncome - totalExpense,
      transaction_count: txnCount,
      recent_transactions: recent
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/monthly?company_id=X&year=
router.get('/monthly', authenticate, (req, res) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    const targetYear = year || new Date().getFullYear();

    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access) return res.status(403).json({ error: 'No access' });
    }

    const monthly = db.prepare(`
      SELECT
        strftime('%m', date) as month,
        type,
        SUM(amount) as total
      FROM transactions
      WHERE company_id = ? AND strftime('%Y', date) = ?
      GROUP BY strftime('%m', date), type
      ORDER BY month
    `).all(company_id, String(targetYear));

    // Build full 12-month array
    const months = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 1; i <= 12; i++) {
      const m = String(i).padStart(2, '0');
      const income = monthly.find(r => r.month === m && r.type === 'income');
      const expense = monthly.find(r => r.month === m && r.type === 'expense');
      months.push({
        month: monthNames[i - 1],
        income: income ? income.total : 0,
        expense: expense ? expense.total : 0
      });
    }

    res.json(months);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/by-category?company_id=X&type=expense&from=&to=
router.get('/by-category', authenticate, (req, res) => {
  try {
    const { company_id, type, from, to } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access) return res.status(403).json({ error: 'No access' });
    }

    let dateFilter = '';
    const params = [company_id];
    if (type) { dateFilter += ' AND t.type = ?'; params.push(type); }
    if (from) { dateFilter += ' AND t.date >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND t.date <= ?'; params.push(to); }

    const data = db.prepare(`
      SELECT c.name as category, COALESCE(SUM(t.amount), 0) as total, COUNT(*) as count
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.company_id = ?${dateFilter}
      GROUP BY t.category_id
      ORDER BY total DESC
    `).all(...params);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/by-tag?company_id=X&from=&to=
router.get('/by-tag', authenticate, (req, res) => {
  try {
    const { company_id, from, to } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });

    if (req.user.role !== 'super_admin') {
      const access = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(req.user.id, company_id);
      if (!access) return res.status(403).json({ error: 'No access' });
    }

    let dateFilter = '';
    const params = [company_id];
    if (from) { dateFilter += ' AND t.date >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND t.date <= ?'; params.push(to); }

    const data = db.prepare(`
      SELECT tg.name as tag, tg.color, SUM(t.amount) as total, COUNT(*) as count, t.type
      FROM transactions t
      JOIN transaction_tags tt ON t.id = tt.transaction_id
      JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.company_id = ?${dateFilter}
      GROUP BY tg.id, t.type
      ORDER BY total DESC
    `).all(...params);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
