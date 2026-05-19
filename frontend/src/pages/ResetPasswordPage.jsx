import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email,
        token,
        newPassword: password,
      });
      setMessage(res.data.message);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Token might be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="page centered">
        <div className="card auth-card">
          <h1 className="title">Invalid Link</h1>
          <p className="errorText">This password reset link is missing required information.</p>
          <Link to="/forgot-password" style={{ marginTop: '1rem' }}>Request new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page centered">
      <div className="card auth-card">
        <h1 className="title">Choose New Password</h1>
        <p className="muted small" style={{ marginBottom: '1.5rem' }}>
          Resetting password for <strong>{email}</strong>
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            New Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label>
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          {message && <div className="status" style={{ color: '#16a34a', fontWeight: 'bold' }}>{message} Redirecting to login...</div>}
          <button type="submit" className="btn primary full-width" disabled={loading}>
            {loading ? 'Updating...' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
