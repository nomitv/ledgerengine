import { TrendingUp, TrendingDown, Wallet, Hash } from 'lucide-react';

const iconMap = {
  income: TrendingUp,
  expense: TrendingDown,
  net: Wallet,
  count: Hash
};

const colorMap = {
  income: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  expense: 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10',
  net: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10',
  count: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10'
};

export default function StatCard({ label, value, type = 'net', prefix = '' }) {
  const Icon = iconMap[type] || Wallet;
  const color = colorMap[type] || colorMap.net;

  return (
    <div className="card p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-1">{label}</p>
          <p className="text-2xl font-bold tracking-tight">
            {prefix}{typeof value === 'number' ? value.toLocaleString('en-IN', { minimumFractionDigits: type === 'count' ? 0 : 2, maximumFractionDigits: 2 }) : value}
          </p>
        </div>
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
