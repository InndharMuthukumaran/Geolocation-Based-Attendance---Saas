import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../App';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.toLowerCase(), password });
      login(res.data);
      const role = res.data.user.role;
      if (role === 'ADMIN') navigate('/admin');
      else if (role === 'MEMBER') navigate('/employee');
      else if (role === 'MANAGER') navigate('/representative');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card auth-card">
        <h1 className="title">Geolocation Attendance</h1>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: '#6366f1', textDecoration: 'none' }}>
              Forgot Password?
            </Link>
          </div>
        </form>
        <div className="auth-footer">
          Don't have an admin account? <Link to="/signup">Sign up here</Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

