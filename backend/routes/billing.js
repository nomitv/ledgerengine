const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────
function checkAccess(user, companyId, minRole = 'viewer') {
  if (user.role === 'super_admin') return true;
  const row = db.prepare('SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?').get(user.id, companyId);
  if (!row) return false;
  const h = { admin: 3, manager: 2, viewer: 1 };
  return (h[row.role] || 0) >= (h[minRole] || 0);
}

function pad(n, len = 4) { return String(n).padStart(len, '0'); }

function inr(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// Generate next invoice number for a company: INV-YYYY-NNNN
function nextInvoiceNumber(companyId) {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM invoices WHERE company_id = ? AND invoice_number LIKE ?"
  ).get(companyId, `INV-${year}-%`);
  return `INV-${year}-${pad(row.count + 1)}`;
}

// Calculate GST for a line item
// intraState: CGST + SGST; interState: IGST
function calcGst(unitPrice, qty, gstRate, intraState = true) {
  const linePre = unitPrice * qty;
  if (intraState) {
    const half = gstRate / 2;
    return { cgst: half, sgst: half, igst: 0, cgstAmt: linePre * half / 100, sgstAmt: linePre * half / 100, igstAmt: 0, taxTotal: linePre * gstRate / 100 };
  } else {
    return { cgst: 0, sgst: 0, igst: gstRate, cgstAmt: 0, sgstAmt: 0, igstAmt: linePre * gstRate / 100, taxTotal: linePre * gstRate / 100 };
  }
}

