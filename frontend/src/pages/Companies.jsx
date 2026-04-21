import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { Plus, Trash2, Edit3, X, Users, Building2 } from 'lucide-react';

export default function Companies() {
  const { user, companies, refreshCompanies, selectCompany, selectedCompany } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', currency: 'INR', gstin: '', address: '', phone: '', email: '', state_code: '' });
  const [submitting, setSubmitting] = useState(false);

  // Users management
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeCompany, setActiveCompany] = useState(null);
  const [addUserId, setAddUserId] = useState('');
  const [addUserRole, setAddUserRole] = useState('viewer');

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', currency: 'INR' });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, description: c.description || '', currency: c.currency || 'INR',
      gstin: c.gstin || '', address: c.address || '', phone: c.phone || '',
      email: c.email || '', state_code: c.state_code || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.updateCompany(editing.id, form);
      } else {
        const newCompany = await api.createCompany(form);
        selectCompany(newCompany);
      }
      await refreshCompanies();
      setShowModal(false);
    } catch (err) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this company and all its data? This cannot be undone.')) return;
    let hard = false;
    if (user?.role === 'super_admin') {
      hard = confirm('As a super_admin: Do you want to HARD delete this permanently?\n\nPress OK for Hard Delete, Cancel for Soft Delete.');
    }
    try {
      await api.deleteCompany(id, hard);
      await refreshCompanies();
    } catch (err) {
      alert(err.message);
    }
  };

  const openUsers = async (company) => {
    setActiveCompany(company);
    try {
      const [users, all] = await Promise.all([
        api.getCompanyUsers(company.id),
        isAdmin ? api.getUsers() : Promise.resolve([])
      ]);
      setCompanyUsers(users);
      setAllUsers(all);
      setShowUsersModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const addUser = async () => {
    if (!addUserId) return;
    try {
      await api.addCompanyUser(activeCompany.id, { user_id: parseInt(addUserId), role: addUserRole });
      const users = await api.getCompanyUsers(activeCompany.id);
      setCompanyUsers(users);
      setAddUserId('');
    } catch (err) {
      alert(err.message);
    }
  };

  const removeUser = async (userId) => {
    if (!confirm('Remove this user from the company?')) return;
    try {
      await api.removeCompanyUser(activeCompany.id, userId);
      setCompanyUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Companies</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">Manage your organizations</p>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="btn-primary"><Plus size={16} /> New Company</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map(c => (
          <div key={c.id} className={`card p-5 hover:shadow-md transition-all cursor-pointer ${selectedCompany?.id === c.id ? 'ring-2 ring-primary-500' : ''}`} onClick={() => selectCompany(c)}>
            <div className="flex items-start justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10">
                <Building2 size={20} className="text-primary-600 dark:text-primary-400" />
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openUsers(c)} className="btn-ghost p-1.5" title="Users"><Users size={14} /></button>
                  <button onClick={() => openEdit(c)} className="btn-ghost p-1.5" title="Edit"><Edit3 size={14} /></button>
                  {user?.role === 'super_admin' && (
                    <button onClick={() => handleDelete(c.id)} className="btn-ghost p-1.5 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                  )}
                </div>
              )}
            </div>
            <h3 className="font-semibold mb-1">{c.name}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400 line-clamp-2">{c.description || 'No description'}</p>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800">
              <span className="text-xs text-surface-400">Currency: {c.currency || 'INR'}</span>
              {c.user_role && <span className="text-xs badge bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 capitalize">{c.user_role}</span>}
            </div>
          </div>
        ))}

        {companies.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Building2 size={48} className="mx-auto text-surface-300 dark:text-surface-600 mb-3" />
            <p className="text-surface-500 dark:text-surface-400">No companies yet. Create one to get started.</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Company' : 'New Company'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Company Name</label>
                <input type="text" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              {/* Billing / GST Profile */}
              <div className="pt-2 border-t border-surface-100 dark:border-surface-800">
                <p className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3 flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">GST Billing Profile</span>
                  <span className="text-xs font-normal text-surface-400">Used on invoices</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">GSTIN</label>
                    <input className="input font-mono" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} />
                  </div>
                  <div>
                    <label className="label">State Code</label>
                    <input className="input" value={form.state_code} onChange={e => setForm(f => ({ ...f, state_code: e.target.value }))} placeholder="27 (Maharashtra)" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="billing@company.com" />
                  </div>
                  <div>
                    <label className="label">Address</label>
                    <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full registered address" />
                  </div>
                </div>
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

      {/* Users Modal */}
      {showUsersModal && activeCompany && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUsersModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Users — {activeCompany.name}</h2>
              <button onClick={() => setShowUsersModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>

            {/* Add user */}
            <div className="flex gap-2 mb-4">
              <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="input flex-1">
                <option value="">Select user</option>
                {allUsers.filter(u => !companyUsers.find(cu => cu.id === u.id)).map(u => (
                  <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>
                ))}
              </select>
              <select value={addUserRole} onChange={e => setAddUserRole(e.target.value)} className="input w-28">
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={addUser} className="btn-primary text-xs">Add</button>
            </div>

            <div className="space-y-2">
              {companyUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-50 dark:bg-surface-800">
                  <div>
                    <p className="text-sm font-medium">{u.display_name}</p>
                    <p className="text-xs text-surface-400">{u.email} • <span className="capitalize">{u.company_role}</span></p>
                  </div>
                  <button onClick={() => removeUser(u.id)} className="btn-ghost p-1.5 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
          <ConfirmDeleteModal isOpen={!!deleteCandidate} onClose={() => setDeleteCandidate(null)} onConfirm={executeDelete} itemName="this company" />
</div>
  );
}
