import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Plus, FileText, CheckCircle, Clock, Ban, DollarSign, Download, Eye, Trash2 } from 'lucide-react';

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     icon: Clock,        cls: 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400' },
  issued:    { label: 'Issued',    icon: FileText,     cls: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  paid:      { label: 'Paid',      icon: CheckCircle,  cls: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', icon: Ban,          cls: 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

export default function Billing() {
  const { selectedCompany, user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  const canWrite = ['super_admin', 'admin', 'manager'].includes(user?.role);

  const fetchInvoices = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = { company_id: selectedCompany.id, page, limit: 20 };
      if (filterStatus) params.status = filterStatus;
      const data = await api.getInvoices(params);
      setInvoices(data.invoices);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [selectedCompany, page, filterStatus]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleDownloadPdf = async (id, invoiceNumber) => {
    try {
      const res = await api.downloadInvoicePdf(id);
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${invoiceNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
  };

  const handleIssue = async (id) => {
    if (!confirm('Issue this invoice? This will create an income transaction and cannot be undone.')) return;
    try {
      const updated = await api.issueInvoice(id);
      setInvoices(prev => prev.map(inv => inv.id === id ? updated : inv));
    } catch (err) { alert(err.message); }
  };

  const handleMarkPaid = async (id) => {
    try {
      const updated = await api.updateInvoiceStatus(id, 'paid');
      setInvoices(prev => prev.map(inv => inv.id === id ? updated : inv));
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this invoice?')) return;
    let hard = false;
    if (user?.role === 'super_admin') {
      hard = confirm('As a super_admin: Do you want to HARD delete this permanently?\n\nPress OK for Hard Delete, Cancel for Soft Delete.');
    }
    try { await api.deleteInvoice(id, hard); setInvoices(prev => prev.filter(inv => inv.id !== id)); }
    catch (err) { alert(err.message); }
  };

  if (!selectedCompany) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
      <p className="text-surface-500">Create or select a company first.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="input w-auto">
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-surface-500">{total} invoices</span>
          {canWrite && (
            <button onClick={() => navigate('/billing/new')} className="btn-primary">
              <Plus size={16} /> Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: total, bg: 'bg-surface-100 dark:bg-surface-800' },
          { label: 'Issued', value: invoices.filter(i => i.status === 'issued').length, bg: 'bg-blue-50 dark:bg-blue-500/5' },
          { label: 'Paid', value: invoices.filter(i => i.status === 'paid').length, bg: 'bg-emerald-50 dark:bg-emerald-500/5' },
          { label: 'Draft', value: invoices.filter(i => i.status === 'draft').length, bg: 'bg-amber-50 dark:bg-amber-500/5' },
        ].map(card => (
          <div key={card.label} className={`card p-4 ${card.bg}`}>
            <p className="text-xs text-surface-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/50">
                <th className="text-left px-5 py-3 font-medium text-surface-500">Invoice #</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500">Customer</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500">Date</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500">Status</th>
                <th className="text-right px-5 py-3 font-medium text-surface-500">Amount</th>
                <th className="text-right px-5 py-3 font-medium text-surface-500">Tax</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500 w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-surface-400">
                  <div className="inline-flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> Loading…</div>
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center">
                  <FileText size={32} className="mx-auto text-surface-300 dark:text-surface-700 mb-3" />
                  <p className="text-surface-400">No invoices yet</p>
                  {canWrite && <button onClick={() => navigate('/billing/new')} className="btn-primary mt-4"><Plus size={16} /> Create your first invoice</button>}
                </td></tr>
              ) : invoices.map(inv => {
                const tax = (inv.total_cgst || 0) + (inv.total_sgst || 0) + (inv.total_igst || 0);
                return (
                  <tr key={inv.id} className="table-row">
                    <td className="px-5 py-3">
                      <p className="font-mono font-medium text-xs">{inv.invoice_number}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{inv.customer_name || '—'}</p>
                      {inv.customer_gstin && <p className="text-xs text-surface-400 font-mono">{inv.customer_gstin}</p>}
                    </td>
                    <td className="px-5 py-3 text-surface-500 text-xs whitespace-nowrap">
                      {inv.issued_at || inv.created_at?.split('T')[0]}
                    </td>
                    <td className="px-5 py-3 text-center"><StatusBadge status={inv.status} /></td>
                    <td className="px-5 py-3 text-right font-semibold">
                      ₹{Number(inv.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right text-surface-500 text-xs">
                      ₹{Number(tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleDownloadPdf(inv.id, inv.invoice_number)} className="btn-ghost p-1.5" title="Download PDF">
                          <Download size={14} />
                        </button>
                        {canWrite && inv.status === 'draft' && <>
                          <button onClick={() => navigate(`/billing/${inv.id}/edit`)} className="btn-ghost p-1.5" title="Edit"><Eye size={14} /></button>
                          <button onClick={() => handleIssue(inv.id)} className="btn-ghost p-1.5 hover:text-blue-500" title="Issue Invoice">
                            <CheckCircle size={14} />
                          </button>
                          <button onClick={() => handleDelete(inv.id)} className="btn-ghost p-1.5 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                        </>}
                        {canWrite && inv.status === 'issued' && (
                          <button onClick={() => handleMarkPaid(inv.id)} className="btn-ghost p-1.5 hover:text-emerald-500" title="Mark Paid">
                            <DollarSign size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-surface-100 dark:border-surface-800">
            <p className="text-xs text-surface-500">{total} total invoices</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30">Prev</button>
              <span className="text-sm text-surface-600 dark:text-surface-400">Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
