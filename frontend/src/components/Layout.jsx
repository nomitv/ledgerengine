import { Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const pageTitles = {
  '/': 'Dashboard',
  '/transactions': 'Transactions',
  '/companies': 'Companies',
  '/settings': 'Settings'
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'FinTrack';

  return (
    <div className="min-h-screen flex">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${collapsed ? 'ml-[68px]' : 'ml-64'}`}>
        <TopBar title={title} onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
