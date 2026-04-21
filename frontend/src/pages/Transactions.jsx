import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import {
  Plus, Search, Filter, Trash2, Edit3, Paperclip, X, Upload,
  ChevronLeft, ChevronRight, Tag, Download, FileText, Eye,
  FileDown, ChevronDown
} from 'lucide-react';

// ─── Bill Preview Modal ────────────────────────────────────────────────────────
function PreviewModal({ attachment, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const isImage = attachment?.mime_type?.startsWith('image/');
  const isPdf   = attachment?.mime_type === 'application/pdf';

  useEffect(() => {
    if (!attachment) return;
    const token = localStorage.getItem('le_token');
    fetch(`/api/transactions/attachments/${attachment.stored_name}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load file');
        return r.blob();
      })
      .then(blob => setUrl(URL.createObjectURL(blob)))
      .catch(e => setError(e.message));
    return () => url && URL.revokeObjectURL(url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment]);

  if (!attachment) return null;

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.original_name;
    a.click();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-3xl w-full" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold truncate max-w-xs">{attachment.original_name}</h2>
            <p className="text-xs text-surface-400 mt-0.5">{(attachment.size / 1024).toFixed(1)} KB</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} disabled={!url} className="btn-secondary text-xs py-1.5 px-3">
              <FileDown size={14} /> Download
            </button>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
          </div>
        </div>

        <div className="bg-surface-100 dark:bg-surface-800 rounded-xl overflow-auto flex items-center justify-center"
          style={{ minHeight: 320, maxHeight: 'calc(90vh - 120px)' }}>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {!url && !error && (
            <div className="inline-flex items-center gap-2 text-surface-400">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              Loading preview…
            </div>
          )}
          {url && isImage && <img src={url} alt={attachment.original_name} className="max-w-full max-h-full object-contain rounded-lg" />}
          {url && isPdf && (
            <iframe
              src={url}
              title={attachment.original_name}
              className="w-full rounded-lg"
              style={{ height: 'calc(90vh - 140px)' }}
            />
          )}
          {url && !isImage && !isPdf && (
            <div className="text-center p-8">
              <FileText size={48} className="mx-auto text-surface-400 mb-3" />
              <p className="text-surface-500 text-sm">Preview not available for this file type.</p>
              <button onClick={handleDownload} className="btn-primary mt-4">
                <FileDown size={16} /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Download Dropdown ─────────────────────────────────────────────────────────
function DownloadButton({ companyId, filters }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const download = (format) => {
    setOpen(false);
    const token = localStorage.getItem('le_token');
    const params = new URLSearchParams({ company_id: companyId, format });
    if (filters.from)     params.set('from', filters.from);
    if (filters.to)       params.set('to', filters.to);
    if (filters.type)     params.set('type', filters.type);

    // Stream download via a temporary link
    fetch(`/api/reports/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().slice(0,10)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(e => alert('Download failed: ' + e.message));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="btn-secondary">
        <Download size={16} /> Export <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg z-20 py-1 animate-slide-up">
          <button onClick={() => download('csv')} className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800">
            <FileText size={14} className="text-surface-400" /> Download CSV
          </button>
          <button onClick={() => download('pdf')} className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800">
            <FileDown size={14} className="text-surface-400" /> Download PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Transactions() {
  const { selectedCompany, user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteCandidate, setDeleteCandidate] = useState(null);


  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ type: 'expense', amount: '', description: '', category_id: '', date: new Date().toISOString().split('T')[0], tags: [] });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Preview modal
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Tag/Category creation
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');

  const canWrite = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'manager';

  const fetchTransactions = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = { company_id: selectedCompany.id, page, limit: 20 };
      if (filterType)     params.type = filterType;
      if (filterCategory) params.category_id = filterCategory;
      if (filterTag)      params.tag_id = filterTag;
      if (filterFrom)     params.from = filterFrom;
      if (filterTo)       params.to = filterTo;
      if (search)         params.search = search;
      const data = await api.getTransactions(params);
      setTransactions(data.transactions);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [selectedCompany, page, filterType, filterCategory, filterTag, filterFrom, filterTo, search]);

  const fetchMeta = useCallback(async () => {
    if (!selectedCompany) return;
    const [cats, tgs] = await Promise.all([
      api.getCategories(selectedCompany.id),
      api.getTags(selectedCompany.id)
    ]);
    setCategories(cats);
    setTags(tgs);
  }, [selectedCompany]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'expense', amount: '', description: '', category_id: '', date: new Date().toISOString().split('T')[0], tags: [] });
    setFiles([]);
    setShowModal(true);
  };

  const openEdit = (txn) => {
    setEditing(txn);
    setForm({
      type: txn.type,
      amount: String(txn.amount),
      description: txn.description || '',
      category_id: txn.category_id ? String(txn.category_id) : '',
      date: txn.date,
      tags: txn.tags?.map(t => t.id) || []
    });
    setFiles([]);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.updateTransaction(editing.id, {
          type: form.type, amount: parseFloat(form.amount),
          description: form.description,
          category_id: form.category_id ? parseInt(form.category_id) : null,
          date: form.date, tags: form.tags
        });
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach(f => fd.append('files', f));
          await api.uploadAttachment(editing.id, fd);
        }
      } else {
        const fd = new FormData();
        fd.append('company_id', selectedCompany.id);
        fd.append('type', form.type);
        fd.append('amount', form.amount);
        fd.append('description', form.description);
        if (form.category_id) fd.append('category_id', form.category_id);
        fd.append('date', form.date);
        fd.append('tags', JSON.stringify(form.tags));
        files.forEach(f => fd.append('files', f));
        await api.createTransaction(fd);
      }
      setShowModal(false);
      fetchTransactions();
    } catch (err) { alert(err.message); }
    setSubmitting(false);
  };

  const handleDelete = (id) => setDeleteCandidate(id);

  const executeDelete = async (hard) => {
    if (!deleteCandidate) return;
    try { await api.deleteTransaction(deleteCandidate, hard); fetchTransactions(); }
    catch (err) { alert(err.message); }
    finally { setDeleteCandidate(null); }
  };

  const toggleTag = (tagId) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId) ? prev.tags.filter(t => t !== tagId) : [...prev.tags, tagId]
    }));
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await api.createTag({ name: newTagName, color: newTagColor, company_id: selectedCompany.id });
      setTags(prev => [...prev, tag]);
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag.id] }));
      setNewTagName(''); setShowNewTag(false);
    } catch (err) { alert(err.message); }
  };

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.createCategory({ name: newCatName, type: newCatType, company_id: selectedCompany.id });
      setCategories(prev => [...prev, cat]);
      setForm(prev => ({ ...prev, category_id: String(cat.id) }));
      setNewCatName(''); setShowNewCat(false);
    } catch (err) { alert(err.message); }
  };

  const filteredCategories = categories.filter(c => c.type === form.type);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
        <p className="text-surface-500">Create or select a company first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="input pl-9 w-64"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary ${showFilters ? 'ring-2 ring-primary-500/30' : ''}`}>
            <Filter size={16} /> Filters
          </button>
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton
            companyId={selectedCompany.id}
            filters={{ from: filterFrom, to: filterTo, type: filterType }}
          />
          {canWrite && (
            <button onClick={openCreate} className="btn-primary">
              <Plus size={16} /> Add Transaction
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-4 flex flex-wrap gap-3 animate-slide-up">
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="input w-auto">
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} className="input w-auto">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </select>
          <select value={filterTag} onChange={e => { setFilterTag(e.target.value); setPage(1); }} className="input w-auto">
            <option value="">All Tags</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} className="input w-auto" />
          <span className="self-center text-surface-400">to</span>
          <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }} className="input w-auto" />
          <button onClick={() => { setFilterType(''); setFilterCategory(''); setFilterTag(''); setFilterFrom(''); setFilterTo(''); setSearch(''); setPage(1); }} className="btn-ghost text-xs">Clear All</button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/50">
                <th className="text-left px-5 py-3 font-medium text-surface-500 dark:text-surface-400">Date</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500 dark:text-surface-400">Description</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500 dark:text-surface-400">Category</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500 dark:text-surface-400">Tags</th>
                <th className="text-right px-5 py-3 font-medium text-surface-500 dark:text-surface-400">Amount</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500 dark:text-surface-400 w-24">Files</th>
                {canWrite && <th className="text-center px-5 py-3 font-medium text-surface-500 dark:text-surface-400 w-24">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 7 : 6} className="px-5 py-12 text-center text-surface-400">
                  <div className="inline-flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> Loading...</div>
                </td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={canWrite ? 7 : 6} className="px-5 py-12 text-center text-surface-400">No transactions found</td></tr>
              ) : transactions.map(txn => (
                <tr key={txn.id} className="table-row">
                  <td className="px-5 py-3 whitespace-nowrap text-surface-500 dark:text-surface-400 text-xs">{txn.date}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium truncate max-w-xs">{txn.description || '—'}</p>
                    <p className="text-xs text-surface-400 capitalize">{txn.user_name}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${txn.type === 'income' ? 'badge-income' : 'badge-expense'}`}>
                      {txn.category_name || 'None'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {txn.tags?.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: t.color + '20', color: t.color }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold whitespace-nowrap ${txn.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {txn.type === 'income' ? '+' : '-'}₹{parseFloat(txn.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {txn.attachments?.length > 0 && (
                      <div className="inline-flex items-center gap-1">
                        {txn.attachments.map(att => (
                          <button
                            key={att.id}
                            onClick={() => setPreviewAttachment(att)}
                            className="inline-flex items-center gap-1 text-primary-500 hover:text-primary-600 transition-colors"
                            title={att.original_name}
                          >
                            <Eye size={14} />
                          </button>
                        ))}
                        <span className="text-xs text-surface-400 ml-0.5">{txn.attachments.length}</span>
                      </div>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(txn)} className="btn-ghost p-1.5" title="Edit"><Edit3 size={14} /></button>
                        <button onClick={() => handleDelete(txn.id)} className="btn-ghost p-1.5 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-surface-100 dark:border-surface-800">
            <p className="text-xs text-surface-500">{total} total transactions</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="text-sm text-surface-600 dark:text-surface-400">Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost p-1.5 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Bill Preview Modal */}
      {previewAttachment && (
        <PreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Transaction' : 'New Transaction'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'expense', category_id: '' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/30' : 'bg-surface-50 dark:bg-surface-800 text-surface-500'}`}>
                  Expense
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, type: 'income', category_id: '' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-surface-50 dark:bg-surface-800 text-surface-500'}`}>
                  Income
                </button>
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount (₹)</label>
                  <input type="number" step="0.01" min="0" className="input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description</label>
                <input type="text" className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's this for?" />
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Category</label>
                  <button type="button" onClick={() => { setShowNewCat(!showNewCat); setNewCatType(form.type); }} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">+ New</button>
                </div>
                {showNewCat && (
                  <div className="flex gap-2 mb-2 animate-fade-in">
                    <input type="text" className="input flex-1" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" />
                    <button type="button" onClick={createCategory} className="btn-primary text-xs px-3">Add</button>
                  </div>
                )}
                <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Tags</label>
                  <button type="button" onClick={() => setShowNewTag(!showNewTag)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">+ New</button>
                </div>
                {showNewTag && (
                  <div className="flex gap-2 mb-2 animate-fade-in">
                    <input type="text" className="input flex-1" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Tag name" />
                    <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-surface-300 dark:border-surface-700" />
                    <button type="button" onClick={createTag} className="btn-primary text-xs px-3">Add</button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {tags.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${form.tags.includes(t.id) ? 'ring-2 ring-offset-1 dark:ring-offset-surface-900' : 'opacity-60 hover:opacity-100'}`}
                      style={{ borderColor: t.color, color: t.color, ...(form.tags.includes(t.id) ? { backgroundColor: t.color + '20' } : {}) }}>
                      <Tag size={10} /> {t.name}
                    </button>
                  ))}
                  {tags.length === 0 && <p className="text-xs text-surface-400">No tags yet</p>}
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="label">Attachments (Bills, Receipts)</label>
                <label className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-surface-300 dark:border-surface-700 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-500/5 transition-colors">
                  <Upload size={18} className="text-surface-400" />
                  <span className="text-sm text-surface-500">Click to upload files (images or PDF)</span>
                  <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                </label>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-surface-50 dark:bg-surface-800 rounded-lg text-xs">
                        <span className="truncate">{f.name}</span>
                        <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-surface-400 hover:text-red-500"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {editing?.attachments?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-surface-400 mb-1">Existing attachments (click to preview):</p>
                    {editing.attachments.map(a => (
                      <button key={a.id} type="button" onClick={() => setPreviewAttachment(a)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-surface-50 dark:bg-surface-800 rounded-lg text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors w-full text-left">
                        <Eye size={12} /> {a.original_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
          <ConfirmDeleteModal isOpen={!!deleteCandidate} onClose={() => setDeleteCandidate(null)} onConfirm={executeDelete} itemName="this transaction" />
</div>
  );
}
