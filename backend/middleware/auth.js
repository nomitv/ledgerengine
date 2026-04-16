const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'fintrack-secret-change-in-production';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, display_name, role FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function getCompanyRole(userId, companyId) {
  const row = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(userId, companyId);
  return row ? row.role : null;
}

function requireCompanyAccess(minRole = 'viewer') {
  const roleHierarchy = { admin: 3, manager: 2, viewer: 1 };
  return (req, res, next) => {
    const companyId = req.params.companyId || req.body.company_id || req.query.company_id;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });

    // Super admins bypass company-level checks
    if (req.user.role === 'super_admin') return next();

    const userRole = getCompanyRole(req.user.id, companyId);
    if (!userRole) return res.status(403).json({ error: 'No access to this company' });
    if ((roleHierarchy[userRole] || 0) < (roleHierarchy[minRole] || 0)) {
      return res.status(403).json({ error: 'Insufficient company permissions' });
    }
    req.companyRole = userRole;
    next();
  };
}

module.exports = { authenticate, requireRole, requireCompanyAccess, JWT_SECRET };
