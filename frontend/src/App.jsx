import React, { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api, { setAuthToken, registerLogout } from './services/api';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AdminPage from './pages/AdminPage';
import EmployeePage from './pages/EmployeePage';
import RepresentativePage from './pages/RepresentativePage';
import VerifyPage from './pages/VerifyPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Debug logging - commented out for production
  /*
  useEffect(() => {
    console.log('AuthProvider state:', JSON.stringify({ user, hasAccessToken: !!accessToken, loading }, null, 2));
  }, [user, accessToken, loading]);
  */

  useEffect(() => {
    const refresh = async () => {
      // Don't refresh if we already have a token (e.g. from immediate login)
      if (accessToken) {
        console.log('AuthProvider: skipping refresh, already have token');
        setLoading(false);
        return;
      }

      console.log('AuthProvider: starting refresh...');
      try {
        const res = await api.post('/auth/refresh');
        console.log('AuthProvider: refresh success', res.data);
        setAuthToken(res.data.accessToken); // Ensure token is synced immediately before child components mount
        setUser(res.data.user);
        setAccessToken(res.data.accessToken);
      } catch (err) {
        console.error('AuthProvider: refresh failed', err.response?.status, err.message);
        setUser(null);
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    };
    refresh();
  }, []); // Run only on mount

  const login = (data) => {
    console.log('Login called, syncing token immediately');
    setAuthToken(data.accessToken); // Ensure token is set before any child components render or fetch
    setUser(data.user);
    setAccessToken(data.accessToken);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setAccessToken(null);
  };

  useEffect(() => {
    registerLogout(logout);
  }, []);

  const value = { user, accessToken, login, logout, loading, setUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const ProtectedRoute = ({ roles, children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;

  return children;
};

const RoleRedirect = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) navigate('/login', { replace: true });
      else if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'MEMBER') navigate('/employee', { replace: true });
      else if (user.role === 'MANAGER' || user.role === 'SUB_MANAGER')
        navigate('/representative', { replace: true });
    }
  }, [user, loading, navigate]);

  return <div className="centered">Redirecting...</div>;
};

const App = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee"
          element={
            <ProtectedRoute roles={['MEMBER', 'MANAGER']}>
              <EmployeePage />
            </ProtectedRoute>
          }
        />
          <Route
            path="/representative"
            element={
              <ProtectedRoute roles={['MANAGER', 'SUB_MANAGER']}>
                <RepresentativePage />
              </ProtectedRoute>
            }
          />
        <Route path="/*" element={<RoleRedirect />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
