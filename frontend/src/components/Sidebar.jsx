import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ArrowLeftRight, Building2, Settings,
  LogOut, ChevronDown, Package, FileText
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/billing', icon: FileText, label: 'Billing' },
  { to: '/companies', icon: Building2, label: 'Companies' },
  { to: '/settings', icon: Settings, label: 'Settings' }
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, companies, selectedCompany, selectCompany, logout } = useAuth();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);

  return (
    <aside className={`fixed left-0 top-0 h-full z-30 flex flex-col bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 transition-all duration-300 ${collapsed ? 'w-[68px]' : 'w-64'}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-100 dark:border-surface-800 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">L</span>
        </div>
        {!collapsed && <span className="font-semibold text-lg tracking-tight">LedgerEngine</span>}
      </div>

      {/* Company Selector */}
      {!collapsed && selectedCompany && (
        <div className="px-3 py-3 border-b border-surface-100 dark:border-surface-800">
          <div className="relative">
            <button
              onClick={() => setShowCompanyMenu(!showCompanyMenu)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-xs text-surface-500 dark:text-surface-400">Company</p>
                <p className="text-sm font-medium truncate">{selectedCompany.name}</p>
              </div>
              <ChevronDown size={14} className={`text-surface-400 transition-transform shrink-0 ${showCompanyMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCompanyMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 card shadow-lg py-1 z-40 max-h-48 overflow-y-auto">
                {companies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { selectCompany(c); setShowCompanyMenu(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors ${c.id === selectedCompany.id ? 'text-primary-600 font-medium bg-primary-50 dark:bg-primary-500/10' : ''}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400'
                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200'
              }`
            }
          >
            <item.icon size={20} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-surface-100 dark:border-surface-800 p-3">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
              <span className="text-primary-700 dark:text-primary-400 text-sm font-semibold">
                {(user?.display_name || user?.username || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.display_name || user?.username}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-surface-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Logout">
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
