import React, { useState } from 'react';
import api from '../services/api';

const FeedbackModal = ({ onClose }) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setStatus('Submitting...');
    try {
      await api.post('/feedback', { message });
      setStatus('Success! Your feedback has been sent to the creator.');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setStatus(err.response?.data?.message || 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000
    }}>
      <div className="modal-content" style={{
        background: '#fff', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '500px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
      }}>
        <h2 style={{marginTop: 0, color: '#1e293b'}}>Give Feedback</h2>
        <p className="muted small" style={{marginBottom: '1.5rem'}}>
          Have a suggestion or found a bug? Send it directly to the system creator.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 600}}>
            Your Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              placeholder="Tell us what can be improved..."
              style={{
                width: '100%', minHeight: '120px', padding: '10px', borderRadius: '8px',
                border: '1px solid #cbd5e1', marginTop: '5px', fontFamily: 'inherit', resize: 'vertical'
              }}
            />
          </label>
          <div style={{marginTop: '1.5rem', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
            <button type="button" className="btn outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy || !message.trim()}>
              {busy ? 'Sending...' : 'Send Feedback'}
            </button>
          </div>
        </form>
        {status && (
          <div style={{
            marginTop: '1rem', padding: '10px', borderRadius: '6px', fontSize: '0.85rem',
            background: status.includes('Success') ? '#dcfce3' : '#f1f5f9',
            color: status.includes('Success') ? '#16a34a' : '#475569',
            fontWeight: 'bold'
          }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