function getInvoiceWithItems(invoiceId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(invoiceId);
  if (!invoice) return null;
  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(invoiceId);
  return invoice;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/billing/invoices?company_id=&status=&from=&to=&page=&limit=
router.get('/invoices', authenticate, (req, res) => {
  try {
    const { company_id, status, from, to, page = 1, limit = 20 } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    if (!checkAccess(req.user, company_id)) return res.status(403).json({ error: 'No access' });

    let where = ['company_id = ?', 'deleted_at IS NULL'];
    let params = [company_id];
    if (status) { where.push('status = ?'); params.push(status); }
    if (from)   { where.push("date(created_at) >= ?"); params.push(from); }
    if (to)     { where.push("date(created_at) <= ?"); params.push(to); }

    const whereClause = where.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const total = db.prepare(`SELECT COUNT(*) as count FROM invoices WHERE ${whereClause}`).get(...params).count;
    const invoices = db.prepare(`SELECT * FROM invoices WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    res.json({ invoices, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/billing/invoices/:id
router.get('/invoices/:id', authenticate, (req, res) => {
  try {
    const invoice = getInvoiceWithItems(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id)) return res.status(403).json({ error: 'No access' });
    res.json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/billing/invoices — create draft
router.post('/invoices', authenticate, (req, res) => {
  try {
    const { company_id, customer_name, customer_gstin, customer_address, customer_phone, customer_email, notes, items = [], discount_amount = 0, intra_state = true } = req.body;
    if (!company_id) return res.status(400).json({ error: 'company_id required' });
    if (!checkAccess(req.user, company_id, 'manager')) return res.status(403).json({ error: 'No write access' });

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(company_id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const invoiceNumber = nextInvoiceNumber(company_id);
    let subtotal = 0, total_cgst = 0, total_sgst = 0, total_igst = 0;

    // Pre-calculate totals
    for (const item of items) {
      const gst = calcGst(item.unit_price, item.quantity, item.gst_rate || 0, intra_state);
      subtotal   += item.unit_price * item.quantity;
      total_cgst += gst.cgstAmt;
      total_sgst += gst.sgstAmt;
      total_igst += gst.igstAmt;
    }
    const grand_total = subtotal + total_cgst + total_sgst + total_igst - parseFloat(discount_amount || 0);

    const result = db.prepare(`
      INSERT INTO invoices (company_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone, customer_email, notes, subtotal, discount_amount, total_cgst, total_sgst, total_igst, grand_total, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(company_id, invoiceNumber, customer_name || null, customer_gstin || null, customer_address || null, customer_phone || null, customer_email || null, notes || null, subtotal, parseFloat(discount_amount) || 0, total_cgst, total_sgst, total_igst, grand_total, req.user.id);

    const invoiceId = result.lastInsertRowid;

    // Insert line items
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_id, name, sku, hsn_code, unit_price, quantity, gst_rate, cgst_rate, sgst_rate, igst_rate, line_total)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const item of items) {
      const gst = calcGst(item.unit_price, item.quantity, item.gst_rate || 0, intra_state);
      insertItem.run(invoiceId, item.product_id || null, item.name, item.sku || null, item.hsn_code || null, item.unit_price, item.quantity, item.gst_rate || 0, gst.cgst, gst.sgst, gst.igst, item.unit_price * item.quantity);
    }

    res.status(201).json(getInvoiceWithItems(invoiceId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/billing/invoices/:id — update draft
router.put('/invoices/:id', authenticate, (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id, 'manager')) return res.status(403).json({ error: 'No write access' });
    if (invoice.status === 'issued' || invoice.status === 'paid') return res.status(400).json({ error: 'Cannot edit an issued/paid invoice' });

    const { customer_name, customer_gstin, customer_address, customer_phone, customer_email, notes, items, discount_amount, intra_state = true, status } = req.body;

    // Recalc if items provided
    if (items) {
      let subtotal = 0, total_cgst = 0, total_sgst = 0, total_igst = 0;
      for (const item of items) {
        const gst = calcGst(item.unit_price, item.quantity, item.gst_rate || 0, intra_state);
        subtotal   += item.unit_price * item.quantity;
        total_cgst += gst.cgstAmt; total_sgst += gst.sgstAmt; total_igst += gst.igstAmt;
      }
      const grand_total = subtotal + total_cgst + total_sgst + total_igst - parseFloat(discount_amount ?? invoice.discount_amount);

      db.prepare(`UPDATE invoices SET customer_name=?, customer_gstin=?, customer_address=?, customer_phone=?, customer_email=?, notes=?, subtotal=?, discount_amount=?, total_cgst=?, total_sgst=?, total_igst=?, grand_total=?, status=COALESCE(?,status) WHERE id=?`)
        .run(customer_name ?? invoice.customer_name, customer_gstin ?? invoice.customer_gstin, customer_address ?? invoice.customer_address, customer_phone ?? invoice.customer_phone, customer_email ?? invoice.customer_email, notes ?? invoice.notes, subtotal, parseFloat(discount_amount ?? invoice.discount_amount), total_cgst, total_sgst, total_igst, grand_total, status || null, req.params.id);

      // Re-insert items
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
      const insertItem = db.prepare(`INSERT INTO invoice_items (invoice_id, product_id, name, sku, hsn_code, unit_price, quantity, gst_rate, cgst_rate, sgst_rate, igst_rate, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of items) {
        const gst = calcGst(item.unit_price, item.quantity, item.gst_rate || 0, intra_state);
        insertItem.run(req.params.id, item.product_id || null, item.name, item.sku || null, item.hsn_code || null, item.unit_price, item.quantity, item.gst_rate || 0, gst.cgst, gst.sgst, gst.igst, item.unit_price * item.quantity);
      }
    } else {
      db.prepare(`UPDATE invoices SET customer_name=COALESCE(?,customer_name), customer_gstin=COALESCE(?,customer_gstin), notes=COALESCE(?,notes), status=COALESCE(?,status) WHERE id=?`)
        .run(customer_name, customer_gstin, notes, status, req.params.id);
    }

    res.json(getInvoiceWithItems(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/billing/invoices/:id/issue — finalise & auto-create income transaction
router.post('/invoices/:id/issue', authenticate, (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id, 'manager')) return res.status(403).json({ error: 'No write access' });
    if (invoice.status !== 'draft') return res.status(400).json({ error: 'Only drafts can be issued' });

    const now = new Date().toISOString().split('T')[0];

    // Auto-create income transaction
    const txn = db.prepare(`
      INSERT INTO transactions (company_id, user_id, type, amount, description, date)
      VALUES (?, ?, 'income', ?, ?, ?)
    `).run(invoice.company_id, req.user.id, invoice.grand_total, `Invoice ${invoice.invoice_number}${invoice.customer_name ? ' — ' + invoice.customer_name : ''}`, now);

    db.prepare(`UPDATE invoices SET status='issued', issued_at=?, transaction_id=? WHERE id=?`)
      .run(now, txn.lastInsertRowid, req.params.id);

    // Decrement stock for tracked products
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    for (const item of items) {
      if (item.product_id) {
        db.prepare('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ? AND track_stock = 1')
          .run(item.quantity, item.product_id);
      }
    }

    res.json(getInvoiceWithItems(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/billing/invoices/:id/status — mark paid or cancelled
router.put('/invoices/:id/status', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    if (!['paid', 'cancelled'].includes(status)) return res.status(400).json({ error: 'status must be paid or cancelled' });
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id, 'manager')) return res.status(403).json({ error: 'No write access' });

    // Cannot cancel a paid invoice — too late to reverse
    if (status === 'cancelled' && invoice.status === 'paid') {
      return res.status(400).json({ error: 'A paid invoice cannot be cancelled. Create a credit note manually.' });
    }

    // When cancelling an issued invoice, delete the auto-created income transaction
    // so it doesn't inflate the company financials
    if (status === 'cancelled' && invoice.status === 'issued' && invoice.transaction_id) {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(invoice.transaction_id);
    }

    // Restore stock if cancelling an issued invoice
    if (status === 'cancelled' && invoice.status === 'issued') {
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
      for (const item of items) {
        if (item.product_id) {
          db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND track_stock = 1')
            .run(item.quantity, item.product_id);
        }
      }
    }

    db.prepare('UPDATE invoices SET status = ?, transaction_id = CASE WHEN ? = ? THEN NULL ELSE transaction_id END WHERE id = ?')
      .run(status, status, 'cancelled', req.params.id);
    res.json(getInvoiceWithItems(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// GET /api/billing/invoices/:id/pdf — generate invoice PDF
router.get('/invoices/:id/pdf', authenticate, (req, res) => {
  try {
    const invoice = getInvoiceWithItems(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id)) return res.status(403).json({ error: 'No access' });

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(invoice.company_id);
    const filename = `${invoice.invoice_number}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    // ── Header ──────────────────────────────────────────────────────────────
    // Left: company info
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e1b4b').text(company.name, 40, 40);
    if (company.gstin) doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text(`GSTIN: ${company.gstin}`);
    if (company.address) doc.text(company.address);
    if (company.phone)   doc.text(`Ph: ${company.phone}`);
    if (company.email)   doc.text(company.email);

    // Right: invoice info box
    const rightX = 360;
    doc.rect(rightX, 38, 195, 90).fillAndStroke('#f5f3ff', '#4f46e5');
    doc.fillColor('#4f46e5').fontSize(14).font('Helvetica-Bold').text('TAX INVOICE', rightX + 10, 46, { width: 175, align: 'center' });
    doc.fillColor('#374151').fontSize(9).font('Helvetica')
      .text(`Invoice #: ${invoice.invoice_number}`, rightX + 10, 70)
      .text(`Date: ${invoice.issued_at || invoice.created_at.split('T')[0]}`)
      .text(`Status: ${invoice.status.toUpperCase()}`);

    // ── Bill To ──────────────────────────────────────────────────────────────
    const billToY = 145;
    doc.rect(40, billToY, 250, 75).fillAndStroke('#f9fafb', '#e5e7eb');
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold').text('BILL TO', 50, billToY + 8);
    doc.fillColor('#111827').font('Helvetica')
      .text(invoice.customer_name || 'Customer', 50, billToY + 20, { width: 230 })
      .text(invoice.customer_gstin ? `GSTIN: ${invoice.customer_gstin}` : '', 50, { width: 230 })
      .text(invoice.customer_address || '', 50, { width: 230 })
      .text(invoice.customer_phone ? `Ph: ${invoice.customer_phone}` : '', 50, { width: 230 });

    doc.y = billToY + 90;

    // ── Line Items Table ──────────────────────────────────────────────────────
    const tableTop = doc.y + 5;
    const cols = [
      { label: '#',          x: 40,  w: 20  },
      { label: 'Item',       x: 60,  w: 160 },
      { label: 'HSN',        x: 220, w: 50  },
      { label: 'Qty',        x: 270, w: 30  },
      { label: 'Unit Price', x: 300, w: 65  },
      { label: 'GST%',       x: 365, w: 35  },
      { label: 'Tax Amt',    x: 400, w: 60  },
      { label: 'Total',      x: 460, w: 75  },
    ];

    doc.rect(40, tableTop, 495, 18).fill('#4f46e5');
    cols.forEach(c => {
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold')
        .text(c.label, c.x + 2, tableTop + 5, { width: c.w - 4, align: c.label === '#' || c.label === 'Qty' ? 'center' : 'left' });
    });
    doc.fillColor('#111827').font('Helvetica');

    let rowY = tableTop + 18;
    invoice.items.forEach((item, i) => {
      const isIntra = item.igst_rate === 0;
      const taxAmt = isIntra ? (item.cgst_rate + item.sgst_rate) / 100 * item.line_total : item.igst_rate / 100 * item.line_total;
      const rowTotal = item.line_total + taxAmt;
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      doc.rect(40, rowY, 495, 16).fill(bg);

      doc.fillColor('#374151').fontSize(8)
        .text(String(i + 1), cols[0].x + 2, rowY + 4, { width: cols[0].w - 4, align: 'center' })
        .text(item.name,      cols[1].x + 2, rowY + 4, { width: cols[1].w - 4 })
        .text(item.hsn_code || '—', cols[2].x + 2, rowY + 4, { width: cols[2].w - 4 })
        .text(String(item.quantity), cols[3].x + 2, rowY + 4, { width: cols[3].w - 4, align: 'center' })
        .text(inr(item.unit_price),  cols[4].x + 2, rowY + 4, { width: cols[4].w - 4, align: 'right' })
        .text(`${item.gst_rate}%`, cols[5].x + 2, rowY + 4, { width: cols[5].w - 4, align: 'center' })
        .text(inr(taxAmt),  cols[6].x + 2, rowY + 4, { width: cols[6].w - 4, align: 'right' })
        .text(inr(rowTotal), cols[7].x + 2, rowY + 4, { width: cols[7].w - 4, align: 'right' });

      rowY += 16;
    });

    if (invoice.items.length === 0) {
      doc.fillColor('#9ca3af').fontSize(9).text('No items', 40, rowY + 4, { width: 495, align: 'center' });
      rowY += 20;
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    rowY += 8;
    const totalsX = 360;
    const totalsW = 175;
    const addTotalRow = (label, value, bold = false, color = '#374151') => {
      doc.fillColor(color).fontSize(bold ? 10 : 9)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, totalsX, rowY, { width: 95 })
        .text(value, totalsX + 95, rowY, { width: 80, align: 'right' });
      rowY += bold ? 14 : 12;
    };

    addTotalRow('Subtotal:', inr(invoice.subtotal));
    if (invoice.total_cgst > 0) {
      addTotalRow('CGST:', inr(invoice.total_cgst));
      addTotalRow('SGST:', inr(invoice.total_sgst));
    }
    if (invoice.total_igst > 0) addTotalRow('IGST:', inr(invoice.total_igst));
    if (invoice.discount_amount > 0) addTotalRow('Discount:', `-${inr(invoice.discount_amount)}`, false, '#dc2626');

    doc.moveTo(totalsX, rowY).lineTo(totalsX + totalsW, rowY).strokeColor('#e5e7eb').stroke();
    rowY += 4;
    addTotalRow('Grand Total:', inr(invoice.grand_total), true, '#1e1b4b');

    // ── GST Breakdown (only for intra-state) ─────────────────────────────────
    const hasIntra = invoice.items.some(i => i.cgst_rate > 0);
    const hasInter = invoice.items.some(i => i.igst_rate > 0);
    if (hasIntra || hasInter) {
      rowY += 16;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text('GST Summary', 40, rowY);
      rowY += 14;

      doc.rect(40, rowY, 300, 16).fill('#f3f4f6');
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold')
        .text('GST Rate', 48, rowY + 4)
        .text('Taxable Amt', 120, rowY + 4)
        .text('CGST', 195, rowY + 4)
        .text('SGST', 230, rowY + 4)
        .text('IGST', 265, rowY + 4)
        .text('Total Tax', 295, rowY + 4);
      rowY += 16;

      // Group items by GST rate
      const gstGroups = {};
      for (const item of invoice.items) {
        const key = item.gst_rate;
        if (!gstGroups[key]) gstGroups[key] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        gstGroups[key].taxable += item.line_total;
        gstGroups[key].cgst   += item.cgst_rate / 100 * item.line_total;
        gstGroups[key].sgst   += item.sgst_rate / 100 * item.line_total;
        gstGroups[key].igst   += item.igst_rate / 100 * item.line_total;
      }

      Object.entries(gstGroups).forEach(([rate, g], gi) => {
        const bg = gi % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(40, rowY, 300, 14).fill(bg);
        doc.fillColor('#374151').fontSize(8).font('Helvetica')
          .text(`${rate}%`, 48, rowY + 3)
          .text(inr(g.taxable), 115, rowY + 3)
          .text(inr(g.cgst), 190, rowY + 3)
          .text(inr(g.sgst), 225, rowY + 3)
          .text(inr(g.igst), 260, rowY + 3)
          .text(inr(g.cgst + g.sgst + g.igst), 290, rowY + 3);
        rowY += 14;
      });
    }

    // ── Notes & Footer ───────────────────────────────────────────────────────
    if (invoice.notes) {
      rowY += 12;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('Notes:', 40, rowY);
      doc.font('Helvetica').fillColor('#374151').text(invoice.notes, 40, rowY + 12, { width: 495, lineGap: 2 });
    }

    doc.fontSize(7).fillColor('#9ca3af')
      .text('This is a computer-generated invoice and does not require a signature.', 40, 780, { width: 515, align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// DELETE /api/billing/invoices/:id
router.delete('/invoices/:id', authenticate, (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!checkAccess(req.user, invoice.company_id, 'admin')) return res.status(403).json({ error: 'Admins only' });
    if (['issued', 'paid'].includes(invoice.status)) return res.status(400).json({ error: 'Cannot delete issued/paid invoice — cancel it first' });
    if (req.query.hard === 'true' && req.user.role === 'super_admin') {
      db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    } else {
      db.prepare('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
