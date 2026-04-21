const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Helper: verify company access
function checkAccess(user, companyId) {
  if (user.role === 'super_admin') return true;
  const row = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(user.id, companyId);
  return !!row;
}

function inr(amount) {
  return 'Rs. ' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET /api/reports/transactions?company_id=&from=&to=&type=&format=csv|pdf
router.get('/transactions', authenticate, (req, res) => {
  const { company_id, from, to, type, format = 'csv' } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  if (!checkAccess(req.user, company_id)) return res.status(403).json({ error: 'No access' });

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(company_id);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  // Build query
  let where = ['t.company_id = ?', 't.deleted_at IS NULL'];
  let params = [company_id];
  if (from)  { where.push('t.date >= ?'); params.push(from); }
  if (to)    { where.push('t.date <= ?'); params.push(to); }
  if (type)  { where.push('t.type = ?'); params.push(type); }

  const whereClause = where.join(' AND ');
  const transactions = db.prepare(`
    SELECT t.*, c.name as category_name, u.display_name as user_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE ${whereClause}
    ORDER BY t.date DESC, t.created_at DESC
  `).all(...params);

  const totalIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const dateLabel = (from || to) ? `${from || ''}${from && to ? ' to ' : ''}${to || ''}` : 'All time';
  const filename = `${company.name.replace(/\s+/g, '_')}_transactions_${new Date().toISOString().slice(0,10)}`;

  // ── CSV ──────────────────────────────────────────────────────────────────
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    const headers = ['Date', 'Type', 'Amount (INR)', 'Category', 'Description', 'Added By'];
    const rows = transactions.map(t => [
      t.date,
      t.type.charAt(0).toUpperCase() + t.type.slice(1),
      t.amount.toFixed(2),
      t.category_name || '',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.user_name || ''
    ]);

    let csv = `${company.name} — Transaction Report\n`;
    csv += `Period: ${dateLabel}\n`;
    csv += `Generated: ${new Date().toLocaleString('en-IN')}\n\n`;
    csv += headers.join(',') + '\n';
    csv += rows.map(r => r.join(',')).join('\n');
    csv += `\n\nTotal Income,${totalIncome.toFixed(2)}\n`;
    csv += `Total Expense,${totalExpense.toFixed(2)}\n`;
    csv += `Net Balance,${(totalIncome - totalExpense).toFixed(2)}\n`;

    return res.send(csv);
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Transaction Report', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(company.name, { align: 'center' });
    doc.fontSize(10).fillColor('#6b7280').text(`Period: ${dateLabel}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
    doc.moveDown(1);

    // Summary boxes
    const summaryY = doc.y;
    const boxW = 150, boxH = 50, gap = 10;
    const startX = 40;
    [
      { label: 'Total Income',  value: inr(totalIncome),  color: '#16a34a' },
      { label: 'Total Expense', value: inr(totalExpense), color: '#dc2626' },
      { label: 'Net Balance',   value: inr(totalIncome - totalExpense), color: totalIncome >= totalExpense ? '#2563eb' : '#dc2626' }
    ].forEach((box, i) => {
      const x = startX + i * (boxW + gap);
      doc.rect(x, summaryY, boxW, boxH).fillAndStroke('#f9fafb', '#e5e7eb');
      doc.fillColor('#374151').fontSize(8).text(box.label, x + 8, summaryY + 8, { width: boxW - 16 });
      doc.fillColor(box.color).fontSize(13).font('Helvetica-Bold').text(box.value, x + 8, summaryY + 22, { width: boxW - 16 });
      doc.font('Helvetica').fillColor('#111827');
    });
    doc.y = summaryY + boxH + 16;
    doc.moveDown(0.5);

    // Table header
    const cols = [
      { label: 'Date',        width: 70,  x: 40 },
      { label: 'Type',        width: 55,  x: 110 },
      { label: 'Amount',      width: 80,  x: 165 },
      { label: 'Category',    width: 90,  x: 245 },
      { label: 'Description', width: 175, x: 335 },
    ];

    doc.rect(40, doc.y, 515, 18).fill('#4f46e5');
    cols.forEach(col => {
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
        .text(col.label, col.x + 3, doc.y - 14, { width: col.width - 6 });
    });
    doc.fillColor('#111827').font('Helvetica');
    doc.y += 6;

    // Table rows
    let rowCount = 0;
    for (const t of transactions) {
      const rowY = doc.y;
      if (rowY > 760) { doc.addPage(); }

      const bg = rowCount % 2 === 0 ? '#ffffff' : '#f9fafb';
      doc.rect(40, doc.y, 515, 16).fill(bg);

      const amtColor = t.type === 'income' ? '#16a34a' : '#dc2626';
      const amtStr = (t.type === 'income' ? '+' : '-') + inr(t.amount);

      doc.fillColor('#374151').fontSize(8)
        .text(t.date,                    cols[0].x + 3, doc.y - 12, { width: cols[0].width - 6 })
        .text(t.type.charAt(0).toUpperCase() + t.type.slice(1), cols[1].x + 3, doc.y - 12, { width: cols[1].width - 6 });
      doc.fillColor(amtColor)
        .text(amtStr, cols[2].x + 3, doc.y - 12, { width: cols[2].width - 6 });
      doc.fillColor('#374151')
        .text(t.category_name || '—',   cols[3].x + 3, doc.y - 12, { width: cols[3].width - 6 })
        .text(t.description || '—',     cols[4].x + 3, doc.y - 12, { width: cols[4].width - 6 });

      doc.y += 4;
      rowCount++;
    }

    if (transactions.length === 0) {
      doc.fillColor('#6b7280').fontSize(10).text('No transactions found for the selected period.', { align: 'center' });
    }

    doc.end();
    return;
  }

  return res.status(400).json({ error: 'format must be csv or pdf' });
});

module.exports = router;
