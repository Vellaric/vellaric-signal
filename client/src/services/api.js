import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth
export const authAPI = {
  login: (username, password) => api.post('/api/login', { username, password }),
  logout: () => api.post('/api/logout'),
  checkAuth: () => api.get('/api/auth/check'),
  changePassword: (currentPassword, newPassword) => 
    api.post('/api/auth/change-password', { currentPassword, newPassword }),
};

// Projects
export const projectsAPI = {
  getAll: () => api.get('/api/projects'),
  getById: (id) => api.get(`/api/projects/${id}`),
  create: (data) => api.post('/api/projects', data),
  update: (id, data) => api.put(`/api/projects/${id}`, data),
  delete: (id) => api.delete(`/api/projects/${id}`),
  deploy: (id, branch, commit) => api.post(`/api/projects/${id}/deploy`, { branch, commit }),
  getGitLabProjects: () => api.get('/api/projects/gitlab/list'),
};

// Deployments
export const deploymentsAPI = {
  getHistory: () => api.get('/api/deployments'),
  getActive: () => api.get('/api/deployments/active'),
  getById: (id) => api.get(`/api/deployments/${id}`),
  getLogs: (id) => api.get(`/api/deployments/${id}/logs`),
  getQueue: () => api.get('/api/queue'),
};

// Environment Variables
export const envAPI = {
  getAll: (projectId) => api.get(`/api/env/${projectId}`),
  create: (data) => api.post('/api/env', data),
  update: (id, data) => api.put(`/api/env/${id}`, data),
  delete: (id) => api.delete(`/api/env/${id}`),
};

// Containers
export const containersAPI = {
  getAll: () => api.get('/api/containers'),
  getStats: (name) => api.get(`/api/containers/${name}/stats`),
  getLogs: (name) => api.get(`/api/containers/${name}/logs`),
  start: (name) => api.post(`/api/containers/${name}/start`),
  stop: (name) => api.post(`/api/containers/${name}/stop`),
  restart: (name) => api.post(`/api/containers/${name}/restart`),
  remove: (name) => api.delete(`/api/containers/${name}`),
};

// Databases
export const databasesAPI = {
  getAll: () => api.get('/api/databases'),
  create: (data) => api.post('/api/databases', data),
  delete: (id) => api.delete(`/api/databases/${id}`),
};

export default api;
