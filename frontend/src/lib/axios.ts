// src/lib/axios.ts
import axios from 'axios'

// Browser requests stay on the Next.js origin. The matching Route Handlers
// authenticate the user and attach the server-only backend credential.
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

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
