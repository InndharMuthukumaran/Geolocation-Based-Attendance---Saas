import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import { useAuth } from '../App';
import MapPickerModal from '../components/MapPickerModal';
import GeofencePreviewMap from '../components/GeofencePreviewMap';
import FeedbackModal from '../components/FeedbackModal';

const SECTIONS = [
  { key: 'report', label: 'Forward Report', icon: '📤' },
  { key: 'geofence', label: 'Assign Geofence', icon: '📍' },
  { key: 'create', label: 'Create User', icon: '➕' },
  { key: 'users', label: 'User Management', icon: '👥' },
  { key: 'attendance', label: 'Team Attendance', icon: '📋' },
  { key: 'feedback', label: 'Give Feedback', icon: '💡' },
];

const ROLE_OPTIONS = [
  { value: 'SUB_MANAGER', label: 'Sub-Manager' },
  { value: 'MEMBER', label: 'Member' },
];

const RepresentativePage = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const [activeSection, setActiveSection] = useState('report');
  const fileInputRef = useRef(null);

  // Geofence
  const [geofences, setGeofences] = useState([]);
  const [gfForm, setGfForm] = useState({
    id: null,
    name: '',
    lat: null,
    lng: null,
    radiusMeters: '',
    isAttendanceEnabled: true,
    isAutoCheckoutEnabled: true,
    holidays: [],
    safeWindows: []
  });
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Unified creation
  const [createForm, setCreateForm] = useState({ name: '', jobTitle: '', email: '', role: 'MEMBER' });
  const [createStatus, setCreateStatus] = useState('');
  const [bulkStatus, setBulkStatus] = useState(null);

  // Users drill-down
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [parentStack, setParentStack] = useState([]);

  // Attendance
  const [attendance, setAttendance] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Submissions
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitStatus, setSubmitStatus] = useState('');
  const [mySubmissions, setMySubmissions] = useState([]);

  // ─── Data Loaders ───
  const loadGeofences = async () => { const res = await api.get('/admin/geofences'); setGeofences(res.data); };
  const loadUsers = async (pid = null) => {
    try { setLoadingUsers(true); const res = await api.get(pid ? `/admin/users?parentId=${pid}` : '/admin/users'); setUsers(res.data); }
    catch {} finally { setLoadingUsers(false); }
  };
  const loadAttendance = async () => {
    try { setLoadingAttendance(true); const res = await api.get('/admin/attendance/summary'); setAttendance(res.data); }
    catch {} finally { setLoadingAttendance(false); }
  };
  const loadMySubmissions = async () => { try { const res = await api.get('/submissions/me'); setMySubmissions(res.data); } catch {} };

  useEffect(() => { loadGeofences().catch(() => {}); loadUsers().catch(() => {}); loadAttendance().catch(() => {}); loadMySubmissions().catch(() => {}); }, []);

  // ─── Handlers ───
  const handleLocationSelect = (coords) => { setGfForm({ ...gfForm, lat: coords.lat, lng: coords.lng }); setShowMapPicker(false); };
  const handleDeleteGeofence = async (id) => { if (!window.confirm('Delete geofence?')) return; try { await api.delete(`/admin/geofences/${id}`); await loadGeofences(); } catch { alert('Failed'); } };
  
  const handleEditGeofence = (gf) => {
    setGfForm({
      id: gf._id,
      name: gf.name,
      lat: gf.center.lat,
      lng: gf.center.lng,
      radiusMeters: gf.radiusMeters,
      isAttendanceEnabled: gf.isAttendanceEnabled !== false,
      isAutoCheckoutEnabled: gf.isAutoCheckoutEnabled !== false,
      holidays: gf.holidays || [],
      safeWindows: gf.safeWindows || []
    });
    setActiveSection('geofence');
  };

  const handleGeofenceSubmit = async (e) => {
    e.preventDefault();
    if (!gfForm.lat || !gfForm.lng) { alert('Please pick a location on the map first.'); return; }
    const payload = {
      name: gfForm.name,
      center: { lat: gfForm.lat, lng: gfForm.lng },
      radiusMeters: Number(gfForm.radiusMeters),
      isAttendanceEnabled: gfForm.isAttendanceEnabled,
      isAutoCheckoutEnabled: gfForm.isAutoCheckoutEnabled,
      holidays: gfForm.holidays,
      safeWindows: gfForm.safeWindows
    };
    try {
      if (gfForm.id) { await api.put(`/admin/geofences/${gfForm.id}`, payload); }
      else { await api.post('/admin/geofences', payload); }
      setGfForm({ id: null, name: '', lat: null, lng: null, radiusMeters: '', isAttendanceEnabled: true, isAutoCheckoutEnabled: true, holidays: [], safeWindows: [] });
      await loadGeofences();
      alert(gfForm.id ? 'Site updated!' : 'Site deployed!');
    } catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateStatus('Creating...');
    try {
      await api.post('/admin/create-user', createForm);
      setCreateStatus(`${createForm.role === 'MEMBER' ? 'Member' : 'Sub-Manager'} created! Credentials sent to ${createForm.email}`);
      setCreateForm({ name: '', jobTitle: '', email: '', role: createForm.role });
      await loadUsers();
    } catch (err) { setCreateStatus(err.response?.data?.message || 'Failed'); }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkStatus({ loading: true });
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/admin/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBulkStatus(res.data);
      await loadUsers();
    } catch (err) { setBulkStatus({ error: err.response?.data?.message || 'Upload failed' }); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmission = async () => {
    try { setSubmitStatus('Submitting...'); await api.post('/submissions', { date: submissionDate }); setSubmitStatus('Successfully forwarded!'); await loadMySubmissions(); }
    catch (err) { setSubmitStatus(err.response?.data?.message || 'Submission failed'); }
  };

  const handleDrillDown = (u) => { setParentStack([...parentStack, { id: u._id, name: u.name }]); loadUsers(u._id); };
  const handleDrillUp = () => { const s = [...parentStack]; s.pop(); setParentStack(s); loadUsers(s.length > 0 ? s[s.length - 1].id : null); };
  const handleResetDevice = async (userId, email) => {
    if (!window.confirm(`Reset device binding for ${email}?`)) return;
    try { await api.post(`/admin/users/${userId}/reset-device`); alert('Device reset successful'); const pid = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null; await loadUsers(pid); }
    catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  const hasLocation = gfForm.lat !== null && gfForm.lng !== null;
  const hasRadius = gfForm.radiusMeters && Number(gfForm.radiusMeters) > 0;

  // ─── Section Renderers ───
  const renderReport = () => (
    <div className="card">
      <h2>Forward Daily Report</h2>
      <p className="muted">Submit your team's attendance status up to your direct superior.</p>
      <div className="form">
        <label>Report Date<input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} /></label>
        <button className="btn primary" onClick={handleSubmission}>Submit to Superior</button>
        {submitStatus && <div className="status" style={{fontWeight: 'bold', color: '#16a34a'}}>{submitStatus}</div>}
      </div>
      <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
        <h3>Sent Reports</h3>
        <div className="list">
          {mySubmissions.map(sub => (
            <div key={sub._id} className="list-item">
              <div><strong>{new Date(sub.date).toLocaleDateString()}</strong></div>
              <div className="muted">{new Date(sub.submittedAt).toLocaleString()}</div>
            </div>
          ))}
          {mySubmissions.length === 0 && <div className="muted small">No reports forwarded yet.</div>}
        </div>
      </div>
    </div>
  );

  const renderGeofence = () => (
    <div className="card geofence-card">
      <div className="section-header" style={{ marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Site Configuration & Geofencing</h2>
        <p className="muted small">Define boundaries and rules for your team. These settings apply to all subordinates assigned here.</p>
      </div>

      <form onSubmit={handleGeofenceSubmit} className="form" style={{ background: '#fcfcfd', padding: '1.5rem', borderRadius: '12px', border: '1px solid #edf2f7', marginBottom: '2rem' }}>
        <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#475569' }}>{gfForm.id ? 'Edit Site Settings' : 'Create New Site'}</h4>
        <label>Site Name<input value={gfForm.name} onChange={(e) => setGfForm({ ...gfForm, name: e.target.value })} required placeholder="e.g. Main Office, Downtown Campus" /></label>
        <div className="map-picker-section">
          <label>Geographic Boundary</label>
          {hasLocation ? (
            <div className="selected-coords">
              <span className="coord-badge">📍 {gfForm.lat.toFixed(6)}, {gfForm.lng.toFixed(6)}</span>
              <button type="button" className="btn" onClick={() => setShowMapPicker(true)}>Change Location</button>
            </div>
          ) : (
            <button type="button" className="btn primary pick-map-btn" onClick={() => setShowMapPicker(true)}>🗺️ Pick on Map</button>
          )}
        </div>
        <label>Radius (meters)<input type="number" min="1" value={gfForm.radiusMeters} onChange={(e) => setGfForm({ ...gfForm, radiusMeters: e.target.value })} placeholder="e.g. 200" required /></label>
        
        {/* Scheduling & Overrides Section */}
        <div className="form-section scheduling-section" style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '1.25rem', borderRadius: '8px', marginTop: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>🕒 Scheduling & Overrides</h3>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={gfForm.isAttendanceEnabled} onChange={(e) => setGfForm({ ...gfForm, isAttendanceEnabled: e.target.checked })} />
              Site Open for Attendance
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={gfForm.isAutoCheckoutEnabled} onChange={(e) => setGfForm({ ...gfForm, isAutoCheckoutEnabled: e.target.checked })} />
              Auto-Checkout Enabled
            </label>
          </div>

          <div className="sub-section">
            <h4 style={{ marginBottom: '0.5rem' }}>Holidays / Off Dates</h4>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '0.5rem' }}>
              <input type="date" id="new-holiday-date" className="input" style={{ flex: 1 }} />
              <button type="button" className="btn small" onClick={() => {
                const val = document.getElementById('new-holiday-date').value;
                if (val && !gfForm.holidays.includes(val)) {
                  setGfForm({ ...gfForm, holidays: [...gfForm.holidays, val].sort() });
                  document.getElementById('new-holiday-date').value = '';
                }
              }}>Add Date</button>
            </div>
            <div className="tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {gfForm.holidays.length > 0 ? gfForm.holidays.map(d => (
                <span key={d} className="tag" style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', color: '#1e293b' }}>
                  {d} <span style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }} onClick={() => setGfForm({ ...gfForm, holidays: gfForm.holidays.filter(h => h !== d) })}>×</span>
                </span>
              )) : <div className="muted small">No holidays scheduled yet.</div>}
            </div>
          </div>

          <div className="sub-section" style={{ marginTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Safe Windows (Pause Auto-Checkout)</h4>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.75rem', color: '#64748b' }}>Start<input type="time" id="sw-start" style={{ marginTop: '4px' }} /></label>
              <label style={{ flex: 1, fontSize: '0.75rem', color: '#64748b' }}>End<input type="time" id="sw-end" style={{ marginTop: '4px' }} /></label>
              <button type="button" className="btn small" onClick={() => {
                const s = document.getElementById('sw-start').value;
                const e = document.getElementById('sw-end').value;
                if (s && e) {
                  setGfForm({ ...gfForm, safeWindows: [...gfForm.safeWindows, { start: s, end: e }] });
                  document.getElementById('sw-start').value = '';
                  document.getElementById('sw-end').value = '';
                }
              }}>Add Window</button>
            </div>
            <div className="window-list">
              {gfForm.safeWindows.length > 0 ? gfForm.safeWindows.map((w, idx) => (
                <div key={idx} className="window-item" style={{ background: '#f0f9ff', padding: '8px 12px', borderRadius: '6px', marginBottom: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', border: '1px solid #bae6fd' }}>
                  <span>🔒 Safe from <strong>{w.start}</strong> to <strong>{w.end}</strong></span>
                  <span style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }} onClick={() => setGfForm({ ...gfForm, safeWindows: gfForm.safeWindows.filter((_, i) => i !== idx) })}>Remove</span>
                </div>
              )) : <div className="muted small">No safe windows defined.</div>}
            </div>
          </div>
        </div>

        {hasLocation && hasRadius && <GeofencePreviewMap center={{ lat: gfForm.lat, lng: gfForm.lng }} radiusMeters={Number(gfForm.radiusMeters)} />}
        <div style={{ marginTop: '2rem' }}>
          <button className="btn primary full-width large" type="submit">
            {gfForm.id ? '💾 Update Deployed Site' : '🚀 Deploy Geofence Site'}
          </button>
          {gfForm.id && (
            <button type="button" className="btn outline full-width" style={{ marginTop: '0.5rem' }} onClick={() => setGfForm({ id: null, name: '', lat: null, lng: null, radiusMeters: '', isAttendanceEnabled: true, isAutoCheckoutEnabled: true, holidays: [], safeWindows: [] })}>
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <div className="list-section">
        <h3 style={{ marginBottom: '1rem', color: '#1e293b' }}>📡 Deployed Geofences</h3>
        <div className="list">
          {geofences.map(gf => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isHolidayToday = gf.holidays?.includes(todayStr);
            return (
            <div key={gf._id} className="list-item" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#1e293b' }}>{gf.name}</div>
                  {gf.isAttendanceEnabled === false ? (
                    <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '12px', background: '#fee2e2', color: '#ef4444', fontWeight: 'bold' }}>🔴 Disabled</span>
                  ) : isHolidayToday ? (
                    <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', fontWeight: 'bold' }}>🏖️ Holiday</span>
                  ) : (
                    <span style={{ fontSize: '0.70rem', padding: '2px 8px', borderRadius: '12px', background: '#dcfce3', color: '#16a34a', fontWeight: 'bold' }}>🟢 Active Today</span>
                  )}
                </div>
                <div className="muted small" style={{ marginTop: '2px' }}>
                  {gf.center.lat.toFixed(6)}, {gf.center.lng.toFixed(6)} — {gf.radiusMeters}m 
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn small outline" onClick={() => handleEditGeofence(gf)} title="Adjust Settings">Edit</button>
                <button type="button" className="btn small warning" onClick={() => handleDeleteGeofence(gf._id)} title="Remove Site">Delete</button>
              </div>
            </div>
          )})}
          {geofences.length === 0 && <div className="muted small" style={{ textAlign: 'center', padding: '2rem' }}>No geofence sites currently deployed.</div>}
        </div>
      </div>
    </div>
  );

  const renderCreateUser = () => (
    <div className="card">
      <h2>Create User</h2>
      <form onSubmit={handleCreateUser} className="form">
        <label>
          Role
          <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5f5', fontSize: '0.9rem', fontFamily: 'inherit' }}>
            {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
        <label>Name<input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required placeholder="John Doe" /></label>
        <label>Job Title<input value={createForm.jobTitle} onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })} placeholder="e.g. Professor, Student" /></label>
        <label>Email<input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required placeholder="user@example.com" /></label>
        <button className="btn primary large" type="submit">Create {ROLE_OPTIONS.find(o => o.value === createForm.role)?.label}</button>
      </form>
      {createStatus && <div className="status" style={{ fontWeight: 'bold', color: '#16a34a', marginTop: '0.75rem' }}>{createStatus}</div>}

      <div style={{ marginTop: '2rem', borderTop: '2px dashed #e2e8f0', paddingTop: '1.5rem' }}>
        <h3>📤 Bulk Upload (Excel)</h3>
        <p className="muted small">Upload an Excel file with columns: <strong>Name</strong>, <strong>Email</strong>, <strong>Job Title</strong>, <strong>Role</strong> (SUB_MANAGER / MEMBER)</p>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} style={{ display: 'none' }} />
        <button className="btn primary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: '0.5rem' }}>📁 Upload Excel File</button>

        {bulkStatus && bulkStatus.loading && <div className="status" style={{ marginTop: '0.75rem' }}>⏳ Processing file...</div>}
        {bulkStatus && bulkStatus.error && <div className="error" style={{ marginTop: '0.75rem' }}>{bulkStatus.error}</div>}
        {bulkStatus && bulkStatus.success && (
          <div style={{ marginTop: '1rem' }}>
            <div className="status" style={{ color: '#16a34a', fontWeight: 'bold' }}>✅ {bulkStatus.success.length} created successfully</div>
            {bulkStatus.failed.length > 0 && (
              <div className="error" style={{ marginTop: '0.5rem' }}>
                <strong>❌ {bulkStatus.failed.length} failed:</strong>
                <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                  {bulkStatus.failed.map((f, i) => <li key={i}>{f.email}: {f.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>User Management{parentStack.length > 0 && <span style={{color: '#6366f1'}}> › Team of {parentStack[parentStack.length - 1].name}</span>}</h2>
        {parentStack.length > 0 && <button className="btn small outline" onClick={handleDrillUp}>⬅ Back Up</button>}
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Job Title</th><th>Device</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.jobTitle || '-'}</td>
                <td>{u.webauthn?.deviceBound ? '✅' : '❌'}</td>
                <td style={{display: 'flex', gap: '6px'}}>
                  {(u.role === 'MANAGER' || u.role === 'SUB_MANAGER') && <button className="btn small primary" onClick={() => handleDrillDown(u)}>View Team</button>}
                  <button className="btn small warning" onClick={() => handleResetDevice(u._id, u.email)} disabled={!u.webauthn?.deviceBound}>Reset</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div className="card">
      <div className="section-header">
        <h2>Team Attendance</h2>
        <button className="btn" onClick={loadAttendance} disabled={loadingAttendance}>{loadingAttendance ? '⏳ Loading…' : '🔄 Refresh'}</button>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Role</th><th>Check In</th><th>Check Out</th></tr></thead>
          <tbody>
            {attendance.map(row => (
              <tr key={row._id}>
                <td>{new Date(row.date).toLocaleDateString()}</td>
                <td>{row.user?.name}</td><td>{row.user?.email || '-'}</td><td>{row.user?.role || '-'}</td>
                <td>{row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString() : '-'}</td>
                <td>{row.checkOutTime ? new Date(row.checkOutTime).toLocaleTimeString() : '-'}</td>
              </tr>
            ))}
            {attendance.length === 0 && <tr><td colSpan={6} className="muted">No team attendance records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'report': return renderReport();
      case 'geofence': return renderGeofence();
      case 'create': return renderCreateUser();
      case 'users': return renderUsers();
      case 'attendance': return renderAttendance();
      case 'feedback':
        return (
          <div className="card">
            <h2>Send Feedback</h2>
            <p>Your suggestions help us improve the platform for everyone.</p>
            <button className="btn primary" onClick={() => setShowFeedbackModal(true)}>Open Feedback Form</button>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-title">Manager Dashboard</div>
        <div className="topbar-actions">
          <span className="muted">{user?.email}</span>
          <button className="btn" onClick={() => navigate('/employee')}>Log My Attendance</button>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </header>
      <div className="dashboard-layout">
        <nav className="dashboard-sidebar">
          <div className="sidebar-label">Navigation</div>
          {SECTIONS.map(s => (
            <button key={s.key} className={`sidebar-item ${activeSection === s.key ? 'active' : ''}`} onClick={() => setActiveSection(s.key)}>
              <span className="sidebar-icon">{s.icon}</span>{s.label}
            </button>
          ))}
        </nav>
        <main className="dashboard-content">{renderContent()}</main>
      </div>
      {showMapPicker && <MapPickerModal onSelect={handleLocationSelect} onClose={() => setShowMapPicker(false)} />}
      {showFeedbackModal && <FeedbackModal onClose={() => { setShowFeedbackModal(false); setActiveSection('report'); }} />}
    </div>
  );
};

export default RepresentativePage;
