import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const VerifyPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState('verifying');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token found in the URL.');
      return;
    }
    const verify = async () => {
      try {
        const url = email ? `/auth/verify/${token}?email=${encodeURIComponent(email)}` : `/auth/verify/${token}`;
        const res = await api.get(url);
        setData(res.data);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(err.response?.data?.message || 'Verification failed. The link may be invalid or expired.');
      }
    };
    verify();
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 100%)', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '2.5rem', maxWidth: '420px', width: '100%', boxShadow: '0 8px 32px rgba(99,102,241,0.10)', textAlign: 'center' }}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <h2>Verifying your email...</h2>
            <p style={{ color: '#6b7280' }}>Please wait while we activate your account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ color: '#16a34a' }}>{data?.alreadyVerified ? 'Already Verified!' : 'Email Verified!'}</h2>
            <p style={{ color: '#374151', marginTop: '0.5rem' }}>
              {data?.alreadyVerified
                ? 'Your email has already been verified. You can log in.'
                : `Welcome, ${data?.name || 'User'}! Your account is now active.`}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                marginTop: '1.5rem', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 'bold',
                fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Go to Login
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
            <h2 style={{ color: '#dc2626' }}>Verification Failed</h2>
            <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>{error}</p>
            <button
              onClick={() => navigate('/login')}
              style={{
                marginTop: '1.5rem', padding: '0.75rem 2rem', borderRadius: '0.5rem', border: 'none',
                background: '#e5e7eb', color: '#374151', fontWeight: 'bold',
                fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyPage;
