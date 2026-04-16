import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import StatCard from '../components/StatCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';
import { Calendar, Filter, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5', '#7c3aed', '#6d28d9', '#5b21b6', '#4338ca'];

export default function Dashboard() {
  const { selectedCompany } = useAuth();
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = { company_id: selectedCompany.id };
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const [s, m, c] = await Promise.all([
        api.getSummary(params),
        api.getMonthly({ company_id: selectedCompany.id, year }),
        api.getByCategory({ ...params, type: 'expense' })
      ]);
      setSummary(s);
      setMonthly(m);
      setByCategory(c);
    } catch (err) {
      console.error('Dashboard error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCompany, year, dateFrom, dateTo]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mb-4">
          <TrendingUp size={28} className="text-primary-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
        <p className="text-surface-500 dark:text-surface-400 max-w-sm">Create a company first from the Companies page, then select it from the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="input w-auto"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-surface-400" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-auto text-sm" placeholder="From" />
          <span className="text-surface-400">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-auto text-sm" placeholder="To" />
        </div>

        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-ghost text-xs">
            Clear dates
          </button>
        )}

        <button onClick={fetchData} className="btn-ghost p-2 ml-auto" title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Income" value={summary.total_income} type="income" prefix="₹" />
          <StatCard label="Total Expense" value={summary.total_expense} type="expense" prefix="₹" />
          <StatCard label="Net Balance" value={summary.net} type="net" prefix="₹" />
          <StatCard label="Transactions" value={summary.transaction_count} type="count" />
        </div>
      )}

      {/* Monthly Trend + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Chart */}
        <div className="lg:col-span-2 card p-5">
          <h3 className="text-sm font-semibold mb-4">Monthly Trend — {year}</h3>
          <div className="h-72">
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`₹${v.toLocaleString('en-IN')}`, '']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
                  <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2} name="Expense" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400 text-sm">No data for {year}</div>
            )}
          </div>
        </div>

        {/* Category Pie */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-4">Expense by Category</h3>
          <div className="h-72">
            {byCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="45%"
                    outerRadius={80}
                    innerRadius={50}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-surface-400 text-sm">No expense data</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {summary?.recent_transactions?.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <h3 className="text-sm font-semibold">Recent Transactions</h3>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {summary.recent_transactions.map(txn => (
              <div key={txn.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${txn.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
                    {txn.type === 'income' ? <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" /> : <TrendingDown size={16} className="text-red-500 dark:text-red-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{txn.description || txn.category_name || 'No description'}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500">{txn.date} • {txn.category_name || 'Uncategorized'}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${txn.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {txn.type === 'income' ? '+' : '-'}₹{parseFloat(txn.amount).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
