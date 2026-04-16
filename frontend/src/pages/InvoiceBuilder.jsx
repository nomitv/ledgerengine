import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import {
  Plus, Trash2, Save, Send, ArrowLeft, Scan, X,
  ChevronDown, Search, AlertCircle
} from 'lucide-react';

const GST_SLABS = [0, 5, 12, 18, 28];

// ─── Barcode Scanner Modal ────────────────────────────────────────────────────
function ScannerModal({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const detectedRef = useRef(false);

  useEffect(() => {
    let Quagga;
    let mounted = true;

    async function startCamera() {
      try {
        // Dynamic import to avoid SSR issues
        const mod = await import('@ericblade/quagga2');
        Quagga = mod.default;

        if (!mounted) return;

        Quagga.init({
          inputStream: {
            type: 'LiveStream',
            target: videoRef.current,
            constraints: { facingMode: 'environment', width: 640, height: 480 }
          },
          decoder: { readers: ['code_128_reader', 'ean_reader', 'ean_8_reader', 'upc_reader', 'code_39_reader'] },
          locate: true
        }, (err) => {
          if (err) { setError('Camera error: ' + err.message); return; }
          Quagga.start();
          setScanning(true);
        });

        Quagga.onDetected((result) => {
          const code = result?.codeResult?.code;
          if (code && !detectedRef.current) {
            detectedRef.current = true;
            Quagga.stop();
            onScan(code);
          }
        });
      } catch (e) {
        setError('Scanner not available: ' + e.message);
      }
    }

    startCamera();
    return () => {
      mounted = false;
      if (Quagga) { try { Quagga.stop(); } catch (_) {} }
    };
  }, [onScan]);

  const handleManual = (e) => {
    e.preventDefault();
    if (manual.trim()) onScan(manual.trim());
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Scan Barcode</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {error ? (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 rounded-xl mb-4">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : (
          <div className="bg-black rounded-xl overflow-hidden mb-4 relative" style={{ height: 280 }}>
            <div ref={videoRef} className="w-full h-full" />
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-primary-400 w-56 h-36 rounded-lg opacity-60" />
              </div>
            )}
            {!scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting camera…</div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-surface-400 text-center mb-3">Or enter barcode manually</p>
        <form onSubmit={handleManual} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Enter barcode / SKU"
            value={manual}
            onChange={e => setManual(e.target.value)}
            autoFocus={!!error}
          />
          <button type="submit" className="btn-primary px-4">Use</button>
        </form>
      </div>
    </div>
  );
}

// ─── Product Search Dropdown ──────────────────────────────────────────────────
function ProductSearch({ companyId, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await api.getProducts({ company_id: companyId, search: query, limit: 8 });
        setResults(data.products);
        setOpen(true);
      } catch (_) {}
    }, 200);
    return () => clearTimeout(t);
  }, [query, companyId]);

  return (
    <div className="relative flex-1" ref={ref}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          className="input pl-8 text-sm"
          placeholder="Search products…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg z-20 py-1 max-h-52 overflow-y-auto animate-slide-up">
          {results.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false); }}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 text-left gap-4">
              <div>
                <p className="font-medium">{p.name}</p>
                {p.sku && <p className="text-xs text-surface-400 font-mono">{p.sku}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">₹{Number(p.unit_price).toLocaleString('en-IN')}</p>
                <p className="text-xs text-surface-400">GST {p.gst_rate}%</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Line Item Row ────────────────────────────────────────────────────────────
function LineItem({ item, index, onChange, onRemove, intraState }) {
  const taxBase = item.unit_price * item.quantity;
  const taxAmt  = taxBase * (item.gst_rate / 100);
  const total   = taxBase + taxAmt;

  return (
    <tr className="border-b border-surface-100 dark:border-surface-800">
      <td className="px-3 py-2">
        <input className="input input-sm w-full" value={item.name} onChange={e => onChange(index, 'name', e.target.value)} placeholder="Item name" required />
        <input className="input input-sm w-full mt-1 font-mono text-xs" value={item.sku || ''} onChange={e => onChange(index, 'sku', e.target.value)} placeholder="SKU (optional)" />
      </td>
      <td className="px-3 py-2 w-24">
        <input className="input input-sm w-full font-mono text-xs" value={item.hsn_code || ''} onChange={e => onChange(index, 'hsn_code', e.target.value)} placeholder="HSN" />
      </td>
      <td className="px-3 py-2 w-20">
        <input className="input input-sm w-full text-right" type="number" min="1" value={item.quantity} onChange={e => onChange(index, 'quantity', parseInt(e.target.value) || 1)} />
      </td>
      <td className="px-3 py-2 w-28">
        <input className="input input-sm w-full text-right" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => onChange(index, 'unit_price', parseFloat(e.target.value) || 0)} />
      </td>
      <td className="px-3 py-2 w-24">
        <select className="input input-sm w-full" value={item.gst_rate} onChange={e => onChange(index, 'gst_rate', parseFloat(e.target.value))}>
          {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
        </select>
      </td>
      <td className="px-3 py-2 w-28 text-right text-sm">
        <p className="text-surface-400 text-xs">
          {intraState ? `CGST+SGST: ₹${(taxAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `IGST: ₹${taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
        </p>
        <p className="font-semibold">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
      </td>
      <td className="px-3 py-2 w-10 text-center">
        <button type="button" onClick={() => onRemove(index)} className="btn-ghost p-1 hover:text-red-500"><Trash2 size={14} /></button>
      </td>
    </tr>
  );
}

// ─── Main Invoice Builder ─────────────────────────────────────────────────────
const EMPTY_ITEM = { name: '', sku: '', hsn_code: '', unit_price: 0, quantity: 1, gst_rate: 18, product_id: null };
const EMPTY_CUSTOMER = { customer_name: '', customer_gstin: '', customer_address: '', customer_phone: '', customer_email: '' };

export default function InvoiceBuilder() {
  const { selectedCompany } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [customer, setCustomer] = useState({ ...EMPTY_CUSTOMER });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [intraState, setIntraState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Load existing invoice for edit
  useEffect(() => {
    if (!isEdit) return;
    api.getInvoice(id).then(inv => {
      setCustomer({
        customer_name: inv.customer_name || '',
        customer_gstin: inv.customer_gstin || '',
        customer_address: inv.customer_address || '',
        customer_phone: inv.customer_phone || '',
        customer_email: inv.customer_email || '',
      });
      setNotes(inv.notes || '');
      setDiscount(inv.discount_amount || 0);
      setItems(inv.items?.map(i => ({
        name: i.name, sku: i.sku || '', hsn_code: i.hsn_code || '',
        unit_price: i.unit_price, quantity: i.quantity,
        gst_rate: i.gst_rate, product_id: i.product_id
      })) || [{ ...EMPTY_ITEM }]);
    }).catch(e => setLoadError(e.message));
  }, [id, isEdit]);

  const cx = (k, v) => setCustomer(p => ({ ...p, [k]: v }));

  const addProductFromBarcode = useCallback(async (code) => {
    setShowScanner(false);
    if (!selectedCompany) return;
    try {
      const p = await api.getProductByBarcode(code, selectedCompany.id);
      addProductToItems(p);
    } catch (_) {
      // Product not found — add manual row pre-filled with barcode
      setItems(prev => [...prev, { ...EMPTY_ITEM, sku: code, name: '' }]);
    }
  }, [selectedCompany]);

  const addProductToItems = (p) => {
    setItems(prev => [...prev, {
      name: p.name, sku: p.sku || '', hsn_code: p.hsn_code || '',
      unit_price: p.unit_price, quantity: 1,
      gst_rate: p.gst_rate, product_id: p.id
    }]);
  };

  const addBlankItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);

  const updateItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  // Totals
  const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const totalTax = items.reduce((s, it) => s + it.unit_price * it.quantity * it.gst_rate / 100, 0);
  const grandTotal = subtotal + totalTax - parseFloat(discount || 0);

  const buildPayload = () => ({
    company_id: selectedCompany.id,
    ...customer,
    items,
    notes,
    discount_amount: parseFloat(discount || 0),
    intra_state: intraState
  });

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!selectedCompany) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateInvoice(id, buildPayload());
      } else {
        await api.createInvoice(buildPayload());
      }
      navigate('/billing');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const handleIssue = async () => {
    if (!confirm('Save and issue this invoice? An income transaction will be created automatically.')) return;
    setIssuing(true);
    try {
      let invoiceId = id;
      if (!isEdit) {
        const created = await api.createInvoice(buildPayload());
        invoiceId = created.id;
      } else {
        await api.updateInvoice(id, buildPayload());
      }
      await api.issueInvoice(invoiceId);
      navigate('/billing');
    } catch (err) { alert(err.message); }
    setIssuing(false);
  };

  if (!selectedCompany) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
    </div>
  );

  if (loadError) return (
    <div className="py-16 text-center"><p className="text-red-500">{loadError}</p></div>
  );

  return (
    <div className="space-y-5 pb-12">
      {/* Topbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/billing')} className="btn-ghost p-2"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-lg font-semibold">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
            <p className="text-xs text-surface-400">{selectedCompany.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowScanner(true)} className="btn-secondary">
            <Scan size={16} /> Scan Barcode
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-secondary">
            {saving ? <div className="w-4 h-4 border-2 border-surface-300 border-t-surface-700 dark:border-t-white rounded-full animate-spin" /> : <><Save size={16} /> Save Draft</>}
          </button>
          <button onClick={handleIssue} disabled={issuing || saving} className="btn-primary">
            {issuing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={16} /> Issue Invoice</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Customer + Items */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer Details */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4 text-surface-700 dark:text-surface-300 uppercase tracking-wide">Customer Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Customer Name</label>
                <input className="input" value={customer.customer_name} onChange={e => cx('customer_name', e.target.value)} placeholder="Business or Individual name" />
              </div>
              <div>
                <label className="label">GSTIN</label>
                <input className="input font-mono" value={customer.customer_gstin} onChange={e => cx('customer_gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={customer.customer_phone} onChange={e => cx('customer_phone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={customer.customer_email} onChange={e => cx('customer_email', e.target.value)} placeholder="customer@email.com" />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" value={customer.customer_address} onChange={e => cx('customer_address', e.target.value)} placeholder="Full address" />
              </div>
            </div>
          </div>

          {/* GST Type toggle */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">GST Type</p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {intraState ? 'Intra-state: CGST + SGST applies' : 'Inter-state: IGST applies'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIntraState(true)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${intraState ? 'bg-primary-600 text-white' : 'btn-secondary'}`}>
                  Intra-state
                </button>
                <button type="button" onClick={() => setIntraState(false)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!intraState ? 'bg-primary-600 text-white' : 'btn-secondary'}`}>
                  Inter-state
                </button>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
              <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 uppercase tracking-wide">Line Items</h2>
              <div className="flex items-center gap-2">
                {selectedCompany && (
                  <ProductSearch companyId={selectedCompany.id} onSelect={addProductToItems} />
                )}
                <button type="button" onClick={addBlankItem} className="btn-ghost p-2 shrink-0" title="Add blank row">
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
                    <th className="text-left px-3 py-2 text-xs font-medium text-surface-500">Item / SKU</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-surface-500">HSN</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-surface-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-surface-500">Unit Price (₹)</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-surface-500">GST%</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-surface-500">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <LineItem key={i} item={item} index={i} onChange={updateItem} onRemove={removeItem} intraState={intraState} />
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-surface-400 text-sm">
                      No items. Search a product or scan a barcode to add.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-5">
            <label className="label">Notes / Terms</label>
            <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, bank details, thank you message…" />
          </div>
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          <div className="card p-5 sticky top-6">
            <h2 className="text-sm font-semibold mb-4 text-surface-700 dark:text-surface-300 uppercase tracking-wide">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              {intraState ? <>
                <div className="flex justify-between text-surface-400">
                  <span>CGST</span>
                  <span>₹{(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-surface-400">
                  <span>SGST</span>
                  <span>₹{(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </> : (
                <div className="flex justify-between text-surface-400">
                  <span>IGST</span>
                  <span>₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-surface-500">Discount</span>
                <input
                  type="number" min="0" step="0.01"
                  value={discount} onChange={e => setDiscount(e.target.value)}
                  className="input w-28 text-right text-sm py-1"
                  placeholder="0.00"
                />
              </div>
              <div className="border-t border-surface-200 dark:border-surface-700 pt-2 mt-2 flex justify-between font-semibold text-base">
                <span>Grand Total</span>
                <span className="text-primary-600 dark:text-primary-400">
                  ₹{Math.max(0, grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Item breakdown */}
            {items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-surface-100 dark:border-surface-800 space-y-1.5">
                <p className="text-xs font-medium text-surface-500 mb-2">GST Breakdown</p>
                {[...new Set(items.map(i => i.gst_rate))].sort((a,b) => a-b).map(rate => {
                  const slab = items.filter(i => i.gst_rate === rate);
                  const taxable = slab.reduce((s, i) => s + i.unit_price * i.quantity, 0);
                  const tax = taxable * rate / 100;
                  return (
                    <div key={rate} className="flex justify-between text-xs text-surface-500">
                      <span>{rate}% on ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span>₹{tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 space-y-2">
              <button onClick={handleIssue} disabled={issuing || items.length === 0} className="btn-primary w-full">
                {issuing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={16} /> Issue Invoice</>}
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-secondary w-full">
                {saving ? <div className="w-4 h-4 border-2 border-surface-300 border-t-surface-700 dark:border-t-white rounded-full animate-spin" /> : <><Save size={16} /> Save as Draft</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showScanner && <ScannerModal onScan={addProductFromBarcode} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
