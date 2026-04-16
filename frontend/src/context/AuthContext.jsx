import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const initAuth = useCallback(async () => {
    const token = localStorage.getItem('fintrack_token');
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.me();
      setUser(data.user);
      setCompanies(data.companies);
      const savedCompany = localStorage.getItem('fintrack_company');
      if (savedCompany) {
        const found = data.companies.find(c => c.id === parseInt(savedCompany));
        setSelectedCompany(found || data.companies[0] || null);
      } else {
        setSelectedCompany(data.companies[0] || null);
      }
    } catch {
      localStorage.removeItem('fintrack_token');
    }
    setLoading(false);
  }, []);

  useEffect(() => { initAuth(); }, [initAuth]);

  const login = async (username, password) => {
    const data = await api.login(username, password);
    localStorage.setItem('fintrack_token', data.token);
    setUser(data.user);
    setCompanies(data.companies);
    setSelectedCompany(data.companies[0] || null);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('fintrack_token');
    localStorage.removeItem('fintrack_company');
    setUser(null);
    setCompanies([]);
    setSelectedCompany(null);
  };

  const selectCompany = (company) => {
    setSelectedCompany(company);
    if (company) localStorage.setItem('fintrack_company', company.id);
  };

  const refreshCompanies = async () => {
    const data = await api.me();
    setCompanies(data.companies);
    if (selectedCompany) {
      const found = data.companies.find(c => c.id === selectedCompany.id);
      setSelectedCompany(found || data.companies[0] || null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, companies, selectedCompany, loading,
      login, logout, selectCompany, refreshCompanies
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
