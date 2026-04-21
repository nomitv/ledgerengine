import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { Plus, Search, Edit3, Trash2, X, Package, Barcode, ChevronDown, RefreshCw } from 'lucide-react';
import JsBarcode from 'jsbarcode';

// ─── Barcode Display Modal ────────────────────────────────────────────────────
function BarcodeModal({ product, onClose }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !product?.barcode) return;
    try {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128', width: 2, height: 80,
        displayValue: true, fontSize: 14, margin: 10,
        background: '#ffffff', lineColor: '#111827'
      });
    } catch (e) { console.error('Barcode render error:', e); }
  }, [product]);

  const handlePrint = () => {
    const svg = svgRef.current?.outerHTML || '';
    const win = window.open('', '_blank');
    win.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;padding:40px">
      <div><h2 style="font-family:sans-serif;margin-bottom:16px">${product.name}</h2>${svg}</div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{product.name}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-3 border border-surface-100 dark:border-surface-700">
          {product.barcode
            ? <svg ref={svgRef} />
            : <p className="text-surface-400 text-sm">No barcode assigned to this product.</p>}
        </div>
        {product.barcode && (
          <div className="mt-4 flex gap-2">
            <button onClick={handlePrint} className="btn-primary flex-1">Print Barcode</button>
            <button onClick={onClose} className="btn-secondary flex-1">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Form Modal ───────────────────────────────────────────────────────
const GST_SLABS = [0, 5, 12, 18, 28];
const EMPTY_FORM = { name: '', sku: '', barcode: '', description: '', unit_price: '', gst_rate: 18, hsn_code: '', stock_qty: 0, track_stock: true };

function ProductModal({ product, companyId, onSave, onClose }) {
  const [form, setForm] = useState(product ? {
    name: product.name, sku: product.sku || '', barcode: product.barcode || '',
    description: product.description || '', unit_price: product.unit_price,
    gst_rate: product.gst_rate, hsn_code: product.hsn_code || '',
    stock_qty: product.stock_qty, track_stock: !!product.track_stock
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, company_id: companyId, unit_price: parseFloat(form.unit_price), stock_qty: parseInt(form.stock_qty) };
      const saved = product ? await api.updateProduct(product.id, payload) : await api.createProduct(payload);
      onSave(saved);
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{product ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Product Name *</label>
            <input className="input" required value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Wireless Mouse" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">SKU</label>
              <input className="input" value={form.sku} onChange={e => f('sku', e.target.value)} placeholder="WM-001" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Barcode</label>
                <button type="button" onClick={() => f('barcode', Math.floor(100000000000 + Math.random() * 900000000000).toString())} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                  Generate
                </button>
              </div>
              <input className="input" value={form.barcode} onChange={e => f('barcode', e.target.value)} placeholder="Auto-generated if empty" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit Price (₹) *</label>
              <input className="input" type="number" min="0" step="0.01" required value={form.unit_price} onChange={e => f('unit_price', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">GST Rate</label>
              <select className="input" value={form.gst_rate} onChange={e => f('gst_rate', parseFloat(e.target.value))}>
                {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">HSN / SAC Code</label>
              <input className="input" value={form.hsn_code} onChange={e => f('hsn_code', e.target.value)} placeholder="8471" />
            </div>
            <div>
              <label className="label">Stock Quantity</label>
              <input className="input" type="number" min="0" value={form.stock_qty} onChange={e => f('stock_qty', e.target.value)} disabled={!form.track_stock} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Optional" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className={`relative w-10 h-5 rounded-full transition-colors ${form.track_stock ? 'bg-primary-600' : 'bg-surface-300 dark:bg-surface-700'}`}
              onClick={() => f('track_stock', !form.track_stock)}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.track_stock ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-surface-700 dark:text-surface-300">Track stock quantity</span>
          </label>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : product ? 'Update' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Inventory Page ──────────────────────────────────────────────────────
export default function Inventory() {
  const { selectedCompany, user } = useAuth();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [barcodeProduct, setBarcodeProduct] = useState(null);

  const canWrite = ['super_admin', 'admin', 'manager'].includes(user?.role);

  const fetchProducts = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const data = await api.getProducts({ company_id: selectedCompany.id, search, limit: 100 });
      setProducts(data.products);
      setTotal(data.total);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [selectedCompany, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSave = (saved) => {
    setProducts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      return idx >= 0 ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev];
    });
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    let hard = false;
    if (user?.role === 'super_admin') {
      hard = confirm('As a super_admin: Do you want to HARD delete this permanently?\n\nPress OK for Hard Delete, Cancel for Soft Delete.');
    }
    try { await api.deleteProduct(id, hard); setProducts(prev => prev.filter(p => p.id !== id)); }
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
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input type="text" placeholder="Search products, SKU, barcode…" value={search}
              onChange={e => setSearch(e.target.value)} className="input pl-9 w-72" />
          </div>
          <button onClick={fetchProducts} className="btn-ghost p-2" title="Refresh"><RefreshCw size={16} /></button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-surface-500">{total} products</span>
          {canWrite && (
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-800/50">
                <th className="text-left px-5 py-3 font-medium text-surface-500">Product</th>
                <th className="text-left px-5 py-3 font-medium text-surface-500">SKU / Barcode</th>
                <th className="text-right px-5 py-3 font-medium text-surface-500">Price</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500">GST</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500">HSN</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500">Stock</th>
                <th className="text-center px-5 py-3 font-medium text-surface-500 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-surface-400">
                  <div className="inline-flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> Loading…</div>
                </td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center">
                  <Package size={32} className="mx-auto text-surface-300 dark:text-surface-700 mb-3" />
                  <p className="text-surface-400">No products yet</p>
                  {canWrite && <button onClick={() => setShowModal(true)} className="btn-primary mt-4"><Plus size={16} /> Add your first product</button>}
                </td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="table-row">
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="text-xs text-surface-400 truncate max-w-xs mt-0.5">{p.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-xs text-surface-500 font-mono">
                    {p.sku && <p>SKU: {p.sku}</p>}
                    {p.barcode && <p>BC: {p.barcode}</p>}
                    {!p.sku && !p.barcode && <span className="text-surface-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">
                    ₹{Number(p.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      {p.gst_rate}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-xs font-mono text-surface-500">{p.hsn_code || '—'}</td>
                  <td className="px-5 py-3 text-center">
                    {p.track_stock
                      ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.stock_qty > 0 ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/10 text-red-600'}`}>
                          {p.stock_qty}
                        </span>
                      : <span className="text-surface-300 dark:text-surface-600 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {p.barcode && (
                        <button onClick={() => setBarcodeProduct(p)} className="btn-ghost p-1.5" title="View Barcode">
                          <Barcode size={14} />
                        </button>
                      )}
                      {canWrite && <>
                        <button onClick={() => { setEditing(p); setShowModal(true); }} className="btn-ghost p-1.5" title="Edit"><Edit3 size={14} /></button>
                        <button onClick={() => handleDelete(p.id)} className="btn-ghost p-1.5 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {barcodeProduct && <BarcodeModal product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />}
      {showModal && (
        <ProductModal
          product={editing}
          companyId={selectedCompany.id}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
          <ConfirmDeleteModal isOpen={!!deleteCandidate} onClose={() => setDeleteCandidate(null)} onConfirm={executeDelete} itemName="this product" />
</div>
  );
}
