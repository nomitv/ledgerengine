import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Menu, Search } from 'lucide-react';
import { useState } from 'react';

export default function TopBar({ title, onToggleSidebar }) {
  const { dark, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="h-16 flex items-center justify-between gap-4 px-6 border-b border-surface-200 dark:border-surface-800 bg-white/80 dark:bg-surface-900/80 backdrop-blur-lg sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="btn-ghost p-2 lg:hidden">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={toggleTheme} className="btn-ghost p-2" title={dark ? 'Light mode' : 'Dark mode'}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
