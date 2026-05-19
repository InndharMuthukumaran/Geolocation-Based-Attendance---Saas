import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4002/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Store for the current access token (set by App when user logs in or refreshes)
let accessToken = null;
let onLogout = null;

export const setAuthToken = (token) => {
  accessToken = token;
};

export const registerLogout = (fn) => {
  onLogout = fn;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    console.log('API Interceptor: Attaching token', accessToken.substring(0, 10) + '...');
    config.headers.Authorization = `Bearer ${accessToken}`;
  } else {
    console.warn('API Interceptor: No token available for request', config.url);
  }
  return config;
});

// On 401, clear token so auth state can update and user is sent to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      accessToken = null;
      if (onLogout) {
        onLogout();
      }
    }
    return Promise.reject(error);
  }
);

export default api;

