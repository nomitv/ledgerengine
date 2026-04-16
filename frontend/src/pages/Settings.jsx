import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api';
import { UserPlus, Trash2, X, Shield, Moon, Sun, Monitor } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '', role: 'viewer' });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      api.getUsers().then(setUsers).catch(console.error);
    }
  }, [isAdmin]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.register(form);
      const updated = await api.getUsers();
      setUsers(updated);
      setShowModal(false);
      setForm({ username: '', email: '', password: '', display_name: '', role: 'viewer' });
    } catch (err) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await api.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Appearance */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { if (dark) toggleTheme(); }}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${!dark ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'}`}
          >
            <Sun size={24} className={!dark ? 'text-primary-600' : 'text-surface-400'} />
            <span className="text-xs font-medium">Light</span>
          </button>
          <button
            onClick={() => { if (!dark) toggleTheme(); }}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${dark ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'}`}
          >
            <Moon size={24} className={dark ? 'text-primary-400' : 'text-surface-400'} />
            <span className="text-xs font-medium">Dark</span>
          </button>
        </div>
      </section>

      {/* Profile */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-surface-500 dark:text-surface-400">Username</p>
            <p className="font-medium">{user?.username}</p>
          </div>
          <div>
            <p className="text-surface-500 dark:text-surface-400">Email</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <p className="text-surface-500 dark:text-surface-400">Display Name</p>
            <p className="font-medium">{user?.display_name}</p>
          </div>
          <div>
            <p className="text-surface-500 dark:text-surface-400">Role</p>
            <p className="font-medium capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </section>

      {/* User Management */}
      {isAdmin && (
        <section className="card">
          <div className="flex items-center justify-between p-6 border-b border-surface-100 dark:border-surface-800">
            <div>
              <h2 className="text-lg font-semibold">User Management</h2>
              <p className="text-sm text-surface-500 dark:text-surface-400">{users.length} registered users</p>
            </div>
            <button onClick={() => setShowModal(true)} className="btn-primary"><UserPlus size={16} /> Add User</button>
          </div>

          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                    <span className="text-primary-700 dark:text-primary-400 text-sm font-semibold">{(u.display_name || u.username)[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.display_name || u.username}</p>
                    <p className="text-xs text-surface-400">{u.email} • <span className="capitalize">{u.role?.replace('_', ' ')}</span></p>
                  </div>
                </div>
                {u.id !== user.id && user.role === 'super_admin' && (
                  <button onClick={() => handleDelete(u.id)} className="btn-ghost p-1.5 hover:text-red-500"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Create User</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Username</label>
                <input type="text" className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              <div>
                <label className="label">Display Name</label>
                <input type="text" className="input" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  {user?.role === 'super_admin' && <option value="admin">Admin</option>}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
