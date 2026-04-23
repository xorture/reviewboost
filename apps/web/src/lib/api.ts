import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// Attach JWT token from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;

// ─── Typed API helpers ────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/v1/auth/login', { email, password }),
  register: (data: Record<string, string>) =>
    api.post('/api/v1/auth/register', data),
  me: () => api.get('/api/v1/auth/me'),
};

export const feedbackApi = {
  getPage: (token: string) => api.get(`/api/v1/feedback/${token}`),
  rate: (token: string, score: number) =>
    api.post(`/api/v1/feedback/${token}/rate`, { score }),
  comment: (token: string, comment: string) =>
    api.post(`/api/v1/feedback/${token}/comment`, { comment }),
  getStats: () => api.get('/api/v1/feedback/dashboard/stats'),
  getNegativeFeed: (page = 1) =>
    api.get('/api/v1/feedback/dashboard/negative-feed', { params: { page } }),
};

export const customersApi = {
  list: (page = 1) => api.get('/api/v1/customers', { params: { page } }),
  create: (data: Record<string, string>) => api.post('/api/v1/customers', data),
  importCsv: (formData: FormData) =>
    api.post('/api/v1/customers/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const appointmentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/appointments', { params }),
  create: (data: Record<string, unknown>) => api.post('/api/v1/appointments', data),
  complete: (id: string) => api.patch(`/api/v1/appointments/${id}/complete`),
};

export const settingsApi = {
  get: () => api.get('/api/v1/settings'),
  update: (data: Record<string, unknown>) => api.patch('/api/v1/settings', data),
  previewTemplate: (template: string) =>
    api.post('/api/v1/settings/template/preview', { template }),
};

export const billingApi = {
  getSubscription: () => api.get('/api/v1/billing/subscription'),
  createCheckout: (plan: string) => api.post('/api/v1/billing/checkout', { plan }),
  createPortal: () => api.post('/api/v1/billing/portal'),
};

export const schedulerApi = {
  queueStats: () => api.get('/api/v1/scheduler/queue/stats'),
};
