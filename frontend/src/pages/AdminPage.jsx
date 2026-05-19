import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import { useAuth } from '../App';
import MapPickerModal from '../components/MapPickerModal';
import GeofencePreviewMap from '../components/GeofencePreviewMap';
import FeedbackModal from '../components/FeedbackModal';

const SECTIONS = [
  { key: 'geofence', label: 'Geofence', icon: '📍' },
  { key: 'create', label: 'Create User', icon: '➕' },
  { key: 'users', label: 'User Management', icon: '👥' },
  { key: 'direct', label: 'Direct Attendance', icon: '📋' },
  { key: 'inbox', label: 'Daily Reports', icon: '📬' },
  { key: 'feedback', label: 'Give Feedback', icon: '💡' },
  { key: 'maintenance', label: 'Maintenance', icon: '🧹' },
];

const ROLE_OPTIONS = [
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SUB_MANAGER', label: 'Sub-Manager' },
  { value: 'MEMBER', label: 'Member' },
];

const AdminPage = () => {
  const { logout, user } = useAuth();
  if (!user) return null;



  const [activeSection, setActiveSection] = useState('geofence');
  const [cleanupStatus, setCleanupStatus] = useState('');
  const fileInputRef = useRef(null);

  // Geofence
  const [geofences, setGeofences] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
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
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Unified user creation
  const [createForm, setCreateForm] = useState({ name: '', jobTitle: '', email: '', role: 'MANAGER' });
  const [createStatus, setCreateStatus] = useState('');
  const [bulkStatus, setBulkStatus] = useState(null);

  // Users
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [parentStack, setParentStack] = useState([]);

  // Direct Attendance
  const [directAttendance, setDirectAttendance] = useState([]);
  const [loadingDirect, setLoadingDirect] = useState(false);

  // Inbox
  const [inbox, setInbox] = useState({});
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [viewMode, setViewMode] = useState('table');
  const [selectedUserId, setSelectedUserId] = useState(null);

  // ─── Data Loaders ───
  const loadGeofences = async () => { const res = await api.get('/admin/geofences'); setGeofences(res.data); };
  const loadUsers = async (pid = null) => {
    try { setLoadingUsers(true); const res = await api.get(pid ? `/admin/users?parentId=${pid}` : '/admin/users'); setUsers(res.data); }
    catch {} finally { setLoadingUsers(false); }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Delete all accounts that failed to verify within 15 days?')) return;
    try {
      setCleanupStatus('Cleaning up...');
      const res = await api.post('/admin/cleanup-expired');
      setCleanupStatus(res.data.message);
    } catch {
      setCleanupStatus('Cleanup failed.');
    }
  };
  const loadDirectAttendance = async () => {
    try { setLoadingDirect(true); const res = await api.get('/admin/attendance/summary'); setDirectAttendance(res.data); }
    catch {} finally { setLoadingDirect(false); }
  };
  const loadInbox = async () => {
    try {
      setLoadingInbox(true);
      const res = await api.get('/submissions/incoming');
      const grouped = res.data.reduce((acc, sub) => { const d = new Date(sub.date).toLocaleDateString(); if (!acc[d]) acc[d] = []; acc[d].push(sub); return acc; }, {});
      setInbox(grouped); setViewingReport(null);
    } catch {} finally { setLoadingInbox(false); }
  };

  useEffect(() => { loadGeofences().catch(() => {}); loadUsers().catch(() => {}); loadDirectAttendance().catch(() => {}); loadInbox().catch(() => {}); }, []);

  // ─── Handlers ───
  const handleLocationSelect = (coords) => { setGfForm({ ...gfForm, lat: coords.lat, lng: coords.lng }); setShowMapPicker(false); };
  const handleEditGeofence = (gf) => {
    setGfForm({
      id: gf._id,
      name: gf.name,
      lat: gf.center.lat,
      lng: gf.center.lng,
      radiusMeters: gf.radiusMeters,
      isAttendanceEnabled: gf.isAttendanceEnabled !== undefined ? gf.isAttendanceEnabled : true,
      isAutoCheckoutEnabled: gf.isAutoCheckoutEnabled !== undefined ? gf.isAutoCheckoutEnabled : true,
      holidays: gf.holidays || [],
      safeWindows: gf.safeWindows || []
    });
  };
  const handleDeleteGeofence = async (id) => { if (!window.confirm('Delete this geofence?')) return; try { await api.delete(`/admin/geofences/${id}`); await loadGeofences(); } catch { alert('Failed'); } };
  const handleGeofenceSubmit = async (e) => {
    e.preventDefault();
    if (!gfForm.lat || !gfForm.lng) { alert('Please pick a location on the map first.'); return; }
    try { 
      const payload = { 
        name: gfForm.name, 
        center: { lat: gfForm.lat, lng: gfForm.lng }, 
        radiusMeters: Number(gfForm.radiusMeters),
        isAttendanceEnabled: gfForm.isAttendanceEnabled,
        isAutoCheckoutEnabled: gfForm.isAutoCheckoutEnabled,
        holidays: gfForm.holidays,
        safeWindows: gfForm.safeWindows
      };
      if (gfForm.id) {
        await api.put(`/admin/geofences/${gfForm.id}`, payload);
      } else {
        await api.post('/admin/geofences', payload);
      }
      setGfForm({ 
        id: null,
        name: '', lat: null, lng: null, radiusMeters: '', 
        isAttendanceEnabled: true, isAutoCheckoutEnabled: true, 
        holidays: [], safeWindows: [] 
      }); 
      await loadGeofences(); 
    }
    catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateStatus('Creating...');
    try {
      await api.post('/admin/create-user', createForm);
      const roleLabel = ROLE_OPTIONS.find(o => o.value === createForm.role)?.label || 'User';
      setCreateStatus(`${roleLabel} created! Credentials sent to ${createForm.email}`);
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

  const handleDrillDown = (u) => { setParentStack([...parentStack, { id: u._id, name: u.name }]); loadUsers(u._id); };
  const handleDrillUp = () => { const s = [...parentStack]; s.pop(); setParentStack(s); loadUsers(s.length > 0 ? s[s.length - 1].id : null); };
  const handleResetDevice = async (userId, email) => {
    if (!window.confirm(`Reset device binding for ${email}?`)) return;
    try { await api.post(`/admin/users/${userId}/reset-device`); alert('Device reset successful'); const pid = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null; await loadUsers(pid); }
    catch (err) { alert(err.response?.data?.message || 'Failed'); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${u.name} (${u.email}) and all their attendance records?`)) return;
    try {
      await api.delete(`/admin/users/${u._id}`);
      const pid = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      await loadUsers(pid);
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleRequestReset = async (u) => {
    if (!window.confirm(`Send a password reset link to ${u.email}?`)) return;
    try {
      const res = await api.post(`/admin/users/${u._id}/request-reset`);
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || 'Request failed');
    }
  };

  const viewReportLog = async (sub) => {
    try { const d = new Date(sub.date).toISOString(); const res = await api.get(`/admin/attendance/summary?managerId=${sub.submittedBy._id}&from=${d}&to=${d}`); setViewingReport({ managerName: sub.submittedBy.name, dateStr: new Date(sub.date).toLocaleDateString(), data: res.data }); setViewMode('table'); }
    catch { alert('Failed to fetch report'); }
  };

  const handleExportAttendance = async () => {
    try { const res = await api.get('/admin/attendance/export', { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'attendance_logs.xlsx'); document.body.appendChild(link); link.click(); link.remove(); }
    catch { alert('Failed to export'); }
  };

  const hasLocation = gfForm.lat !== null && gfForm.lng !== null;
  const hasRadius = gfForm.radiusMeters && Number(gfForm.radiusMeters) > 0;

  // ─── Section Renderers ───
  const renderGeofence = () => (
    <div className="card geofence-card">
      <div className="section-header" style={{ marginBottom: '1.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>Site Configuration & Geofencing</h2>
        <p className="muted small">Define your physical boundaries and operational schedules here. These settings apply to all staff members assigned to the site.</p>
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
        <label>Job Title<input value={createForm.jobTitle} onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })} placeholder="e.g. HOD, Professor, Student" /></label>
        <label>Email<input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required placeholder="user@example.com" /></label>
        <button className="btn primary large" type="submit">Create {ROLE_OPTIONS.find(o => o.value === createForm.role)?.label}</button>
      </form>
      {createStatus && <div className="status" style={{ fontWeight: 'bold', color: '#16a34a', marginTop: '0.75rem' }}>{createStatus}</div>}

      <div style={{ marginTop: '2rem', borderTop: '2px dashed #e2e8f0', paddingTop: '1.5rem' }}>
        <h3>📤 Bulk Upload (Excel)</h3>
        <p className="muted small">Upload an Excel file with columns: <strong>Name</strong>, <strong>Email</strong>, <strong>Job Title</strong>, <strong>Role</strong> (MANAGER / SUB_MANAGER / MEMBER)</p>
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
                <td style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                  {(u.role === 'MANAGER' || u.role === 'SUB_MANAGER') && <button className="btn small primary" onClick={() => handleDrillDown(u)}>View Team</button>}
                  <button className="btn small outline" onClick={() => { setSelectedUserId(u._id); setViewMode('analytics'); setActiveSection('inbox'); }}>Analyse</button>
                  <button className="btn small warning" onClick={() => handleRequestReset(u)}>Reset Pass</button>
                  <button className="btn small warning outline" onClick={() => handleResetDevice(u._id, u.email)} disabled={!u.webauthn?.deviceBound}>Reset Device</button>
                  <button className="btn small danger" onClick={() => handleDeleteUser(u)}>Delete</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDirectAttendance = () => (
    <div className="card">
      <div className="section-header">
        <h2>Direct Team Attendance (Today)</h2>
        <button className="btn" onClick={loadDirectAttendance} disabled={loadingDirect}>{loadingDirect ? '⏳ Loading…' : '🔄 Refresh'}</button>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Check In</th><th>Check Out</th></tr></thead>
          <tbody>
            {directAttendance.map(row => (
              <tr key={row._id}>
                <td>{row.user?.name}</td><td>{row.user?.email || '-'}</td><td>{row.user?.role}</td>
                <td>{row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString() : '-'}</td>
                <td>{row.checkOutTime ? new Date(row.checkOutTime).toLocaleTimeString() : '-'}</td>
              </tr>
            ))}
            {directAttendance.length === 0 && <tr><td colSpan={5} className="muted">No attendance logs today.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="card">
      <div className="section-header">
        <h2>
          {viewMode === 'analytics' ? 'Employee Analytics' : 
           viewingReport ? `Report: ${viewingReport.managerName} (${viewingReport.dateStr})` : 
           'Daily Reports Inbox'}
        </h2>
        <div className="section-actions">
          {viewMode === 'analytics' && (
            <button className="btn outline" onClick={() => { setViewMode('table'); if (!viewingReport) setActiveSection('users'); }}>
              ⬅ Back
            </button>
          )}
          {viewingReport && viewMode !== 'analytics' && (
            <button className="btn outline" onClick={() => setViewingReport(null)}>
              ⬅ Back to Inbox
            </button>
          )}
          <button className="btn" onClick={handleExportAttendance}>📥 Export Excel</button>
          <button className="btn" onClick={loadInbox} disabled={loadingInbox}>{loadingInbox ? '⏳' : '🔄 Refresh'}</button>
        </div>
      </div>
      {viewMode === 'analytics' ? (
        <AnalyticsDashboard role="ADMIN" userId={selectedUserId} />
      ) : (
        <>
          {!viewingReport ? (
            <div style={{ marginTop: '1rem' }}>
              {Object.keys(inbox).length === 0 && <div className="muted">No reports forwarded yet.</div>}
              {Object.keys(inbox).map(dateStr => (
                <div key={dateStr} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>{dateStr}</h3>
                  <div className="list" style={{ marginTop: '0.75rem' }}>
                    {inbox[dateStr].map(sub => (
                      <div key={sub._id} className="list-item">
                        <div><strong>{sub.submittedBy?.name}</strong> <span className="muted">({sub.submittedBy?.jobTitle || sub.submittedBy?.role})</span><div className="muted small">Submitted at {new Date(sub.submittedAt).toLocaleTimeString()}</div></div>
                        <button className="btn small primary" onClick={() => viewReportLog(sub)}>View Report</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Check In</th><th>Check Out</th><th>Actions</th></tr></thead>
                <tbody>
                  {viewingReport.data.map(row => (
                    <tr key={row._id}>
                      <td>{row.user?.name}</td><td>{row.user?.email || '-'}</td>
                      <td>{row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString() : '-'}</td>
                      <td>{row.checkOutTime ? new Date(row.checkOutTime).toLocaleTimeString() : '-'}</td>
                      <td><button className="btn small" onClick={() => { setSelectedUserId(row.user?._id); setViewMode('analytics'); }}>Analyse</button></td>
                    </tr>
                  ))}
                  {viewingReport.data.length === 0 && <tr><td colSpan={5} className="muted">No attendance logs in this report.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'geofence': return renderGeofence();
      case 'create': return renderCreateUser();
      case 'users': return renderUsers();
      case 'direct': return renderDirectAttendance();
      case 'inbox': return renderInbox();
      case 'maintenance':
        return (
          <div className="card">
            <h2>Organization Maintenance</h2>
            <div className="notice" style={{ marginBottom: '1.5rem' }}>
              Keep your database clean by removing abandoned accounts that haven't verified their email within the 15-day grace period.
            </div>
            <div className="form">
              <button className="btn warning" onClick={handleCleanup}>
                🧹 Purge Expired Unverified Accounts
              </button>
              {cleanupStatus && <div className="status">{cleanupStatus}</div>}
            </div>
          </div>
        );
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
        <div className="topbar-title">Admin Dashboard</div>
        <div className="topbar-actions">
          <span className="muted">{user?.email}</span>
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
      {showFeedbackModal && <FeedbackModal onClose={() => { setShowFeedbackModal(false); setActiveSection('geofence'); }} />}
    </div>
  );
};

export default AdminPage;
