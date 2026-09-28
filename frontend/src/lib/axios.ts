// src/lib/axios.ts
import axios from 'axios'

// HIMADRI's FastAPI backend keeps compatibility routes at the root while the
// documented API is also exposed under /api/v1. The deployed backend is the
// default; NEXT_PUBLIC_API_BASE_URL can still point at a local development API.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://himadri.aus1in.me/api/v1',
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
