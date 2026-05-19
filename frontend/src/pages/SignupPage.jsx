import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../App';

const SignupPage = () => {
  const [name, setName] = useState('');
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
      const res = await api.post('/auth/signup', { name, email: email.toLowerCase(), password });
      login(res.data);
      // Since signup forces ADMIN role:
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="card auth-card">
        <h1 className="title">Create Workspace</h1>
        <p className="muted" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          Sign up to create your own isolated Geolocation Attendance organization.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Organization / Admin Name
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Creating...' : 'Sign Up as Admin'}
          </button>
        </form>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <span className="muted small">Already have an account? </span>
          <Link to="/login" className="small" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
            Log in here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
