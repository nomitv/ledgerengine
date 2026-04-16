const BASE = '/api';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('fintrack_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function authHeaders() {
  const headers = {};
  const token = localStorage.getItem('fintrack_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: options.body instanceof FormData ? authHeaders() : getHeaders(),
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getUsers: () => request('/auth/users'),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),

  // Companies
  getCompanies: () => request('/companies'),
  createCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id, data) => request(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),
  getCompanyUsers: (id) => request(`/companies/${id}/users`),
  addCompanyUser: (id, data) => request(`/companies/${id}/users`, { method: 'POST', body: JSON.stringify(data) }),
  removeCompanyUser: (companyId, userId) => request(`/companies/${companyId}/users/${userId}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/transactions?${qs}`);
  },
  createTransaction: (formData) => request('/transactions', { method: 'POST', body: formData }),
  updateTransaction: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  uploadAttachment: (id, formData) => request(`/transactions/${id}/attachments`, { method: 'POST', body: formData }),

  // Categories & Tags
  getCategories: (companyId) => request(`/transactions/categories?company_id=${companyId}`),
  createCategory: (data) => request('/transactions/categories', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/transactions/categories/${id}`, { method: 'DELETE' }),
  getTags: (companyId) => request(`/transactions/tags?company_id=${companyId}`),
  createTag: (data) => request('/transactions/tags', { method: 'POST', body: JSON.stringify(data) }),
  deleteTag: (id) => request(`/transactions/tags/${id}`, { method: 'DELETE' }),

  // Dashboard
  getSummary: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/summary?${qs}`);
  },
  getMonthly: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/monthly?${qs}`);
  },
  getByCategory: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/by-category?${qs}`);
  },
  getByTag: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/dashboard/by-tag?${qs}`);
  }
};
