// src/lib/axios.ts
import axios from 'axios'

// InfraMind's FastAPI backend serves routes at the root (no /api prefix) —
// see backend/main.py. Default matches the local docker-compose port.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Request interceptor — inject the Bearer token every non-agent backend
// route requires (see backend/dependencies.py:require_bearer). There's no
// login flow here; localStorage['infra_token'] lets a user override it at
// runtime (devtools), falling back to NEXT_PUBLIC_API_TOKEN so the app
// works out of the box against a backend's API_SECRET_KEY.
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('infra_token') ?? process.env.NEXT_PUBLIC_API_TOKEN
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor — normalize errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = {
      code: error.response?.status?.toString() ?? 'NETWORK_ERROR',
      message: error.response?.data?.message ?? error.message ?? 'Unknown error',
      details: error.response?.data,
    }
    return Promise.reject(apiError)
  }
)

export default api
